# Free-Text Dialogue (Semantic Stance Routing) — Plan + Remaining Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement Part B task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Context:** Plan 1 (`docs/superpowers/plans/2026-07-20-web-engine-and-client-ml.md`) is complete — a playable client-side interactive-fiction engine with transparent ML stand-ins (`MockScorer`, `LinearHead`) and an off-the-shelf `TransformersScorer`. This document is **Part A** a roadmap for all remaining work, and **Part B** a detailed, TDD-style plan for the next phase: the free-text dialogue feature.

**Design decision this plan implements:** the player can type anything on a *dialogue node*, and the NPC replies with the **closest correct authored response** — never a freely generated one. The fully-generative NPC-dialogue idea was intentionally cut (load-bearing generation on a free client-side model breaks the anti-hallucination bounds, spec §6). See spec §7 "Free-text conversation" for the three-layer scheme.

---

## Part A — Remaining Roadmap

Decisions driving this roadmap: **fine-tune existing models** (not train from scratch, not purely off-the-shelf); **dialogue feature first**; embeddings for the dialogue feature come from an off-the-shelf MiniLM today, so this phase does not block on any training.

| Plan | Scope | ML | Prereqs |
|------|-------|----|---------| 
| **Plan 2 (this doc, NEXT)** | Free-text dialogue: semantic routing to authored stances (spec §7 Layers 1–2) + optional non-load-bearing 0.5B flavor line (Layer 3). | Off-the-shelf `Xenova/all-MiniLM-L6-v2` embeddings; optional `onnx-community/Qwen2.5-0.5B-Instruct`. No training. | None (models pull from HF Hub at runtime). |
| **Plan 3** | Replace the two stand-ins with fine-tuned models, behind the existing `ToneScorer` / `StateHead` interfaces. Fine-tune MiniLM → 14-label tone taxonomy (spec §4.1); train tiny MLP state head on `labels.jsonl` (spec §4.2). Export int8 ONNX. Author `labels.jsonl` from the packs. | Fine-tune MiniLM + train MLP head on Kaggle. | Kaggle account (GPU) + HuggingFace Hub account for checkpoint/resume (spec §11). Reuse the SAME fine-tuned MiniLM for both tone AND the Plan 2 embeddings. |
| **Plan 4** | Author-time story-generation pipeline: fine-tune (or few-shot) `Qwen2.5-3B-Instruct` on Facebook LIGHT + schema exemplars to bake new branching `story.json` packs node-by-node within anti-hallucination bounds (spec §4.3, §6). | Fine-tune/few-shot 3B (offline, Kaggle). | Same accounts as Plan 3; `labels.jsonl` schema stabilized. |
| **Plan 5** | Two more story packs — THE SEVENTH GUEST, NINE MINUTES TO MIDNIGHT (spec §12) — via the Plan 4 pipeline; upgrades (spec §13: hover tone tooltip, memory callbacks, end-screen divergence stats); **deploy hardening** (create git remote, first live GitHub Pages deploy, cross-browser QA). | Reuses Plans 2–3. | GitHub repo. |

**Plan 1 loose ends, folded in:** the never-done real-browser playthrough is covered by Plan 2 Task 6 (we verify the dialogue feature in-browser anyway). The missing git remote + first Pages deploy are grouped into Plan 5 but can be done at any time — they need only a GitHub repo.

---

## Part B — Plan 2: Free-Text Dialogue (Semantic Stance Routing)

**Goal:** On a dialogue node, typed free text is embedded and cosine-matched to the node's authored **stances**; the nearest stance (above a similarity threshold) supplies the NPC's authored response and branch. Below threshold → the authored `fallbackStance`. Layer 1 (typed text → meters via the scorer) already works and is unchanged. An optional 0.5B flavor line (Layer 3) can prepend a short bridging sentence, never load-bearing.

**Architecture:** Keep the existing split — pure logic (cosine similarity, nearest-stance selection) is DOM/ML-free and fully unit-tested; the embedder sits behind an `Embedder` interface with a deterministic `MockEmbedder` for tests and a `TransformersEmbedder` (MiniLM via transformers.js) for prod. `GameEngine` gains an **optional** stance router, so absent/failed routing degrades gracefully to today's fallback behavior. No story-pack schema change is required — anchor embeddings are computed once at load time from the existing `anchorPhrasings` (baking them into `story.json` per spec §9 is a later optimization).

**Constraints:** Free only, fully client-side, no keys, no server. Embeddings + flavor LM lazy-load from HF Hub with graceful fallback (same pattern as Plan 1's `TransformersScorer`). Unit/CI runs stay offline (real-model tests guarded behind `RUN_ML=1`).

**UI note (keep in proportion):** logic is the priority. Visual polish should look professionally made, achieved by leaning on the **`/frontend-animation` skill** (Motion / anime.js for this vanilla-TS stack) rather than hand-rolling — but don't over-invest per task. Budget a dedicated **1–2 task visual polish pass** (candidate: a short "Task 8: polish pass" appended here, or defer to Plan 5) instead of styling every task. In this plan, only the tiny "reading…" affordance in Task 6 gets animation; the rest of Plan 2 is logic.

### File Structure (new/changed)

- `src/engine/similarity.ts` — pure `cosineSimilarity`, `l2normalize`. No DOM/ML.
- `src/engine/embedder.ts` — `Embedder` interface + deterministic `MockEmbedder`.
- `src/engine/intentRouter.ts` — pure `nearestStance(...)` + `StanceRouter` class (holds embedder + precomputed anchor index; async `route(text)`).
- `src/ml/transformersEmbedder.ts` — real `Embedder` via MiniLM feature-extraction.
- `src/ml/flavorLm.ts` — optional 0.5B bridging-line generator (Task 7).
- `src/engine/game.ts` — accept an optional `StanceRouter`; use it for free-text on dialogue nodes; expose `stanceId` on `ActResult`.
- `src/main.ts` — build a `StanceRouter` (real embedder) with graceful fallback; optional flavor LM.
- `tests/*.test.ts` — colocated unit tests; guarded integration tests for the real models.

---

### Task 1: Similarity math + Embedder interface + MockEmbedder

**Files:** Create `src/engine/similarity.ts`, `src/engine/embedder.ts`. Test: `tests/similarity.test.ts`, `tests/embedder.test.ts`.

**Interfaces produced:** `cosineSimilarity(a: number[], b: number[]): number`, `l2normalize(v: number[]): number[]`; `interface Embedder { embed(text: string): Promise<number[]>; embedBatch(texts: string[]): Promise<number[][]> }`; `class MockEmbedder implements Embedder`.

- [ ] **Step 1: Write failing tests**

`tests/similarity.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cosineSimilarity, l2normalize } from "../src/engine/similarity";

describe("similarity", () => {
  it("cosine of identical vectors is 1, orthogonal is 0", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is scale-invariant", () => {
    expect(cosineSimilarity([2, 0], [5, 0])).toBeCloseTo(1);
  });
  it("l2normalize yields unit length", () => {
    const n = l2normalize([3, 4]);
    expect(Math.hypot(...n)).toBeCloseTo(1);
  });
  it("handles the zero vector without NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
```

`tests/embedder.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MockEmbedder } from "../src/engine/embedder";
import { cosineSimilarity } from "../src/engine/similarity";

describe("MockEmbedder", () => {
  it("is deterministic and unit-length", async () => {
    const e = new MockEmbedder();
    const a = await e.embed("I believe you");
    const b = await e.embed("I believe you");
    expect(a).toEqual(b);
    expect(Math.hypot(...a)).toBeCloseTo(1);
  });
  it("puts phrases sharing words closer than unrelated ones", async () => {
    const e = new MockEmbedder();
    const q = await e.embed("I believe you, you're safe with me");
    const near = await e.embed("you're safe with me");
    const far = await e.embed("you killed him, stop lying");
    expect(cosineSimilarity(q, near)).toBeGreaterThan(cosineSimilarity(q, far));
  });
});
```

- [ ] **Step 2: Run tests, verify fail** — `npm test` (cannot resolve modules).

- [ ] **Step 3: Implement**

`src/engine/similarity.ts`:
```ts
export function l2normalize(v: number[]): number[] {
  const mag = Math.hypot(...v);
  return mag === 0 ? v.slice() : v.map((x) => x / mag);
}
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const denom = Math.sqrt(ma) * Math.sqrt(mb);
  return denom === 0 ? 0 : dot / denom;
}
```

`src/engine/embedder.ts`:
```ts
import { l2normalize } from "./similarity";

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Deterministic hashing bag-of-words embedder for tests + offline dev.
 *  Shared tokens map to shared dimensions, so lexical overlap ⇒ higher cosine. */
export class MockEmbedder implements Embedder {
  constructor(private dim = 256) {}
  async embed(text: string): Promise<number[]> {
    const v = new Array(this.dim).fill(0);
    for (const tok of text.toLowerCase().split(/[^a-z']+/).filter(Boolean)) {
      v[this.hash(tok) % this.dim] += 1;
    }
    return l2normalize(v);
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
  private hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
}
```

- [ ] **Step 4: Run tests, verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `feat: cosine similarity + Embedder interface + MockEmbedder`.

---

### Task 2: Pure nearest-stance selection + StanceRouter

**Files:** Create `src/engine/intentRouter.ts`. Test: `tests/intentRouter.test.ts`.

**Interfaces produced:**
- `nearestStance(query: number[], stanceAnchors: number[][][], threshold: number): { index: number; score: number } | null` — pure; `stanceAnchors[i]` = the list of anchor embeddings for stance `i`; a stance's score is the **max** cosine over its anchors; returns the best stance if its score ≥ threshold, else `null` (caller uses the fallback stance).
- `class StanceRouter` — built from an `Embedder` + a dialogue node's stances; `route(text): Promise<{ stanceId: string; score: number; isFallback: boolean }>`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { nearestStance, StanceRouter } from "../src/engine/intentRouter";
import { MockEmbedder } from "../src/engine/embedder";
import pack from "../public/stories/revenant.json";
import { StoryPack } from "../src/state/storyTypes";

describe("nearestStance (pure)", () => {
  it("picks the stance with the highest max-anchor cosine", () => {
    const q = [1, 0];
    const anchors = [[[0, 1]], [[1, 0], [0.9, 0.1]]]; // stance 1 aligns with q
    expect(nearestStance(q, anchors, 0.5)!.index).toBe(1);
  });
  it("returns null below threshold", () => {
    expect(nearestStance([1, 0], [[[0, 1]]], 0.5)).toBeNull();
  });
});

describe("StanceRouter over the revenant 'talk' node", () => {
  const talk = (pack as unknown as StoryPack).nodes.find((n) => n.id === "talk")! as any;

  it("routes empathetic free text to the empathize stance", async () => {
    const r = await StanceRouter.build(new MockEmbedder(), talk.stances, talk.fallbackStanceId, 0.15);
    const out = await r.route("I believe you, you're safe with me");
    expect(out.stanceId).toBe("empathize");
    expect(out.isFallback).toBe(false);
  });
  it("routes accusatory free text to the press stance", async () => {
    const r = await StanceRouter.build(new MockEmbedder(), talk.stances, talk.fallbackStanceId, 0.15);
    expect((await r.route("you killed him, stop lying")).stanceId).toBe("press");
  });
  it("falls back on off-topic input", async () => {
    const r = await StanceRouter.build(new MockEmbedder(), talk.stances, talk.fallbackStanceId, 0.15);
    const out = await r.route("what is the weather forecast tomorrow");
    expect(out.isFallback).toBe(true);
    expect(out.stanceId).toBe(talk.fallbackStanceId);
  });
});
```

- [ ] **Step 2: Run tests, verify fail.**

- [ ] **Step 3: Implement**

```ts
import { cosineSimilarity } from "./similarity";
import { Embedder } from "./embedder";
import { Stance } from "../state/storyTypes";

export function nearestStance(
  query: number[], stanceAnchors: number[][][], threshold: number,
): { index: number; score: number } | null {
  let best = { index: -1, score: -Infinity };
  stanceAnchors.forEach((anchors, i) => {
    const score = Math.max(...anchors.map((a) => cosineSimilarity(query, a)));
    if (score > best.score) best = { index: i, score };
  });
  return best.index >= 0 && best.score >= threshold ? best : null;
}

export class StanceRouter {
  private constructor(
    private stances: Stance[],
    private fallbackStanceId: string,
    private anchorEmbeddings: number[][][],
    private embedder: Embedder,
    private threshold: number,
  ) {}

  static async build(embedder: Embedder, stances: Stance[], fallbackStanceId: string, threshold = 0.4): Promise<StanceRouter> {
    const anchorEmbeddings = await Promise.all(
      stances.map((s) => embedder.embedBatch(s.anchorPhrasings)),
    );
    return new StanceRouter(stances, fallbackStanceId, anchorEmbeddings, embedder, threshold);
  }

  async route(text: string): Promise<{ stanceId: string; score: number; isFallback: boolean }> {
    const q = await this.embedder.embed(text);
    const hit = nearestStance(q, this.anchorEmbeddings, this.threshold);
    if (!hit) return { stanceId: this.fallbackStanceId, score: hit ? 0 : 0, isFallback: true };
    return { stanceId: this.stances[hit.index].id, score: hit.score, isFallback: false };
  }
}
```
> Export `Stance` from `storyTypes` if it isn't already (Plan 1 defined it but check the `export`).

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `feat: semantic stance routing (nearestStance + StanceRouter)`.

---

### Task 3: Per-pack stance index (all dialogue nodes)

**Files:** extend `src/engine/intentRouter.ts`. Test: add to `tests/intentRouter.test.ts`.

**Interface produced:** `buildStanceIndex(pack: StoryPack, embedder: Embedder, threshold?: number): Promise<Map<string, StanceRouter>>` — one `StanceRouter` per dialogue node, keyed by node id. Action nodes are skipped.

- [ ] **Step 1: Failing test** — assert the index has a router for `"talk"` and none for `"cell"`, and that `index.get("talk")!.route("I believe you")` resolves to `empathize`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — iterate `pack.nodes`, for each `type === "dialogue"` call `StanceRouter.build(embedder, node.stances, node.fallbackStanceId, threshold)`.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** — `feat: build per-node stance index for a pack`.

---

### Task 4: Wire semantic routing into GameEngine

**Files:** Modify `src/engine/game.ts`. Test: extend `tests/game.test.ts`.

**Change:** add an **optional** 4th constructor arg `stanceIndex?: Map<string, StanceRouter>`. In the free-text branch of a dialogue node (currently `game.ts:60-67`), if a router exists for the current node, `await router.route(input.text)` to pick the stance and use that stance's `npcResponse` + `edges`; if no router (or it throws), keep today's `fallbackStance` behavior. Layer 1 is unchanged — still score `input.text` for deltas. Add optional `stanceId?: string` to `ActResult`.

- [ ] **Step 1: Write failing tests** (additions):
```ts
import { buildStanceIndex } from "../src/engine/intentRouter";
import { MockEmbedder } from "../src/engine/embedder";

it("free text routes to the nearest authored stance", async () => {
  const index = await buildStanceIndex(pack as unknown as StoryPack, new MockEmbedder(), 0.15);
  const g = new GameEngine(pack as unknown as StoryPack, new MockScorer(), new LinearHead(), index);
  await g.act({ choiceId: "open" }); // -> talk
  const res = await g.act({ text: "I believe you, you're safe with me" });
  expect(res.stanceId).toBe("empathize");
  expect(res.npcResponse).toContain("Scared"); // empathize stance's authored line
});

it("without a stance index, free text uses the fallback stance (back-compat)", async () => {
  const g = new GameEngine(pack as unknown as StoryPack, new MockScorer(), new LinearHead());
  await g.act({ choiceId: "open" });
  const res = await g.act({ text: "anything at all" });
  expect(res.stanceId).toBe("press"); // fallbackStanceId
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — thread the optional index; wrap `route()` in try/catch mirroring the existing `scoreTone` guard (a routing failure must not freeze the turn — fall back to `fallbackStanceId`). Replace the stale `// Plan 4 adds semantic routing` comment.
- [ ] **Step 4: Verify pass** — full suite green, existing Plan 1 game tests unaffected.
- [ ] **Step 5: Commit** — `feat: route dialogue free-text to nearest stance in GameEngine`.

---

### Task 5: TransformersEmbedder (real MiniLM, off-the-shelf)

**Files:** Create `src/ml/transformersEmbedder.ts`. Test: `tests/transformersEmbedder.test.ts` (guarded by `RUN_ML=1`, skipped by default, like Plan 1's `transformersScorer.test.ts`).

**Interface produced:** `class TransformersEmbedder implements Embedder` with `static create(modelId?: string): Promise<TransformersEmbedder>`.

- [ ] **Step 1: Guarded integration test** — `RUN_ML` gate; assert `embed("I believe you")` returns a fixed-length `number[]`, and that an empathetic line scores higher cosine to `"you're safe"` than to `"you killed him"`.
- [ ] **Step 2: Verify skipped by default.**
- [ ] **Step 3: Implement**
```ts
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { Embedder } from "../engine/embedder";

export class TransformersEmbedder implements Embedder {
  private constructor(private extractor: FeatureExtractionPipeline) {}
  static async create(modelId = "Xenova/all-MiniLM-L6-v2"): Promise<TransformersEmbedder> {
    const extractor = (await pipeline("feature-extraction", modelId, { dtype: "q8" })) as FeatureExtractionPipeline;
    return new TransformersEmbedder(extractor);
  }
  async embed(text: string): Promise<number[]> {
    const out = await this.extractor(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    const out = await this.extractor(texts, { pooling: "mean", normalize: true });
    return (out.tolist() as number[][]);
  }
}
```
> Verify the exact transformers.js v3 tensor accessors (`out.data` / `out.tolist()`) during Step 4; adjust if the API differs. MiniLM is normalized already, so a routing `threshold` around **0.4** is a sane default — tune during Task 6.

- [ ] **Step 4: Optional local check** — `RUN_ML=1 npm test`.
- [ ] **Step 5: Commit** — `feat: in-browser MiniLM embedder (off-the-shelf)`.

---

### Task 6: Wire the real router into main.ts + browser verification

**Files:** Modify `src/main.ts`.

**Change:** in `startStory`, after loading the pack, try to build a real stance index and pass it to the engine; on any failure, warn and continue (engine falls back to authored fallback stances). Reuse the existing scorer-fallback pattern.
```ts
let stanceIndex: Map<string, StanceRouter> | undefined;
try {
  const { TransformersEmbedder } = await import("./ml/transformersEmbedder");
  const { buildStanceIndex } = await import("./engine/intentRouter");
  stanceIndex = await buildStanceIndex(pack, await TransformersEmbedder.create());
} catch (err) {
  console.warn("stance router unavailable, using fallback stances:", err);
}
const engine = new GameEngine(pack, scorer, new LinearHead(), stanceIndex);
```
Show a brief "reading…" state on the scene while `route()` awaits (typed turns now do async embedding). Optionally surface the matched stance id subtly for debugging.

- [ ] **Step 1:** Implement the wiring + loading affordance.
- [ ] **Step 2: Browser verification (also clears Plan 1's Task 10/11 loose end).** `npm run dev`; play `open → talk`; type several distinct lines (empathetic, accusatory, off-topic) and confirm the NPC's authored response + branch change with meaning, meters still move, and it degrades cleanly offline. Confirm `sign → sign_end` path still works. Capture a screenshot as proof.
- [ ] **Step 3: Commit** — `feat: wire MiniLM stance router into app with graceful fallback`.

---

### Task 7 (optional): Layer 3 — non-load-bearing 0.5B flavor line

**Files:** Create `src/ml/flavorLm.ts`; optionally thread through `game.ts`/`main.ts` behind a flag. Test: guarded (`RUN_ML=1`).

**Interface produced:** `class FlavorLM { static create(modelId?: string): Promise<FlavorLM>; bridge(playerText: string, state: MeterState, npcResponse: string): Promise<string> }` using `onnx-community/Qwen2.5-0.5B-Instruct` via a `text-generation` pipeline, lazy-loaded. Generates ONE short sentence acknowledging the player's exact wording, conditioned on state, prepended to the authored `npcResponse`. **On any error or timeout, return `""`** — the authored line stands alone. Must be fully optional and off by default; game plays identically if it never loads (spec §4.4).

- [ ] Steps mirror Task 5 (guarded test → skip-by-default → implement → optional manual check → commit `feat: optional 0.5B flavor bridging line (never load-bearing)`).

---

## Self-Review

- **Spec coverage:** §7 Layer 1 (already done, unchanged), Layer 2 (Tasks 1–6), Layer 3 (Task 7, optional). §8 runtime data flow (embed → cosine-match stance → authored response) realized. "Generalizes to unseen phrasings, not if/else" — satisfied by cosine matching over embeddings.
- **Architecture consistency:** pure logic (`similarity`, `nearestStance`) DOM/ML-free and unit-tested; ML behind `Embedder` with Mock + Transformers impls; engine change is an **optional** arg → back-compatible, all Plan 1 tests keep passing; graceful degradation at both load time (main.ts try/catch) and mid-game (route() try/catch), mirroring Plan 1's scorer guards.
- **No schema change / no training:** anchor embeddings computed at load time from existing `anchorPhrasings`; MiniLM is off-the-shelf. Baking `anchorEmbeddings` into `story.json` (spec §9) and reusing a fine-tuned MiniLM (Plan 3) are noted as later swaps behind the same interfaces.
- **Deferred by design:** fine-tuned tone/head models (Plan 3), authoring pipeline (Plan 4), more packs + deploy hardening (Plan 5).
