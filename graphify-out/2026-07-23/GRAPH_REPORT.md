# Graph Report - living-stories  (2026-07-23)

## Corpus Check
- 67 files · ~32,261 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 375 nodes · 681 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `49a6042b`
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
- stats.ts

## God Nodes (most connected - your core abstractions)
1. `MeterState` - 21 edges
2. `StoryPack` - 20 edges
3. `startStory()` - 17 edges
4. `Design Spec — AI-Driven Interactive Fiction ("Living Stories")` - 17 edges
5. `Role` - 14 edges
6. `File Structure` - 13 edges
7. `GameEngine` - 12 edges
8. `ROLES` - 12 edges
9. `StoryNode` - 10 edges
10. `Embedder` - 9 edges

## Surprising Connections (you probably didn't know these)
- `LabelRow` --references--> `MeterState`  [EXTRACTED]
  scripts/build-labels.ts → src/state/storyTypes.ts
- `ActResult` --references--> `MeterState`  [EXTRACTED]
  src/engine/game.ts → src/state/storyTypes.ts
- `test_map_label_roundtrip()` --calls--> `map_label()`  [EXTRACTED]
  ml-training/tests/test_taxonomy.py → ml-training/taxonomy.py
- `GameEngine` --references--> `MeterState`  [EXTRACTED]
  src/engine/game.ts → src/state/storyTypes.ts
- `startStory()` --calls--> `buildStanceIndex()`  [EXTRACTED]
  src/main.ts → src/engine/intentRouter.ts

## Import Cycles
- None detected.

## Communities (23 total, 1 thin omitted)

### Community 0 - "Package Manifest & Runtime Deps"
Cohesion: 0.06
Nodes (30): cytoscape, @huggingface/transformers, jsdom, author, dependencies, cytoscape, @huggingface/transformers, description (+22 more)

### Community 1 - "Game Engine & Turn Loop"
Cohesion: 0.13
Nodes (14): Part A — Validator + few-shot pipeline (agent-executable, offline, TDD), Part B — QLoRA fine-tune (CONDITIONAL; requires human: Kaggle P100 + HF Hub), Part C — Curation + catalog integration (agent-executable), Plan 4: Author-Time Story-Generation Pipeline, Self-Review, Task 1: Pack schema + graph validator (the safety gate), Task 2: Story bible schema + one authored bible, Task 3: Node-by-node generation harness + schema exemplars (+6 more)

### Community 2 - "Tone Scoring (ML)"
Cohesion: 0.12
Nodes (18): LearnedStateHead, StateHeadWeights, LinearHead, StateHead, main(), MeterState, Role, ROLES (+10 more)

### Community 3 - "Story Types & Flowchart"
Cohesion: 0.18
Nodes (12): buildLabels(), LabelRow, toJsonl(), trimDelta(), MockScorer, TONE_LABELS, ToneScorer, ToneVector (+4 more)

### Community 4 - "Router & Meter Math"
Cohesion: 0.12
Nodes (22): ActInput, ActResult, GameEngine, matchesCondition(), pickTextVariant(), selectEdge(), applyDelta(), band() (+14 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.14
Nodes (13): src, tests, vitest/globals, compilerOptions, esModuleInterop, module, moduleResolution, resolveJsonModule (+5 more)

### Community 6 - "Dev Dependencies"
Cohesion: 0.08
Nodes (28): map_label(), Plan 3 Task 1 — map source-dataset emotion labels onto the game's 14 TONE_LABELS, The set of TONE_LABELS that at least one source label maps to., TONE_LABELS that no source label maps to., Map a source (dataset, label) to a TONE_LABELS entry, or None if dropped., reachable_targets(), unreachable_targets(), Offline completeness tests for the taxonomy mapping (Plan 3 Task 1).  Run: pytho (+20 more)

### Community 7 - "App Wiring & Menu/Meter UI"
Cohesion: 0.13
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
Cohesion: 0.26
Nodes (7): StoryPack, buildElements(), Flowchart, classifyNodes(), ghostEdgeKeys(), NodeVizState, successors()

### Community 20 - "test_state_head.py"
Cohesion: 0.48
Nodes (6): load(), Plan 3 Task 5 test — verify the learned state-head artifact.  Pure stdlib (no nu, test_fit_quality_reported(), test_recovers_authored_intent(), test_shapes(), test_state_block_is_zero()

### Community 21 - "validatePack.ts"
Cohesion: 0.21
Nodes (12): StoryManifestEntry, bfs(), buildAdjacency(), checkBandCondition(), checkEdges(), checkTextVariant(), finalize(), isObject() (+4 more)

### Community 22 - "stats.ts"
Cohesion: 0.25
Nodes (9): startStory(), EndingInfo, EndingStat, endingStats(), packEndings(), readCounts(), recordEnding(), storageKey() (+1 more)

## Knowledge Gaps
- **118 isolated node(s):** `name`, `version`, `description`, `dev`, `build` (+113 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `StoryPack` connect `build-labels.ts` to `Tone Scoring (ML)`, `Story Types & Flowchart`, `Router & Meter Math`, `App Wiring & Menu/Meter UI`, `validatePack.ts`, `stats.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `startStory()` connect `stats.ts` to `Tone Scoring (ML)`, `Story Types & Flowchart`, `Router & Meter Math`, `App Wiring & Menu/Meter UI`, `build-labels.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `MeterState` connect `Tone Scoring (ML)` to `Story Types & Flowchart`, `Router & Meter Math`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _118 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Manifest & Runtime Deps` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Game Engine & Turn Loop` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Tone Scoring (ML)` be split into smaller, more focused modules?**
  _Cohesion score 0.12222222222222222 - nodes in this community are weakly interconnected._