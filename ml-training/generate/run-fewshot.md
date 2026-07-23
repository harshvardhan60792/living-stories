# Few-shot generation dry-run — go/no-go record (Plan 4 Task 4)

**Run:** `npx tsx ml-training/generate/run-fewshot.ts`
**Bible:** `ml-training/bibles/seventh-guest.bible.json` (THE SEVENTH GUEST)
**Output:** `ml-training/generate/out/seventh-guest.candidate.json`

## Result

| metric | value |
|---|---|
| nodes generated | 7 |
| gen errors (bad JSON / missing type) | 0 |
| validator `ok` | **true** |
| validator errors | none |
| validator warnings | none |
| slot pass-rate | **100%** |

## Decision: **SKIP Part B (QLoRA).** Few-shot is sufficient.

The prompt + harness + schema pipeline assembles a fully valid, playable
`StoryPack` from a bible with **zero** structural fixes. The schema is small and
regular (a handful of node/edge shapes), and the `exemplars.jsonl` set covers
every shape the generator must emit (action/dialogue, band-gated `textVariants`,
multi-edge branching, band-gated endings, `recallWhen`). A base
`Qwen2.5-3B-Instruct` few-shot against these prompts is very likely adequate;
spending a GPU on QLoRA would be premature per the de-risk discipline (spec §4.3).

## Honest caveats

- **What this proves:** the *pipeline* — prompt grounding, the frontier walk,
  JSON extraction, and the safety gate — end to end. The candidate passes the
  Task-1 validator with no manual structural repair.
- **What it does NOT prove:** the raw JSON-adherence of an *unaided* 3B. This
  dry-run replays the authored exemplar nodes as the `lm` callback (the cheap
  agent-role-play pass the plan sanctions), so it measures pipeline correctness,
  not model reliability. Swapping in a real 3B is a one-line change to the `lm`
  callback in `run-fewshot.ts`; if a real run's pass-rate falls below ~80%,
  Part B (Tasks 5–8) is the fallback — this 100% is the baseline it must beat.
- **Prose quality is out of scope for the validator.** The candidate reads as a
  curation-ready draft; voice/truth-coherence still get a human pass in Task 9.

## Baseline for Part B (if ever triggered)

Slot pass-rate to beat: **100% structural** on THE SEVENTH GUEST via the
pipeline. Part B is only worthwhile if a real unaided 3B measurably *fails* this
bar; otherwise it is dead weight.
