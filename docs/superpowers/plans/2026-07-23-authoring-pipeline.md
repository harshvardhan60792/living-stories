# Plan 4: Author-Time Story-Generation Pipeline

> **For agentic workers:** this plan has the same split shape as Plan 3. Part A (Tasks 1–4)
> and Part C (Task 9) are fully agent-executable — offline, TDD, no GPU. Part B (Tasks 5–8)
> is **conditional**: it only runs if the few-shot approach in Task 4 fails the schema-
> consistency bar, and it needs a human with a **Kaggle account** (P100 16 GB for QLoRA) and
> the **HuggingFace Hub** (adapter storage). The agent writes every script; the human clicks
> run. De-risk order matters: **prove few-shot first (Task 4), fine-tune only if forced.**

**Context.** The engine is a *catalog* (spec §3): one shared runtime, many self-contained
`story.json` packs. Adding a story must be "run pipeline → validate → add one line to
`index.json` → push," with **zero engine changes** and **no model retraining** (the encoder
and state head are genre-agnostic, spec §4.1–4.2). Today there is exactly one hand-authored
pack (`public/stories/revenant.json`). Plan 4 builds the repeatable pipeline that produces
*new* valid packs within the anti-hallucination bounds (spec §6), so Plan 5 can add two more
stories by running it rather than hand-writing JSON.

**The generation design is already decided** (see [[living-stories-dialogue-decision]]):
prose is authored **offline**, node-by-node, each call grounded in a compact story bible +
running state-summary so the model never holds the whole tree. NPC dialogue at runtime is
*retrieval to authored stances*, never live generation — so the pipeline's job is to emit
**bounded, schema-valid, human-curated authored content**, not to be trusted as a live writer.

**Goal (spec §4.3, §6, §12):**
1. A hard **pack validator** that mechanically rejects any structurally-broken or
   out-of-bounds pack — the safety gate every generated (and existing) pack must pass.
2. A **node-by-node few-shot generation harness**: prompt templates + grounding-context
   builder + assembler, producing a candidate `story.json` from a story bible.
3. A **conditional QLoRA fine-tune** of `Qwen2.5-3B-Instruct` on Facebook LIGHT + schema
   exemplars — only if few-shot schema adherence proves inadequate.
4. A **curation + integration** step that lands a validated pack in the catalog and CI.

**Non-goals:** no runtime prose generation (that stays retrieval, spec §7 / dialogue-
decision memory); no schema change to `storyTypes.ts`; no change to the engine, encoder, or
state head. The pipeline emits data the *existing* runtime already knows how to play.

---

## Part A — Validator + few-shot pipeline (agent-executable, offline, TDD)

### Task 1: Pack schema + graph validator (the safety gate)

**Files:** `src/state/validatePack.ts`, `scripts/validate-pack.ts` (CLI), `tests/validatePack.test.ts`.
**Why first:** nothing generated can be trusted without a mechanical gate, and there is
**no validator today** — even `revenant.json` is only implicitly validated by the game
running. This task retroactively hardens the existing pack and gates every future one.

- [ ] Add `zod` (or hand-rolled guards — no new dep if preferred) and define a schema that
      mirrors `StoryPack`/`StoryNode`/`Choice`/`Stance`/`Edge`/`BandCondition` from
      `src/state/storyTypes.ts` exactly (single source of truth — derive, don't duplicate).
- [ ] **Structural checks:** every `id` unique; `startNodeId` exists; every `Edge.nextId`
      is either `null` (ending) or resolves to a real node; every `toneTag` ∈ `TONE_LABELS`
      (`src/engine/scorer.ts`); every `BandCondition` role ∈ `ROLES` with band ∈
      `low|mid|high`; every dialogue node's `fallbackStanceId` names one of its own stances;
      every stance has ≥1 `anchorPhrasing`; `initialState` covers all 4 roles in `[0,100]`.
- [ ] **Graph checks:** every node reachable from `startNodeId` (BFS); at least one path
      reaches an ending (`nextId: null`); no node is a dead end with no eligible edge
      (each node has an unconditional fallback edge OR its conditions are exhaustive).
- [ ] **Bounds checks (spec §6):** node count within depth budget (warn >10 on any path);
      each `textVariants.text` within ~120–200 words; 2–4 choices per action node.
      Bounds violations are **warnings** (curatorial), structure/graph errors are **fatal**.
- [ ] CLI: `npx tsx scripts/validate-pack.ts public/stories/<id>.json` → exit non-zero on
      any fatal error, print a human-readable report.
- [ ] Test: `revenant.json` passes clean; hand-built broken fixtures (dangling `nextId`,
      unknown `toneTag`, missing `fallbackStanceId`, unreachable node, no ending) each fail
      with the specific expected error.
- [ ] Commit: `feat: story pack schema + graph validator (Plan 4 safety gate)`.

### Task 2: Story bible schema + one authored bible

**Files:** `ml-training/bibles/<newstory>.bible.json`, `src/state/bibleTypes.ts`, test.
**Why:** the bible is the *only* grounding the generator gets (spec §6). It must be small,
authored by a human, and machine-checkable so generation can't drift off-premise.

- [ ] Define `StoryBible`: `{ id, title, genre, premise, characters[{name, role, voice}],
      theTruth (the secret the plot hides), tone, meterTheming (Role → label, per spec §5),
      nodeBudget{minDepth,maxDepth}, startSituation, endings[] }`.
- [ ] Author ONE bible for a genuinely new story (not REVENANT) to exercise the pipeline —
      e.g. a compact version of a spec §12 story so Plan 5 can reuse it.
- [ ] Test: the bible parses; `meterTheming` covers all 4 roles (may set a role to `null`
      to hide it, mirroring `revenant.json`'s pattern).
- [ ] Commit: `feat: story bible schema + first authored bible (Plan 4 grounding)`.

### Task 3: Node-by-node generation harness + schema exemplars

**Files:** `ml-training/generate/prompts.ts`, `ml-training/generate/harness.ts`,
`ml-training/generate/exemplars.jsonl`, tests.
**Why:** spec §6 mandates the model fills *one bounded slot at a time* against a running
state-summary, never the whole tree. This task builds that scaffolding and the ~30–50
schema exemplars (spec §4.3) — it does NOT need a GPU; it produces the prompts and the
assembler, testable with a stub LM.

- [ ] `exemplars.jsonl`: 30–50 `{prompt, completion}` pairs teaching the node JSON shape —
      seed from `revenant.json`'s nodes (decompose each into "given bible+state-summary,
      emit this node") + hand-write more covering both `action` and `dialogue` nodes,
      band-gated `textVariants`, and multi-edge branching.
- [ ] `prompts.ts`: `buildNodePrompt(bible, stateSummary, slotSpec)` → a grounded prompt
      that includes the bible digest, the running summary of already-generated nodes, the
      target node's id/type/incoming-edges, and 2–3 exemplars. Enforces the bounds inline
      ("2–4 choices", "120–200 words", "toneTag from this list").
- [ ] `harness.ts`: `generatePack(bible, lm: (prompt)=>Promise<string>)` — walks a frontier
      of unfilled node slots, calls `lm` per slot, parses JSON, appends to a running
      state-summary, stitches into a candidate `StoryPack`, then runs **Task 1's validator**
      and returns `{pack, report}`. `lm` is injected so tests use a deterministic stub.
- [ ] Test: with a stub `lm` returning canned valid node JSON, `generatePack` assembles a
      pack that **passes the Task 1 validator**; with a stub returning a dangling `nextId`,
      the harness surfaces the validator's fatal error rather than emitting a broken pack.
- [ ] Commit: `feat: node-by-node generation harness + schema exemplars (Plan 4)`.

### Task 4: Few-shot generation dry-run (the de-risk gate)

**Files:** `ml-training/generate/run-fewshot.md` (recipe), output candidate pack under
`ml-training/generate/out/`.
**Why:** spec §4.3 says try few-shot base 3B *before* fine-tuning. This task is the
go/no-go for Part B.

- [ ] Drive `harness.generatePack` with a real few-shot LM as the `lm` callback — either
      `Qwen2.5-3B-Instruct` via the user's Kaggle/HF, or (cheaper first pass) the agent
      itself role-playing the per-node prompts to sanity-check the prompt design.
- [ ] Generate one full candidate pack from the Task 2 bible; run the validator.
- [ ] **Decision gate (flag, don't decide silently):** if few-shot output passes the
      validator with only light human curation (≤~20% of nodes need manual fixes), **skip
      Part B entirely** — few-shot is enough, and QLoRA is wasted effort. If schema
      adherence is poor (frequent invalid JSON, wrong edge shapes, bounds blown), proceed to
      Part B. Record the pass-rate in `run-fewshot.md` as the baseline Part B must beat.
- [ ] Commit: `chore: few-shot generation dry-run + go/no-go record (Plan 4)`.

---

## Part B — QLoRA fine-tune (CONDITIONAL; requires human: Kaggle P100 + HF Hub)

> Only if Task 4's few-shot pass-rate is inadequate. Agent writes every script; human runs
> Task 7. Mirrors Plan 3 Part B's account requirements.

### Task 5: LIGHT + exemplar SFT dataset prep
- [ ] Agent writes `ml-training/prepare_light_sft.py`: pull Facebook **LIGHT** (verify its
      current license/access first — spec §15), filter to interaction-grounded episodes,
      and concatenate the Task 3 `exemplars.jsonl` (formatted as instruction/response). The
      exemplars are what actually teach *our* JSON schema; LIGHT teaches IF-genre prose.
- [ ] Output a single SFT `.jsonl` in TRL chat format. Test offline that every row parses
      and every schema-exemplar completion is itself Task-1-valid node JSON.

### Task 6: QLoRA training script
- [ ] Agent writes `ml-training/train_generator.py`: `Qwen2.5-3B-Instruct`, bitsandbytes
      nf4 4-bit, LoRA r=16/α=32, `paged_adamw_8bit`, seq len ~1536, TRL `SFTTrainer`
      (spec §11). `push_to_hub` the adapter every N steps + at end (no-persistence survival,
      spec §11 — next Kaggle session `resume_from_checkpoint` from Hub).

### Task 7: Human runs the Kaggle notebook
- [ ] Create HF adapter repo (e.g. `<user>/living-stories-generator-lora`) + a Kaggle
      notebook with P100. Upload/run the Task 5+6 scripts to completion (well within
      30 GPU-hr/week). Confirm the adapter landed on the Hub. **Hand the adapter ID back.**

### Task 8: Re-run harness with the fine-tuned model
- [ ] Point Task 3's `lm` callback at the fine-tuned 3B (base + LoRA adapter). Regenerate
      the Task 2 bible's pack; compare validator pass-rate against Task 4's few-shot
      baseline. Keep the fine-tune only if it measurably raises schema adherence.

---

## Part C — Curation + catalog integration (agent-executable)

### Task 9: Curate, integrate, gate in CI

**Files:** `public/stories/<newstory>.json`, `public/stories/index.json`,
`.github/workflows/deploy.yml`, `docs/curation-checklist.md`.

- [ ] Human-curate the winning candidate pack (few-shot or fine-tuned): fix prose quality
      the validator can't see (voice consistency, the-truth coherence, no contradictions
      with the bible), tune band-gated `textVariants`, confirm every stance's
      `anchorPhrasings` are distinct enough for cosine routing (Plan 2). Ship a written
      `curation-checklist.md` so this is repeatable, not ad-hoc.
- [ ] Drop the curated pack in `public/stories/`, add one line to `index.json`.
- [ ] **Extend the CI test-gate:** add a step to `.github/workflows/deploy.yml` that runs
      the Task 1 validator over **every** `public/stories/*.json` before build — so a broken
      pack can never deploy. (The deploy workflow is already live and test-gated from Plan 5
      hardening; this just adds pack validation to it.)
- [ ] Browser playthrough of the new pack on the live engine: meters move, stances route,
      endings reachable. Screenshot as proof.
- [ ] Commit: `feat: integrate <newstory> pack + validate all packs in CI (Plan 4)`.

---

## Self-Review

- **Spec coverage:** §4.3 (author-time generator, few-shot-first then conditional QLoRA),
  §6 (node-by-node grounded generation, bounds enforced by validator), §12 (produces the
  catalog additions Plan 5 ships). §9's pack schema is now *mechanically enforced*, not just
  documented.
- **Architecture consistency:** zero engine/model changes — the pipeline emits `story.json`
  the existing runtime already plays; new packs reuse the shared encoder + state head with
  no retraining (spec §4.2). Matches the catalog design (spec §3).
- **De-risk discipline:** few-shot is proven (Task 4) before any GPU spend; Part B is
  explicitly conditional. The validator (Task 1) is built *first* so no unvalidated content
  can enter the catalog — closing the current gap where even `revenant.json` is unchecked.
- **Honest risk flags:** (1) a free-tier 3B may produce weak *prose* — the validator catches
  structure, **not** literary quality, so human curation (Task 9) is mandatory, not optional.
  (2) LIGHT license/access must be re-verified before Task 5 (spec §15). (3) If Task 4's
  few-shot bar is met, Tasks 5–8 are dead weight — don't run them out of momentum.
- **What needs YOU specifically:** only if Part B triggers — a Kaggle account (P100) + HF Hub
  adapter repo + ~1 hr to run Task 7. Everything in Parts A and C is agent-executable now.
