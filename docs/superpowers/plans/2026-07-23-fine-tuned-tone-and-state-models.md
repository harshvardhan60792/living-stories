# Plan 3: Fine-Tuned Tone Encoder + Learned State Head

> **For agentic workers:** this plan has a different shape than Plans 1–2. Tasks 1–3 and
> 8–11 are fully agent-executable (offline, TDD, no GPU). Tasks 4–7 require a human with
> a **Kaggle account** (GPU quota) and a **HuggingFace Hub account** (checkpoint storage +
> model hosting) — the agent can write every script/notebook cell, but cannot run them.
> Use superpowers:subagent-driven-development for Tasks 1–3 and 8–11; Tasks 4–7 are a
> human checklist with agent-authored scripts attached.

**Context:** Plan 1 shipped transparent ML stand-ins behind two interfaces:
`ToneScorer` (`MockScorer` today, keyword-based) and `StateHead` (`LinearHead` today, a
hand-picked tone→meter weight matrix). Plan 2 shipped real off-the-shelf MiniLM
embeddings for free-text *routing* but did not touch tone scoring. Plan 3 replaces both
stand-ins with genuinely trained models, without changing either interface — so nothing
downstream (`GameEngine`, `main.ts`, tests) needs to change except which concrete class
gets constructed.

**Goal (spec §4.1–4.2):**
1. Fine-tune `sentence-transformers/all-MiniLM-L6-v2` into a 14-label multi-label tone
   classifier (the existing `TONE_LABELS` in `src/engine/scorer.ts` — already spec-aligned,
   no taxonomy decision needed on our side).
2. Train a tiny MLP `(tone vector, current state) → Δstate` head on `labels.jsonl`,
   replacing `LinearHead`'s hand-picked matrix with a learned one.
3. Keep both behind the existing interfaces so the swap is a constructor change, not a
   refactor — mirroring the graceful-fallback pattern already proven in Plans 1–2.

**Non-goals:** no schema change to `story.json`; no change to `GameEngine`; Plan 2's
`StanceRouter`/embeddings are untouched by default (reusing the fine-tuned MiniLM backbone
for embeddings too is Task 11, explicitly optional).

---

## Part A — Data preparation (agent-executable, offline, TDD)

### Task 1: Emotion taxonomy mapping (source datasets → TONE_LABELS)

**Files:** `ml-training/taxonomy.py` (mapping dict + `map_label()`), `ml-training/tests/test_taxonomy.py`.

**Why this is its own task:** GoEmotions (27 emotions + neutral), EmpatheticDialogues (32
emotion labels), and DailyDialog (7 emotions + 4 dialogue acts) each use their own label
set. None of them match our 14 `TONE_LABELS` (empathetic, aggressive, deceptive,
reassuring, defiant, cold, submissive, curious, threatening, apologetic, dismissive,
sincere, evasive, calm) 1:1. This mapping is the single biggest source of silent quality
loss if done sloppily, so it gets its own reviewed artifact instead of being inlined into
the training script.

- [ ] Pull the three dataset cards from HF Hub (`go_emotions`, `empathetic_dialogues`,
      `daily_dialog`) and record their **exact** label strings (don't hand-type from
      memory — dataset label spellings drift between HF dataset versions).
- [ ] Draft `TAXONOMY: dict[str, dict[str, str]]` — one sub-dict per source dataset,
      every source label mapped to exactly one `TONE_LABELS` entry, or explicitly to
      `None` (dropped, e.g. GoEmotions' "amusement" may not map cleanly to anything —
      dropping a label is fine, silently mis-mapping it is not).
- [ ] Write `map_label(dataset: str, label: str) -> str | None`.
- [ ] Test: assert every source label is present in the dict (no `KeyError` at runtime),
      assert no target label is `None`-heavy to the point of being unreachable (e.g. if
      nothing maps to "evasive", flag it — the head will never learn that class from this
      data and DailyDialog's dialogue-act labels may need to fill the gap).
- [ ] Commit: `feat(ml-training): source-dataset -> TONE_LABELS taxonomy mapping`.

### Task 2: `labels.jsonl` authoring from existing story packs

**Files:** `scripts/build-labels.ts`, `tests/buildLabels.test.ts`, output → `ml-training/data/labels.jsonl`.

**Schema (spec §9):** `{ text: string, tone: string, delta: Partial<MeterState> }` per line.

**Circularity — RESOLVED.** Earlier draft derived `delta` by running each text through
`LinearHead` (the stand-in Task 5 replaces), which is circular. Fixed: deltas now come
from an **authored design-intent table** `ml-training/data/tone_intent.json` (independent
human ground truth, covers all 14 tones). `build-labels.ts` no longer imports
`MockScorer`/`LinearHead` at all. At train time the tone VECTOR comes from the real
encoder on `text`; `delta` is the authored target; `tone` is the authoring-tag metadata.

- [ ] Walk every `pack.nodes[].choices[].toneTag` / `.stances[].toneTag` +
      `.anchorPhrasings` across all packs in `public/stories/*.json` (currently just
      `revenant.json`).
- [ ] For each tagged text, set `delta = tone_intent[toneTag]` (authored, not derived).
- [ ] Emit one `labels.jsonl` line per tagged text.
- [ ] Test: every `toneTag`-bearing choice/stance across all packs appears exactly once
      in the output; schema matches spec §9.
- [ ] Commit: `feat: bootstrap labels.jsonl from existing pack toneTags (Plan 3 data prep)`.

---

## Part B — Model training (requires human: Kaggle + HuggingFace Hub accounts)

> Agent writes every script below. Human runs Task 4 (needs GPU) and pushes results.
> Task 5 is small enough to run locally (CPU, seconds–minutes) — agent can execute it
> directly once `labels.jsonl` exists, no Kaggle required.

### Task 3: HF Hub model repo + Kaggle notebook scaffold

- [ ] Human creates a HF Hub model repo (e.g. `<user>/living-stories-tone-encoder`) and
      a Kaggle notebook with a GPU accelerator (T4).
- [ ] Agent writes `ml-training/train_tone_encoder.py`: loads GoEmotions +
      EmpatheticDialogues + DailyDialog via `datasets`, applies Task 1's taxonomy,
      **concatenates `ml-training/data/tone_seed.jsonl`** (authored examples for the 5
      gap labels deceptive/evasive/threatening/cold/defiant that the datasets can't
      reach), fine-tunes MiniLM as a multi-label classifier (sigmoid output over 14
      labels), ~3 epochs / batch 64 (spec §11 estimate: <1 hr on one T4).
- [ ] Script pushes checkpoint to the HF Hub repo after training (`push_to_hub`) —
      satisfies spec §11's "no-persistence survival" (Kaggle sessions aren't durable;
      next session does `resume_from_checkpoint` pulled from Hub).

### Task 4: Human runs the Kaggle notebook

- [ ] Upload `train_tone_encoder.py` (or its notebook form) to Kaggle, attach GPU,
      run to completion.
- [ ] Confirm the checkpoint landed on the HF Hub repo.
- [ ] **Hand the model ID back to the agent** to wire into Task 9.

### Task 5: Train the state-update head (agent-executable, no GPU)

**Files:** `ml-training/train_state_head.py`, output → `ml-training/artifacts/state_head_weights.json`.

- [ ] Tiny MLP or even a single learned linear layer: `(14-dim tone, 4-dim state) → 4-dim Δstate`,
      trained on `ml-training/data/labels.jsonl` from Task 2. This is small enough
      (hundreds of rows, ≤4 output dims) to train on CPU in seconds — no Kaggle needed.
- [ ] **Deployment decision (flagging, not deciding silently):** spec §4.2 says "exported
      to ONNX," but a matrix this small doesn't need an ONNX runtime round-trip — it can
      ship as a plain learned weight JSON consumed by a `LearnedStateHead` TypeScript
      class with the exact same shape as today's `LinearHead` (just numbers you didn't
      hand-pick). Simpler, zero new runtime dependency, same interface. Recommend this;
      ONNX-export is the fallback if the head grows non-linear enough to need it.
- [ ] Commit: `feat(ml-training): train state-update head on labels.jsonl`.

### Task 6: Export + quantize the tone encoder

- [ ] `optimum-cli export onnx` on the fine-tuned MiniLM classifier; quantize int8
      (mirrors Plan 1/2's existing `{ dtype: "q8" }` pattern already used by
      `TransformersScorer`/`TransformersEmbedder`).
- [ ] Push the ONNX artifact to the same HF Hub repo so `transformers.js` can lazy-load
      it exactly like the existing off-the-shelf models.
- [ ] Human confirms the model loads via a quick `pipeline("text-classification", modelId)`
      smoke check (agent can write this check; human runs it once the artifact exists,
      or the agent re-verifies once the model ID is live — see Task 9).

### Task 7: Checkpoint/resume discipline

- [ ] Confirm both training scripts (Tasks 3 and 5) checkpoint to the Hub / repo on every
      run, so a killed Kaggle session loses no progress (spec §11). This is a script
      property to verify once, not a recurring task.

---

## Part C — Wiring + verification (agent-executable, offline-testable, mirrors Plan 1/2's pattern)

### Task 8: `LearnedStateHead` behind the existing `StateHead` interface

**Files:** `src/engine/scorer.ts` (or a new `src/engine/learnedStateHead.ts`), test: `tests/learnedStateHead.test.ts`.

- [ ] `class LearnedStateHead implements StateHead` — loads the Task 5 weight JSON
      (bundled at build time, no network fetch needed since it's tiny) and applies it
      with the exact same `delta(tone, state)` signature as `LinearHead`.
- [ ] Test with a small fixture weight matrix (not the real trained one) — pure logic,
      no ML, fully deterministic, same TDD style as `LinearHead`'s existing tests.
- [ ] Commit: `feat: LearnedStateHead reading trained weights behind StateHead interface`.

### Task 9: Point `TransformersScorer` at the fine-tuned model

**Files:** `src/ml/transformersScorer.ts`.

- [ ] Swap the default `modelId` from the Plan-1 placeholder
      (`Xenova/distilbert-base-uncased-finetuned-sst-2-english`) to the Task 4 model ID.
- [ ] Delete/simplify `mapLabel()` — the code already carries the comment "Plan 2's model
      emits TONE_LABELS directly and this becomes identity," so once the fine-tuned model
      emits our 14 labels natively, this becomes a passthrough (or is removed entirely).
- [ ] Guarded `RUN_ML=1` test updated to assert against the *new* model. (The old
      "ORT-node fails" caveat is RESOLVED: ML integration tests now run in the `node`
      vitest environment via a `// @vitest-environment node` pragma — jsdom's Float32Array
      was breaking onnxruntime-node's native type check. RUN_ML tests pass in Node now.)
- [ ] Commit: `feat: wire fine-tuned tone encoder into TransformersScorer`.

### Task 10: Wire into `main.ts` + browser verification

- [ ] `startStory` constructs `LearnedStateHead` (bundled, no fallback needed — it's not
      a network fetch) and the updated `TransformersScorer` (network fetch, same
      try/catch → `MockScorer` fallback pattern already in place).
- [ ] Browser playthrough: compare a few typed lines' meter deltas against the current
      `MockScorer`+`LinearHead` baseline — confirm the learned pair produces sane,
      non-degenerate deltas (not all-zero, not saturating every meter every turn).
- [ ] Commit: `feat: swap in fine-tuned tone encoder + learned state head with fallback`.

### Task 11 (optional): Reuse the fine-tuned MiniLM backbone for Plan 2's embeddings

- [ ] Point `TransformersEmbedder`'s default `modelId` at the Task 4 checkpoint instead
      of stock `Xenova/all-MiniLM-L6-v2` — a classification fine-tune's backbone usually
      still produces good sentence embeddings, and this satisfies the roadmap's stated
      intent ("reuse the SAME fine-tuned MiniLM for both tone AND the Plan 2 embeddings").
      Re-run Plan 2's threshold tuning (the 0.3 cutoff was tuned against the *stock*
      model) since a fine-tuned backbone's cosine geometry may shift it.
- [ ] Skip if the fine-tuned backbone measurably *hurts* routing quality — off-the-shelf
      MiniLM stays the safer default for Layer 2.

---

## Self-Review

- **Spec coverage:** §4.1 (tone encoder fine-tune), §4.2 (state head), §11 (Kaggle recipe,
  checkpoint/resume) all covered. §9's `labels.jsonl` schema satisfied by Task 2.
- **Architecture consistency:** both replacements sit behind `ToneScorer`/`StateHead`,
  the exact interfaces Plan 1 designed for this swap — no engine or UI changes required
  beyond which class `main.ts` constructs, mirroring Plan 1→2's proven fallback pattern.
- **Honest risk flags:** (1) ~~Task 2 circular labels~~ RESOLVED — deltas now from the
  authored `tone_intent.json`, not `LinearHead`. (2) ~~5 unreachable tone labels~~
  RESOLVED — `tone_seed.jsonl` supplies authored examples for deceptive/evasive/
  threatening/cold/defiant, folded into encoder training. (3) Task 1's `SOURCE_LABELS`
  are canonical-from-docs, still to be re-verified against the installed dataset version
  at Kaggle time (Task 4). (4) Task 11 is explicitly a maybe, not a commitment.
- **What needs YOU specifically:** a Kaggle account + a HuggingFace Hub account, and
  ~1 hour of wall-clock time to click "run" on Task 4's notebook once the agent hands it
  to you. Everything else (Tasks 1, 2, 5, 8, 9, 10) is agent-executable now.
