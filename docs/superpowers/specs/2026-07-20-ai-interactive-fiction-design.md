# Design Spec — AI-Driven Interactive Fiction ("Living Stories")

**Date:** 2026-07-20
**Status:** Approved design, ready for implementation planning

## 1. Summary

A text-based interactive-fiction game where a *growing library* of AI-authored,
genre-varied stories run on one shared engine. Choices matter because a **learned,
continuous, accumulated relationship/emotion state** — moved by a trained model that
reads the *meaning* of what the player says (including free-typed text) — drives
which authored content the player reaches and what live NPC lines get generated.
Detroit-style live meters and a branching flowchart make divergence visible.

The AI is the real work. Prose is authored **offline** (no runtime gibberish); the
**learned state model** and a **tiny flavor LM** run **client-side**.

## 2. Hard constraints (non-negotiable)

- Free: no paid APIs, compute, or hosting.
- No local GPU. All training fits Kaggle free tier (2×T4 or P100, 30 GPU-hr/week,
  12-hr sessions, no persistence → must checkpoint/resume).
- No from-scratch LM (gibberish). Fine-tune pretrained open models only.
- Playable web page: scene text, choices, free-text input, flowchart, meters.
- Runs client-side (transformers.js / ONNX) on free static hosting (GitHub Pages).
  No server, no per-request quota, no API key.
- Import/reuse free libraries for everything that isn't the AI.
- Buildable in a few days by a student + AI assistant who keeps the reins.

## 3. Architecture overview

**Catalog, not a monolith.** The game is a **library of self-contained story packs**.
Each pack is one baked `story.json` produced by the pipeline. Adding a chapter =
run pipeline → add one line to `stories/index.json` → push to GitHub Pages. No engine
code changes per story.

**Two jobs, split by where they run:**
- *Writing prose* → offline, at author-time, on Kaggle (curated → no gibberish).
- *Reading the player + updating hidden state + short flavor lines* → live, client-side.

## 4. The learned models (the real ML)

### 4.1 Emotion/tone encoder (shared, trained once)
- Base: `sentence-transformers/all-MiniLM-L6-v2` (~23M params, ~15–30 MB int8 ONNX).
- Task: read any line of text (a chosen option OR free-typed input) → tone vector
  over a ~14-label taxonomy (empathetic, aggressive, deceptive, reassuring, defiant,
  cold, submissive, curious, threatening, apologetic, dismissive, sincere, evasive, calm).
- Training data: GoEmotions + EmpatheticDialogues + DailyDialog, collapsed to the taxonomy.
- Genre-agnostic → trained once, reused by every story and by free-text input.
- Also produces sentence embeddings reused for semantic intent routing (§7).

### 4.2 State-update head (shared, trained once)
- Tiny MLP: `(tone vector, current state) → Δstate`. This is what makes state
  accumulate and feed back (not if/else).
- Operates on **abstract meter roles** (§5), so one head serves all stories.
- Training data: `labels.jsonl` pooled from all packs (author-time-tagged
  `choice → tone → intended Δ`). Retraining not required to add a story.
- Exported to ONNX; runs client-side.

### 4.3 Author-time generator (offline)
- Base: `Qwen2.5-3B-Instruct`, QLoRA on Kaggle (P100 16 GB, 4-bit).
- Fine-tuned on Facebook **LIGHT** (interactive fiction grounded in personas/emotions/
  actions) + ~30–50 hand-written exemplars of our node/choice JSON schema.
- **De-risk:** try few-shot prompting the base 3B first; fine-tune only if schema
  consistency demands it. Either way the emotion model IS trained (that's the ML spine).

### 4.4 Runtime flavor LM (shipped, optional)
- `Qwen2.5-0.5B-Instruct` (ONNX, int8), lazy-loaded via transformers.js.
- Only generates SHORT NPC reaction/bridging lines conditioned on state. Never
  load-bearing prose. Game fully playable if it never loads.

## 5. Abstract meter roles (genre-agnostic state)

Four canonical roles; each story names them thematically and may hide unused ones:

| Role | REVENANT (android) | Sherlock mystery | Noir heist |
|------|--------------------|------------------|-----------|
| RAPPORT    | NIX · Trust     | Client confidence | Partner loyalty |
| VOLATILITY | NIX · Stability | Suspect's nerve   | Heat / danger |
| PRESSURE   | Warden Approval | Lestrade / clock  | Boss's patience |
| INSIGHT    | Suspicion/truth | Deduction         | What you've pieced together |

State = continuous floats in this 4-D space. Roles let the shared encoder + head
serve every genre with no retraining.

## 6. Anti-hallucination bounds (baked into the pipeline)

- Per playthrough: depth 6–10 scene-nodes.
- Per scene: ~120–200 words, 2–4 choices (or a dialogue node, §7).
- Generation is **node-by-node**, each call grounded in a compact running
  state-summary + story bible (premise, characters, the truth, tone). The model never
  holds the whole tree — it fills one bounded slot at a time. Human curation per pack.

## 7. Free-text conversation (core feature, on "dialogue nodes")

Mixed interaction: **free-text input on pivotal character moments; choice buttons on
action beats.** Optional suggested-phrasing chips under the input (click or ignore).

When the player types a line, three layers fire (graceful degradation):

1. **Meaning → relationship.** Encoder → tone → head → Δstate. Anything typed moves
   meters, computed from what was actually said. No gibberish risk (classification).
2. **Meaning → story (semantic intent routing).** Typed text embedded (same MiniLM,
   reused) and matched by cosine similarity to a small set of authored **stances**
   (e.g. press / empathize / offer deal / reveal / deflect), each with pre-embedded
   anchor phrasings baked into `story.json`. Nearest stance selects NIX's authored
   response + branch. Generalizes to unseen phrasings → not if/else. Off-topic → still
   applies Layer 1, routes to a graceful "deflect" beat.
3. **"It heard my exact words" (optional live LM).** 0.5B generates a short bridging
   line acknowledging the player's specific wording, conditioned on state, then hands
   off to the authored beat. If LM is slow/off/bad, authored line still reads fine.

## 8. Runtime data flow (client-side)

```
player acts (click choice OR type a line)
  → emotion encoder (ONNX) → tone vector
  → [dialogue node] embed text → cosine-match to authored stances → pick stance
  → state-update head (ONNX) → Δstate → animate meters
  → select next node + text variant (edges gated on continuous state buckets)  ← history-driven
  → [optional] 0.5B generates NPC bridging/flavor line conditioned on state
  → render scene + interaction + update flowchart (with faded ghost paths)
```

Divergence emerges from: continuous accumulated state + meaning-based (generalizing)
interpretation + state-conditioned selection + live generation. The same action can
route differently depending on history. This is categorically not if/else.

## 9. Story pack schema

- `stories/index.json` — manifest: `[{id, title, genre, blurb, cover, meterLabels{RAPPORT,...}}]`.
- `stories/<id>.json` — one pack:
  - `bible`: premise, characters, the-truth, tone, meter theming, start node.
  - `nodes[]`: each `{ id, type: "action"|"dialogue", textVariants[{stateBucket, text}],
    interactions }`.
    - action node: `choices[{ text, toneTag, edges[{ condition(state buckets), nextId }] }]`.
    - dialogue node: `stances[{ id, anchorPhrasings[], anchorEmbeddings[], npcResponse,
      toneTag, edges[...] }]`, plus a `fallbackStance`.
- `labels.jsonl` (author-time, for head training): `{ text, tone, Δ{RAPPORT,...} }`.

## 10. Frontend & deployment

- App: Vite (vanilla JS or light React) → static build.
- ML runtime: transformers.js (`@huggingface/transformers`), WebGPU + WASM fallback.
- Flowchart: Cytoscape.js (interactive, live-updating, ghost paths). Meters = animated CSS bars.
- Hosting: GitHub Pages (free static). Models on HuggingFace Hub (free), pulled by transformers.js.
- No server, no key, no quota.

## 11. Kaggle training recipe (checkpoint/resume)

- Emotion encoder: MiniLM + multi-label head, ~3 epochs, batch 64 → <1 hr on one T4.
  Export ONNX via `optimum`, quantize int8.
- State head: tiny MLP on pooled `labels.jsonl` → minutes. Export ONNX.
- 3B QLoRA (if needed): bitsandbytes nf4 4-bit, LoRA r=16/α=32, `paged_adamw_8bit`,
  seq len ~1536, TRL `SFTTrainer`. Well within 30 GPU-hr/week.
- **No-persistence survival:** each session `push_to_hub` checkpoint/adapter; next
  session `resume_from_checkpoint` pulled from Hub.

## 12. Starter story lineup

1. **REVENANT** — near-future android interrogation (Detroit DNA). Cold, moral, tense.
2. **THE SEVENTH GUEST** — Victorian locked-room murder; consulting detective, INSIGHT-driven.
3. **NINE MINUTES TO MIDNIGHT** — neon-noir heist gone wrong; loyalty + heat + time pressure.

## 13. Upgrades (cool, easy)

- Ghost paths on the flowchart (faded untaken branches).
- Emotion-read tooltip (hover a choice → live predicted tone + meter shift).
- Memory callbacks (late scene names an earlier choice via state flags).
- End-screen divergence stats (localStorage).

## 14. Build order (playable from phase 0)

0. Static scaffold: 2 hardcoded scenes + meters + Cytoscape flowchart, **no ML**. Playable.
1. Train + wire emotion encoder → meters move via real ML.
2. Author full tree with 3B → bake `story.json` → real branching.
3. Swap transparent mapping → learned state head.
4. Free-text conversation (3 layers) + tiny LM flavor.
5. Second/third story pack via pipeline; upgrades.

Stop after any phase and still have a demo.

## 15. To verify during implementation

- Exact ONNX model IDs on HF that transformers.js loads for Qwen2.5-0.5B (e.g.
  `onnx-community/Qwen2.5-0.5B-Instruct`) and MiniLM.
- LIGHT dataset current license/access.
- transformers.js WebGPU availability + int8 sizes on target hardware.

## 16. Notes

- Working directory is not a git repo; spec not committed (offer `git init` if desired).
