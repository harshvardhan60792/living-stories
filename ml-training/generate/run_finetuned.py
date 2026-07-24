"""Plan 4 Task 8 — generate a pack with the fine-tuned 3B (base + LoRA adapter).

Loads Qwen2.5-3B-Instruct + the trained adapter, then walks the same node-by-node
frontier the TS harness does: for each unfilled slot it builds a grounded prompt
(bible digest + running state-summary + target slot + schema bounds + a couple
exemplars), generates ONE node's JSON, extracts it, and enqueues the nodes its
edges point to. Assembles a candidate StoryPack and writes it out. Bring the JSON
back to the repo and run it through the real TS validator (packs.valid) + curate.

Kaggle cell (same T4 session as training, adapter already on the Hub):
    !wget -q -O run_finetuned.py https://raw.githubusercontent.com/harshvardhan60792/living-stories/main/ml-training/generate/run_finetuned.py
    !wget -q -O seventh-guest.bible.json https://raw.githubusercontent.com/harshvardhan60792/living-stories/main/ml-training/bibles/seventh-guest.bible.json
    !wget -q -O exemplars.jsonl https://raw.githubusercontent.com/harshvardhan60792/living-stories/main/ml-training/generate/exemplars.jsonl
    !python run_finetuned.py
"""
import os, json, re

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
BASE = "Qwen/Qwen2.5-3B-Instruct"
ADAPTER = "Harsh-ag26/living-stories-generator-lora"
MAXNODES = 16
# USE_ADAPTER=0 -> base 3B + few-shot only (no fine-tune), to A/B the adapter.
USE_ADAPTER = os.environ.get("USE_ADAPTER", "1") != "0"
# Sampling + repetition_penalty kill the greedy repetition loops the adapter fell
# into; SEED keeps a run reproducible.
TEMP = float(os.environ.get("GEN_TEMP", "0.7"))
REP_PENALTY = float(os.environ.get("GEN_REP", "1.3"))
SYS = ("You author ONE node of a branching interactive-fiction story as strict "
       "JSON. Return ONLY the JSON object for the single node — no prose, no "
       "markdown fence.")
TONE = ("empathetic, aggressive, deceptive, reassuring, defiant, cold, submissive, "
        "curious, threatening, apologetic, dismissive, sincere, evasive, calm")

HF_TOKEN = os.environ.get("HF_TOKEN")
if not HF_TOKEN:
    try:
        from kaggle_secrets import UserSecretsClient
        HF_TOKEN = UserSecretsClient().get_secret("HF_TOKEN")
    except Exception:
        pass


def load_bible(p="seventh-guest.bible.json"):
    return json.load(open(p, encoding="utf-8"))


def load_exemplars(p="exemplars.jsonl", n=3):
    rows = []
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    # one action + one dialogue + one ending, for shape coverage
    pick = []
    for want in ("action", "dialogue"):
        for r in rows:
            if json.loads(r["completion"]).get("type") == want and r not in pick:
                pick.append(r); break
    for r in rows:
        if len(pick) >= n: break
        if r not in pick: pick.append(r)
    return pick[:n]


def digest(b):
    chars = "; ".join(f"{c['name']} ({c['role']}) — {c['voice']}" for c in b["characters"])
    meters = ", ".join(f"{k}={v or '(hidden)'}" for k, v in b["meterTheming"].items())
    ends = "\n  ".join(f"{e['id']}: {e['label']} — {e['summary']}" for e in b["endings"])
    return (f"TITLE: {b['title']}  GENRE: {b['genre']}\nPREMISE: {b['premise']}\n"
            f"THE TRUTH (hidden, reveal gradually): {b['theTruth']}\nTONE: {b['tone']}\n"
            f"CHARACTERS: {chars}\nMETERS: {meters}\n"
            f"NODE BUDGET: depth {b['nodeBudget']['minDepth']}-{b['nodeBudget']['maxDepth']}\n"
            f"ENDINGS (reach each by a choice/stance edge with nextId:null, tagged with an `ending` label):\n  {ends}")


BOUNDS = f"""- type must be "action" or "dialogue".
- action nodes: 3-6 choices, each {{ id, text, toneTag?, edges }} — prefer richer branching over binary choices.
- dialogue nodes: 2-4 stances {{ id, anchorPhrasings[], npcResponse, toneTag?, edges }} + a fallbackStanceId naming one of them.
- every node: non-empty textVariants[] ({{ text, when? }}); prose in the bible's voice.
- edges: [{{ when?: {{ROLE:'low'|'mid'|'high'}}, nextId }}]; nextId is another node id or null (an ending). Always include one edge with no `when` as a fallback.
- toneTag (optional) from: {TONE}.
- when-conditions use only roles: RAPPORT, VOLATILITY, PRESSURE, INSIGHT.
- An ENDING is a choice/stance whose edge has "nextId": null. At least one path must reach one. End nodes must NOT loop back to other nodes.
- The bible's ending summaries are AUTHOR GUIDANCE ONLY — write fresh in-scene prose; never copy a summary into any text or choice."""


def build_prompt(b, summary, slot, ex):
    inc = "; ".join(f"from \"{e['from']}\" via {e['via']}" for e in slot["incoming"]) or \
          ("(this is the START node)" if slot["start"] else "(no incoming edges yet)")
    exs = "\n".join(f"--- EXEMPLAR {i+1} ---\nPROMPT: {e['prompt']}\nNODE JSON: {e['completion']}"
                    for i, e in enumerate(ex))
    return "\n".join([
        "=== STORY BIBLE ===", digest(b), "",
        "=== STORY SO FAR ===", summary or "(none yet — first node)", "",
        "=== TARGET NODE ===",
        f'Target node id: "{slot["id"]}" (use exactly this id)',
        f"Incoming: {inc}",
        f"Open on: {b['startSituation']}" if slot["start"] else "",
        "", "=== SCHEMA BOUNDS (hard) ===", BOUNDS, "",
        "=== EXEMPLARS ===", exs, "",
        f'Now emit the JSON node for id "{slot["id"]}".',
    ])


def extract_json(raw):
    s, e = raw.find("{"), raw.rfind("}")
    if s == -1 or e < s:
        raise ValueError("no JSON object")
    return raw[s:e + 1]


def out_edges(node):
    carriers = ([( c["id"], c.get("edges", [])) for c in node.get("choices", [])]
                if node.get("type") == "action"
                else [(s["id"], s.get("edges", [])) for s in node.get("stances", [])])
    return [(via, ed.get("nextId")) for via, edges in carriers for ed in edges]


def summarize(filled):
    out = []
    for n in filled.values():
        t = (n.get("textVariants") or [{}])[0].get("text", "")
        t = t[:90] + "…" if len(t) > 90 else t
        outs = ", ".join(f"{v}->{nid or 'END'}" for v, nid in out_edges(n))
        out.append(f"- {n['id']} ({n.get('type')}): \"{t}\" [{outs}]")
    return "\n".join(out)


def main():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    tok = AutoTokenizer.from_pretrained(BASE, token=HF_TOKEN)
    try:
        model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float16, device_map={"": 0}, token=HF_TOKEN)
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16, device_map={"": 0}, token=HF_TOKEN)
    if USE_ADAPTER:
        model = PeftModel.from_pretrained(model, ADAPTER, token=HF_TOKEN)
        print(f"loaded adapter: {ADAPTER}")
    else:
        print("BASE MODEL ONLY (no adapter) — few-shot A/B")
    model.eval()

    b = load_bible()
    ex = load_exemplars()

    def gen(prompt):
        msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": prompt}]
        enc = tok.apply_chat_template(msgs, add_generation_prompt=True,
                                      return_tensors="pt", return_dict=True).to(model.device)
        with torch.no_grad():
            out = model.generate(**enc, max_new_tokens=700, do_sample=True,
                                 temperature=TEMP, top_p=0.9, repetition_penalty=REP_PENALTY,
                                 pad_token_id=tok.pad_token_id or tok.eos_token_id)
        return tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True)

    filled, incoming, queued, queue, errs = {}, {}, {"start"}, ["start"], []
    while queue:
        nid = queue.pop(0)
        if nid in filled:
            continue
        if len(filled) >= MAXNODES:
            errs.append(f"maxNodes {MAXNODES} hit at {nid}")
            break
        slot = {"id": nid, "start": nid == "start", "incoming": incoming.get(nid, [])}
        raw = gen(build_prompt(b, summarize(filled), slot, ex))
        try:
            node = json.loads(extract_json(raw))
            node["id"] = nid
            assert node.get("type") in ("action", "dialogue")
        except Exception as e:
            errs.append(f"slot {nid}: {e} :: {raw[:160]!r}")
            continue
        filled[nid] = node
        for via, nx in out_edges(node):
            if nx is None: continue
            incoming.setdefault(nx, []).append({"from": nid, "via": via})
            if nx not in filled and nx not in queued:
                queued.add(nx); queue.append(nx)

    pack = {
        "id": b["id"], "title": b["title"], "genre": b["genre"],
        "meterLabels": b["meterTheming"], "startNodeId": "start",
        "initialState": {"RAPPORT": 30, "VOLATILITY": 50, "PRESSURE": 40, "INSIGHT": 20},
        "nodes": list(filled.values()),
    }
    json.dump(pack, open("seventh-guest.finetuned.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print("=" * 60)
    print(f"nodes: {len(filled)}  gen errors: {len(errs)}")
    for e in errs: print("  ERR", e)
    print("=" * 60)
    print(json.dumps(pack, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
