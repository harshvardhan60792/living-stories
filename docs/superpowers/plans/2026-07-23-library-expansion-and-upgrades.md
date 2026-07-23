# Plan 5: Story-Library Expansion + Detroit-Grade UI Upgrades

> **For agentic workers:** Part A (Tasks 1–2, new story packs) **depends on Plan 4's
> pipeline + validator** — do not start it until Plan 4 Part A is done. Parts B and C
> (Tasks 3–8, UI upgrades + QA) are agent-executable now, independent of Plan 4, each with
> TDD + a browser-verification step. Deploy hardening (spec §14 phase 5) is **already done**
> — the game is live at https://harshvardhan60792.github.io/living-stories/ — so this plan's
> "deploy" work is reduced to CI pack-validation + a QA/polish pass, not a first deploy.

**Context.** The engine, ML stand-ins→learned models, free-text routing, and a first live
deploy are all shipped (Plans 1–3 + the deploy that landed 2026-07-23). One story pack
exists (REVENANT). Plan 5 is the "make it a *product*" plan: grow the catalog to the spec
§12 lineup and add the spec §13 upgrades that make divergence *visible and re-playable* —
the Detroit-style payoff the whole design is aimed at.

**Goal (spec §12, §13, §10):**
1. Ship **THE SEVENTH GUEST** and **NINE MINUTES TO MIDNIGHT** via the Plan 4 pipeline —
   proving the catalog claim (new stories, zero engine/model changes).
2. Add four upgrades: **ghost paths** on the flowchart, **emotion-read tooltip**, **memory
   callbacks**, **end-screen divergence stats**.
3. Cross-browser / responsive / WebGPU-fallback **QA pass** and CI pack-validation.

**Non-goals:** no new ML training (both new packs reuse the shared encoder + state head,
spec §4.2); no schema change; no engine rewrite — upgrades extend existing UI modules
(`flowchart.ts`, `scene.ts`, `meters.ts`, `game.ts` already carry a `_history`).

---

## Part A — Two more story packs (depends on Plan 4 pipeline)

### Task 1: THE SEVENTH GUEST (Victorian locked-room, INSIGHT-driven)

**Files:** `ml-training/bibles/seventh-guest.bible.json`, `public/stories/seventh-guest.json`,
`public/stories/index.json` (+1 line).

- [ ] Author the bible (spec §12): consulting-detective mystery, the-truth = the murderer +
      method, meter theming per spec §5 — RAPPORT = *Client confidence*, VOLATILITY =
      *Suspect's nerve*, PRESSURE = *Lestrade / the clock*, INSIGHT = *Deduction* (the
      primary driver; consider hiding a role via `null` if the genre doesn't need all four).
- [ ] Run the Plan 4 pipeline (few-shot or fine-tuned) → candidate pack → **Task-1 validator
      must pass** → human curation (curation-checklist).
- [ ] Confirm dialogue-node `anchorPhrasings` are semantically distinct for cosine routing
      (Plan 2) — deduction beats ("accuse X", "ask about the will", "examine the body")
      should route cleanly; re-check the 0.3 threshold holds for this pack's phrasings.
- [ ] Browser playthrough; screenshot. Commit: `feat: add THE SEVENTH GUEST story pack`.

### Task 2: NINE MINUTES TO MIDNIGHT (neon-noir heist, loyalty + heat + time)

**Files:** `ml-training/bibles/nine-minutes.bible.json`, `public/stories/nine-minutes.json`,
`index.json` (+1 line).

- [ ] Author the bible: heist-gone-wrong, the-truth = who tipped the cops / the double-cross,
      meter theming — RAPPORT = *Partner loyalty*, VOLATILITY = *Heat / danger*, PRESSURE =
      *Boss's patience*, INSIGHT = *What you've pieced together*. Time-pressure framing in
      `textVariants` band-gated on PRESSURE.
- [ ] Same pipeline → validator → curation → playthrough as Task 1.
- [ ] Commit: `feat: add NINE MINUTES TO MIDNIGHT story pack`.

---

## Part B — Detroit-grade UI upgrades (agent-executable now, TDD + browser verify)

### Task 3: Ghost paths on the flowchart (spec §13, §10)

**Files:** `src/ui/flowchart.ts`, `src/ui/style.css`, test.
**State today:** `flowchart.ts` exists (Cytoscape) and renders the graph; `game.ts` tracks
`_history` (visited node ids). Missing: the *faded untaken branches* that make divergence
legible.

- [ ] Render the full pack graph, then style nodes/edges by three states: **taken** (bright,
      from `_history`), **available-not-taken** (normal), **ghost** (untaken branches from
      visited nodes — faded/dashed). Update live as the player advances.
- [ ] Test the classification logic (pure function: `(pack, history) → {nodeId → state}`)
      deterministically, separate from Cytoscape rendering.
- [ ] Browser verify: play a branch, confirm the untaken sibling branch renders ghosted.
      Screenshot. Commit: `feat: ghost paths on flowchart (Plan 5 upgrade)`.

### Task 4: Emotion-read tooltip (spec §13)

**Files:** `src/ui/scene.ts`, `src/main.ts`, `src/ui/style.css`, test.

- [ ] On hover of a choice button (and on typed-input debounce), run the encoder →
      state head to preview the **predicted tone + meter Δ** *before* committing, shown as a
      small tooltip ("↑ RAPPORT +6, ↓ VOLATILITY −2"). Reuses the already-loaded
      `ToneScorer` + `StateHead` — no new model.
- [ ] Debounce + guard: if the encoder isn't loaded yet (fallback `MockScorer`), show the
      mock preview or hide gracefully — never block hover.
- [ ] Test the Δ-formatting pure function. Browser verify the tooltip shows a sane preview
      that matches the actual applied delta on click. Commit: `feat: emotion-read tooltip`.

### Task 5: Memory callbacks (spec §13)

**Files:** `src/engine/game.ts`, `src/state/storyTypes.ts` (small), a pack using it, test.

- [ ] Add lightweight **flags/history recall**: allow `textVariants` (or a new optional
      `recallWhen`) to reference an earlier decision — e.g. a late scene names a choice the
      player made in an early node (via `_history` membership or a set-flag on an edge).
      Keep it schema-additive and back-compatible (absent = today's behavior).
- [ ] Wire selection so a variant can gate on "visited node X" in addition to band
      conditions. Author one callback in an existing pack to demo it.
- [ ] Test: given a history containing X, the recall variant is selected; without it, the
      default. Commit: `feat: memory callbacks (late scenes reference earlier choices)`.

### Task 6: End-screen divergence stats (spec §13)

**Files:** `src/ui/scene.ts` (or new `src/ui/endscreen.ts`), `src/main.ts`, test.

- [ ] On reaching an ending (`nextId: null`), show a summary: path taken (node count /
      route), final meters, and **divergence vs prior plays** stored in `localStorage`
      (e.g. "you spared NIX — 40% of your runs did"). Aggregate across playthroughs locally.
- [ ] Test the stats/aggregation pure functions with a fake storage. Browser verify the
      end screen renders after a full playthrough. Commit: `feat: end-screen divergence stats`.

---

## Part C — QA + polish

### Task 7: Cross-browser / responsive / fallback QA

- [ ] Playthrough on Chromium + Firefox + WebKit (the browser tool + manual note). Confirm
      transformers.js **WebGPU → WASM fallback** works where WebGPU is absent (spec §10, §15),
      and ML load times are tolerable on the WASM path.
- [ ] Responsive check (mobile/tablet/desktop via `resize_window`) + dark mode. Fix layout
      breaks in `style.css`. Confirm meters/flowchart usable at mobile width.
- [ ] Commit fixes as found: `fix: responsive/cross-browser QA (Plan 5)`.

### Task 8: CI pack-validation + deploy polish

> Deploy itself is **DONE** (live on Pages, workflow test-gated). This is the finishing pass.

- [ ] Ensure the Plan 4 Task-1 validator runs over all `public/stories/*.json` in
      `.github/workflows/deploy.yml` before build (shared with Plan 4 Task 9 — do it once).
- [ ] README with the live URL, screenshot/GIF, and a one-paragraph "how it works" (encoder
      → head → routing). Optional: Lighthouse pass; confirm ML chunks stay lazy-loaded so
      first paint isn't blocked on model download.
- [ ] Commit: `docs: README + CI pack validation (Plan 5 polish)`.

---

## Self-Review

- **Spec coverage:** §12 (full three-story lineup shipped), §13 (all four upgrades: ghost
  paths, tooltip, memory callbacks, divergence stats), §10 (Cytoscape ghost paths, WebGPU/
  WASM fallback QA). §14 phase 5 complete once this lands.
- **Architecture consistency:** new packs are pure data through the Plan 4 pipeline — no
  engine or model changes, reusing the shared encoder + head (the catalog payoff, spec §3).
  Upgrades extend existing UI modules and the existing `_history` mechanism; the one schema
  touch (memory callbacks) is additive and back-compatible.
- **Sequencing:** Part A is blocked on Plan 4 Part A (pipeline + validator). Parts B and C
  are independent and can proceed now — good parallel work while Plan 3/4's Kaggle steps run.
- **Honest risk flags:** (1) new-pack *prose quality* depends on Plan 4's generator + human
  curation — a weak pipeline output means more hand-authoring, not a broken game. (2) The 0.3
  routing threshold was tuned on REVENANT's phrasings; re-verify per new pack (Tasks 1–2).
  (3) WebGPU support varies — the WASM fallback is the real target for QA (spec §15), not the
  fast path. (4) Memory-callback schema change must stay back-compatible so `revenant.json`
  and the validator keep passing untouched.
- **What needs YOU specifically:** nothing new beyond Plan 4's conditional Kaggle step — all
  of Parts B and C are agent-executable now.
