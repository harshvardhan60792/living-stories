# Graph Report - living-stories  (2026-07-23)

## Corpus Check
- 63 files · ~30,433 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 355 nodes · 619 edges · 22 communities (21 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a56a4289`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Package Manifest & Runtime Deps
- Game Engine & Turn Loop
- Tone Scoring (ML)
- Story Types & Flowchart
- Router & Meter Math
- TypeScript Config
- Dev Dependencies
- App Wiring & Menu/Meter UI
- Scene UI
- Design Spec — AI-Driven Interactive Fiction ("Living Stories")
- File Structure
- Part B — Plan 2: Free-Text Dialogue (Semantic Stance Routing)
- CLAUDE.md
- Part B — Detroit-grade UI upgrades (agent-executable now, TDD + browser verify)
- train_state_head.py
- build-labels.ts
- test_state_head.py
- validatePack.ts

## God Nodes (most connected - your core abstractions)
1. `StoryPack` - 18 edges
2. `Design Spec — AI-Driven Interactive Fiction ("Living Stories")` - 17 edges
3. `MeterState` - 16 edges
4. `startStory()` - 13 edges
5. `File Structure` - 13 edges
6. `GameEngine` - 12 edges
7. `ROLES` - 11 edges
8. `Role` - 10 edges
9. `StoryNode` - 10 edges
10. `Embedder` - 9 edges

## Surprising Connections (you probably didn't know these)
- `LabelRow` --references--> `MeterState`  [EXTRACTED]
  scripts/build-labels.ts → src/state/storyTypes.ts
- `test_map_label_roundtrip()` --calls--> `map_label()`  [EXTRACTED]
  ml-training/tests/test_taxonomy.py → ml-training/taxonomy.py
- `ActResult` --references--> `MeterState`  [EXTRACTED]
  src/engine/game.ts → src/state/storyTypes.ts
- `GameEngine` --references--> `MeterState`  [EXTRACTED]
  src/engine/game.ts → src/state/storyTypes.ts
- `startStory()` --calls--> `buildStanceIndex()`  [EXTRACTED]
  src/main.ts → src/engine/intentRouter.ts

## Import Cycles
- None detected.

## Communities (22 total, 1 thin omitted)

### Community 0 - "Package Manifest & Runtime Deps"
Cohesion: 0.06
Nodes (30): cytoscape, @huggingface/transformers, jsdom, author, dependencies, cytoscape, @huggingface/transformers, description (+22 more)

### Community 1 - "Game Engine & Turn Loop"
Cohesion: 0.13
Nodes (14): Part A — Validator + few-shot pipeline (agent-executable, offline, TDD), Part B — QLoRA fine-tune (CONDITIONAL; requires human: Kaggle P100 + HF Hub), Part C — Curation + catalog integration (agent-executable), Plan 4: Author-Time Story-Generation Pipeline, Self-Review, Task 1: Pack schema + graph validator (the safety gate), Task 2: Story bible schema + one authored bible, Task 3: Node-by-node generation harness + schema exemplars (+6 more)

### Community 2 - "Tone Scoring (ML)"
Cohesion: 0.09
Nodes (27): buildLabels(), LabelRow, toJsonl(), trimDelta(), ActInput, ActResult, LearnedStateHead, StateHeadWeights (+19 more)

### Community 3 - "Story Types & Flowchart"
Cohesion: 0.19
Nodes (6): GameEngine, StoryNode, renderScene(), SceneOpts, action, dialogue

### Community 4 - "Router & Meter Math"
Cohesion: 0.21
Nodes (17): matchesCondition(), pickTextVariant(), selectEdge(), applyDelta(), band(), bands(), clampState(), ActionNode (+9 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.14
Nodes (13): src, tests, vitest/globals, compilerOptions, esModuleInterop, module, moduleResolution, resolveJsonModule (+5 more)

### Community 6 - "Dev Dependencies"
Cohesion: 0.08
Nodes (28): map_label(), Plan 3 Task 1 — map source-dataset emotion labels onto the game's 14 TONE_LABELS, The set of TONE_LABELS that at least one source label maps to., TONE_LABELS that no source label maps to., Map a source (dataset, label) to a TONE_LABELS entry, or None if dropped., reachable_targets(), unreachable_targets(), Offline completeness tests for the taxonomy mapping (Plan 3 Task 1).  Run: pytho (+20 more)

### Community 7 - "App Wiring & Menu/Meter UI"
Cohesion: 0.14
Nodes (9): Embedder, MockEmbedder, buildStanceIndex(), nearestStance(), StanceRouter, cosineSimilarity(), l2normalize(), TransformersEmbedder (+1 more)

### Community 8 - "Scene UI"
Cohesion: 0.12
Nodes (16): Part A — Data preparation (agent-executable, offline, TDD), Part B — Model training (requires human: Kaggle + HuggingFace Hub accounts), Part C — Wiring + verification (agent-executable, offline-testable, mirrors Plan 1/2's pattern), Plan 3: Fine-Tuned Tone Encoder + Learned State Head, Self-Review, Task 10: Wire into `main.ts` + browser verification, Task 11 (optional): Reuse the fine-tuned MiniLM backbone for Plan 2's embeddings, Task 1: Emotion taxonomy mapping (source datasets → TONE_LABELS) (+8 more)

### Community 13 - "Design Spec — AI-Driven Interactive Fiction ("Living Stories")"
Cohesion: 0.09
Nodes (21): 10. Frontend & deployment, 11. Kaggle training recipe (checkpoint/resume), 12. Starter story lineup, 13. Upgrades (cool, easy), 14. Build order (playable from phase 0), 15. To verify during implementation, 16. Notes, 1. Summary (+13 more)

### Community 14 - "File Structure"
Cohesion: 0.12
Nodes (16): File Structure, Global Constraints, Self-Review, Task 10: Menu + main wiring (playable end-to-end with MockScorer), Task 11: Real client-side ML — TransformersScorer, Task 12: Production build + GitHub Pages deploy, Task 1: Project scaffold, Task 2: Story types + sample pack fixture (+8 more)

### Community 15 - "Part B — Plan 2: Free-Text Dialogue (Semantic Stance Routing)"
Cohesion: 0.15
Nodes (12): File Structure (new/changed), Free-Text Dialogue (Semantic Stance Routing) — Plan + Remaining Roadmap, Part A — Remaining Roadmap, Part B — Plan 2: Free-Text Dialogue (Semantic Stance Routing), Self-Review, Task 1: Similarity math + Embedder interface + MockEmbedder, Task 2: Pure nearest-stance selection + StanceRouter, Task 3: Per-pack stance index (all dialogue nodes) (+4 more)

### Community 17 - "Part B — Detroit-grade UI upgrades (agent-executable now, TDD + browser verify)"
Cohesion: 0.14
Nodes (13): Part A — Two more story packs (depends on Plan 4 pipeline), Part B — Detroit-grade UI upgrades (agent-executable now, TDD + browser verify), Part C — QA + polish, Plan 5: Story-Library Expansion + Detroit-Grade UI Upgrades, Self-Review, Task 1: THE SEVENTH GUEST (Victorian locked-room, INSIGHT-driven), Task 2: NINE MINUTES TO MIDNIGHT (neon-noir heist, loyalty + heat + time), Task 3: Ghost paths on the flowchart (spec §13, §10) (+5 more)

### Community 18 - "train_state_head.py"
Cohesion: 0.36
Nodes (9): delta_vec(), fit(), load_rows(), main(), onehot(), Plan 3 Task 5 — train the state-update head (agent-executable, CPU, no GPU).  Le, Build (X tone one-hot, Y Δstate) from the intent table + labels.jsonl., Ridge-regularized least squares: W (14x4) minimizing ||X·W - Y||² + λ||W||². (+1 more)

### Community 19 - "build-labels.ts"
Cohesion: 0.29
Nodes (7): StoryPack, buildElements(), Flowchart, classifyNodes(), ghostEdgeKeys(), NodeVizState, successors()

### Community 20 - "test_state_head.py"
Cohesion: 0.48
Nodes (6): load(), Plan 3 Task 5 test — verify the learned state-head artifact.  Pure stdlib (no nu, test_fit_quality_reported(), test_recovers_authored_intent(), test_shapes(), test_state_block_is_zero()

### Community 21 - "validatePack.ts"
Cohesion: 0.23
Nodes (11): bfs(), buildAdjacency(), checkBandCondition(), checkEdges(), checkTextVariant(), finalize(), isObject(), VALID_BANDS (+3 more)

## Knowledge Gaps
- **116 isolated node(s):** `name`, `version`, `description`, `dev`, `build` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `StoryPack` connect `build-labels.ts` to `Tone Scoring (ML)`, `Story Types & Flowchart`, `Router & Meter Math`, `App Wiring & Menu/Meter UI`, `validatePack.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `startStory()` connect `Tone Scoring (ML)` to `build-labels.ts`, `Story Types & Flowchart`, `App Wiring & Menu/Meter UI`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Manifest & Runtime Deps` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Game Engine & Turn Loop` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Tone Scoring (ML)` be split into smaller, more focused modules?**
  _Cohesion score 0.08521870286576169 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._