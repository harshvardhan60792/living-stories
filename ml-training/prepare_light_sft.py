"""Plan 4 Task 5 — build the SFT dataset for the node-generator QLoRA.

Two sources, concatenated into one TRL chat-format .jsonl:
  1. exemplars.jsonl  — {prompt, completion} pairs that teach OUR node JSON
     schema (the load-bearing part). Each completion must be valid node JSON.
  2. Facebook LIGHT    — interaction-grounded IF prose, to teach genre voice.
     BEST-EFFORT: HF removed script-based loaders, so LIGHT may be unloadable;
     if so we skip it — the exemplars alone teach the schema. (spec §15: verify
     LIGHT license/access before relying on it.)

Run (locally or on Kaggle):
    python prepare_light_sft.py --exemplars generate/exemplars.jsonl --out sft.jsonl
"""
import argparse, json, sys

SYS = ("You author ONE node of a branching interactive-fiction story as strict "
       "JSON. Return ONLY the JSON object for the single node — no prose, no "
       "markdown fence.")

TONE_LABELS = {"empathetic", "aggressive", "deceptive", "reassuring", "defiant",
               "cold", "submissive", "curious", "threatening", "apologetic",
               "dismissive", "sincere", "evasive", "calm"}


def node_is_valid(js: str) -> bool:
    """Light offline mirror of the TS Task-1 validator (shape only)."""
    try:
        n = json.loads(js)
    except Exception:
        return False
    if n.get("type") not in ("action", "dialogue"):
        return False
    tv = n.get("textVariants")
    if not isinstance(tv, list) or not tv or not all(isinstance(v.get("text"), str) and v["text"] for v in tv):
        return False
    if n["type"] == "action":
        cs = n.get("choices")
        return isinstance(cs, list) and len(cs) >= 1 and all(c.get("edges") for c in cs)
    st = n.get("stances")
    return (isinstance(st, list) and len(st) >= 1
            and isinstance(n.get("fallbackStanceId"), str) and n["fallbackStanceId"]
            and all(s.get("anchorPhrasings") and s.get("npcResponse") and s.get("edges") for s in st))


def chat(user: str, assistant: str) -> dict:
    return {"messages": [{"role": "system", "content": SYS},
                         {"role": "user", "content": user},
                         {"role": "assistant", "content": assistant}]}


def load_exemplars(path: str) -> list:
    rows, bad = [], 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ex = json.loads(line)
            comp = ex["completion"]
            if not node_is_valid(comp):
                bad += 1
                continue
            rows.append(chat(ex["prompt"], comp))
    if bad:
        print(f"WARNING: {bad} exemplar completion(s) failed the shape check — dropped", file=sys.stderr)
    return rows


def load_light(limit: int) -> list:
    """Best-effort LIGHT episodes as generic IF instruction/response prose."""
    try:
        from datasets import load_dataset
        ds = load_dataset("facebook/light_dialog", split="train")
    except Exception as e:
        print(f"LIGHT unavailable ({e.__class__.__name__}) — skipping, exemplars carry the schema", file=sys.stderr)
        return []
    rows = []
    for ex in ds:
        ctx = (ex.get("context") or ex.get("text") or "").strip()
        resp = (ex.get("response") or ex.get("labels", [""])[0] or "").strip()
        if not ctx or not resp:
            continue
        rows.append(chat(f"Continue this interactive-fiction scene in character:\n{ctx}", resp))
        if len(rows) >= limit:
            break
    print(f"LIGHT rows: {len(rows)}", file=sys.stderr)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exemplars", default="generate/exemplars.jsonl")
    ap.add_argument("--out", default="sft.jsonl")
    ap.add_argument("--light-limit", type=int, default=3000)
    a = ap.parse_args()

    rows = load_exemplars(a.exemplars) + load_light(a.light_limit)
    # Upsample the schema exemplars so the small set isn't drowned by LIGHT prose.
    ex_only = [r for r in rows if r["messages"][2]["content"].lstrip().startswith("{")]
    rows += ex_only * 4
    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} rows -> {a.out} (schema exemplars x5, LIGHT prose for voice)")


if __name__ == "__main__":
    main()
