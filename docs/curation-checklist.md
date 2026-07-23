# Pack curation checklist (Plan 4 Task 9)

Run after the pipeline emits a candidate (`ml-training/generate/out/<id>.candidate.json`)
and before dropping it in `public/stories/`. The validator catches structure; **this
list catches what it can't see** — prose quality and authorial coherence.

## Mechanical (the validator already enforces — just confirm it's green)
- [ ] `npx tsx scripts/validate-pack.ts public/stories/<id>.json` (or `npm test` — the
      `packs.valid` suite globs every pack) passes with **0 errors, 0 warnings**.
- [ ] Every `Edge.nextId` resolves; every ending (`nextId: null`) is reachable; no
      unreachable nodes.

## Coherence (human judgement)
- [ ] **The Truth holds.** Every reveal is consistent with the bible's `theTruth`;
      no node contradicts an earlier one.
- [ ] **Voice.** Each character's lines match their bible `voice`. The narrator tone
      matches the bible `tone`.
- [ ] **Band-gated `textVariants`** cover the bands they need (a node gated only on
      `high` with no default can read blank in `low`/`mid` — add a default or full set).
- [ ] **Endings pay off.** Each `ending` label matches what the scene actually does,
      and the three-ish outcomes are meaningfully divergent (Detroit payoff).

## Routing (Plan 2 cosine)
- [ ] Each dialogue node's stances are **semantically distinct** — the
      `anchorPhrasings` for different stances shouldn't paraphrase each other, or
      free-text routing will misfire.
- [ ] `fallbackStanceId` is the safest/most neutral stance (used on off-topic input).

## Integration
- [ ] Add one line to `public/stories/index.json` (id, title, genre, blurb).
- [ ] Browser playthrough on the live engine: meters move, stances route, every
      ending reachable. Screenshot as proof.
