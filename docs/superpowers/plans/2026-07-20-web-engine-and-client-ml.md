# Web Engine + Client-Side ML Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, static, client-side interactive-fiction game — scene text, choices, free-text input box, live Detroit-style relationship meters, and a branching flowchart — where a swappable ML scorer drives a continuous accumulated state that selects which authored content the player reaches.

**Architecture:** Vite + vanilla TypeScript. Pure-logic core (meters, router, engine) is fully unit-tested and knows nothing about the DOM or ML. A `ToneScorer` interface abstracts the ML: a deterministic `MockScorer` powers tests and early dev; a `TransformersScorer` (transformers.js loading a MiniLM ONNX model) drops in behind the same interface. A hand-authored sample story pack makes the whole thing runnable without the training pipeline. UI and Cytoscape flowchart are thin renderers over engine state.

**Tech Stack:** Vite, TypeScript, Vitest (+ jsdom), `@huggingface/transformers` (transformers.js), Cytoscape.js. Deployed to GitHub Pages.

## Global Constraints

- Free only: no paid APIs, compute, or hosting. No API keys at runtime.
- Fully client-side: no server, no per-request quota. Static build only.
- Deploy target: GitHub Pages (static files under `dist/`).
- ML runs in-browser via transformers.js (WebGPU with WASM fallback). Models pulled from HuggingFace Hub (free) or `public/models/`.
- No load-bearing text generated at runtime by a small model. Prose is authored; the LM (later plan) only does short flavor lines.
- Meter roles are fixed and canonical: `RAPPORT`, `VOLATILITY`, `PRESSURE`, `INSIGHT`. Meter values are floats in `[0, 100]`.
- State bands: `low` = value < 34, `mid` = 34–66 inclusive, `high` = value > 66.
- Node.js 18+ and npm.

---

## File Structure

- `src/state/storyTypes.ts` — all shared TypeScript types for a story pack and state. No logic.
- `src/state/meters.ts` — pure meter math: clamp, apply delta, banding. No DOM.
- `src/engine/router.ts` — pure selection logic: pick text variant, match bands, select edge.
- `src/engine/scorer.ts` — `ToneScorer` / `StateHead` interfaces, `MockScorer`, `LinearHead` (transparent stand-in for the learned head).
- `src/engine/game.ts` — `GameEngine`: orchestrates a turn (act → score → delta → route), tracks history.
- `src/ml/transformersScorer.ts` — real `ToneScorer` using transformers.js.
- `src/ui/meters.ts` — renders/animates meter bars from `MeterState`.
- `src/ui/scene.ts` — renders scene text, choice buttons, and free-text input.
- `src/ui/flowchart.ts` — Cytoscape flowchart with ghost (untaken) paths.
- `src/ui/menu.ts` — story-library menu from the manifest.
- `src/main.ts` — wires manifest → menu → engine → UI.
- `public/stories/index.json` — manifest of available packs.
- `public/stories/revenant.json` — hand-authored sample pack (test fixture + first playable story).
- `tests/*.test.ts` — unit/DOM tests colocated by module.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.ts`, `.gitignore`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working Vite+TS+Vitest project; `npm test` and `npm run dev` both run.

- [ ] **Step 1: Initialize repo and package**

Run in the project root:
```bash
git init
npm init -y
npm install --save-dev typescript vite vitest jsdom @types/node
npm install @huggingface/transformers cytoscape
```

- [ ] **Step 2: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { globals: true, environment: "jsdom" },
});
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
// base is set for GitHub Pages project sites; adjust repo name in Task 12.
export default defineConfig({ base: "./" });
```

Add scripts to `package.json`:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

`.gitignore`:
```
node_modules
dist
.DS_Store
```

`index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Living Stories</title></head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (temporary):
```ts
document.getElementById("app")!.textContent = "Living Stories";
```

- [ ] **Step 3: Write the smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("scaffold", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + ts + vitest project"
```

---

### Task 2: Story types + sample pack fixture

**Files:**
- Create: `src/state/storyTypes.ts`, `public/stories/revenant.json`, `public/stories/index.json`
- Test: `tests/storyPack.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: types `Role`, `Band`, `MeterState`, `TextVariant`, `Edge`, `Choice`, `Stance`, `ActionNode`, `DialogueNode`, `StoryNode`, `StoryPack`, `StoryManifestEntry`; a valid `revenant.json` pack usable as a test fixture and the first playable story.

- [ ] **Step 1: Write the types**

`src/state/storyTypes.ts`:
```ts
export type Role = "RAPPORT" | "VOLATILITY" | "PRESSURE" | "INSIGHT";
export const ROLES: Role[] = ["RAPPORT", "VOLATILITY", "PRESSURE", "INSIGHT"];
export type Band = "low" | "mid" | "high";

/** Meter values are floats in [0,100], keyed by canonical role. */
export type MeterState = Record<Role, number>;

/** A condition on state: each named role must be in the given band. */
export type BandCondition = Partial<Record<Role, Band>>;

export interface TextVariant {
  text: string;
  when?: BandCondition; // absent = default variant
}
export interface Edge {
  when?: BandCondition; // absent = always-eligible fallback
  nextId: string | null; // null = story ending
}
export interface Choice {
  id: string;
  text: string;
  toneTag?: string; // author-time hint only; runtime scores the text itself
  edges: Edge[];
}
export interface Stance {
  id: string;
  anchorPhrasings: string[]; // used by free-text routing (Plan 4)
  npcResponse: string;
  toneTag?: string;
  edges: Edge[];
}
interface BaseNode {
  id: string;
  textVariants: TextVariant[];
}
export interface ActionNode extends BaseNode {
  type: "action";
  choices: Choice[];
}
export interface DialogueNode extends BaseNode {
  type: "dialogue";
  stances: Stance[];
  fallbackStanceId: string;
}
export type StoryNode = ActionNode | DialogueNode;

export interface StoryPack {
  id: string;
  title: string;
  genre: string;
  meterLabels: Record<Role, string | null>; // null = meter hidden for this story
  startNodeId: string;
  initialState: MeterState;
  nodes: StoryNode[];
}
export interface StoryManifestEntry {
  id: string;
  title: string;
  genre: string;
  blurb: string;
}
```

- [ ] **Step 2: Write the sample pack**

`public/stories/revenant.json` (hand-authored 4-node slice; both node types represented):
```json
{
  "id": "revenant",
  "title": "REVENANT",
  "genre": "Sci-fi interrogation",
  "meterLabels": { "RAPPORT": "NIX · Trust", "VOLATILITY": "NIX · Stability", "PRESSURE": "Warden", "INSIGHT": "Suspicion" },
  "startNodeId": "cell",
  "initialState": { "RAPPORT": 30, "VOLATILITY": 50, "PRESSURE": 50, "INSIGHT": 20 },
  "nodes": [
    {
      "id": "cell",
      "type": "action",
      "textVariants": [
        { "text": "The android NIX sits behind the glass, hands folded. The Warden's voice crackles: 'Sign the order. It killed a man.'" }
      ],
      "choices": [
        { "id": "open", "text": "Open the cell and sit across from NIX, so it feels safe enough to trust you.", "toneTag": "sincere",
          "edges": [{ "nextId": "talk" }] },
        { "id": "sign", "text": "Reach for the shutdown order.", "toneTag": "cold",
          "edges": [{ "nextId": "sign_end" }] }
      ]
    },
    {
      "id": "talk",
      "type": "dialogue",
      "textVariants": [
        { "text": "NIX studies you. 'You came in. They usually don't.' Its voice is careful.", "when": { "RAPPORT": "low" } },
        { "text": "NIX exhales — a learned, human gesture. 'You're not like the Warden. Ask me anything.'", "when": { "RAPPORT": "mid" } },
        { "text": "NIX leans forward, almost trusting. 'I'll tell you what happened. All of it.'", "when": { "RAPPORT": "high" } }
      ],
      "stances": [
        { "id": "empathize", "anchorPhrasings": ["I believe you", "I know you're scared", "you're safe with me"],
          "npcResponse": "'Scared.' NIX tests the word. 'Yes. That's the one.'", "toneTag": "empathetic",
          "edges": [{ "when": { "RAPPORT": "high" }, "nextId": "truth" }, { "nextId": "talk" }] },
        { "id": "press", "anchorPhrasings": ["you killed him", "tell me the truth now", "stop lying"],
          "npcResponse": "'You sound like him,' NIX says quietly, and looks away.", "toneTag": "aggressive",
          "edges": [{ "nextId": "talk" }] }
      ],
      "fallbackStanceId": "press"
    },
    {
      "id": "truth",
      "type": "action",
      "textVariants": [
        { "text": "'He was going to wipe me. I pushed him. He fell.' NIX meets your eyes. 'Do you believe that?'" }
      ],
      "choices": [
        { "id": "spare", "text": "'I believe you. You're not being shut down today.'", "toneTag": "sincere",
          "edges": [{ "nextId": null }] },
        { "id": "doom", "text": "'It doesn't matter what I believe. Sign here.'", "toneTag": "cold",
          "edges": [{ "nextId": null }] }
      ]
    },
    {
      "id": "sign_end",
      "type": "action",
      "textVariants": [{ "text": "The order confirms. NIX's eyes dim mid-sentence. The Warden thanks you. You don't answer." }],
      "choices": [{ "id": "end", "text": "Leave.", "edges": [{ "nextId": null }] }]
    }
  ]
}
```

`public/stories/index.json`:
```json
[
  { "id": "revenant", "title": "REVENANT", "genre": "Sci-fi interrogation", "blurb": "One android. One night. One signature that ends a life — or doesn't." }
]
```

- [ ] **Step 3: Write the fixture-validity test**

`tests/storyPack.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import pack from "../public/stories/revenant.json";
import { StoryPack, ROLES } from "../src/state/storyTypes";

describe("revenant fixture", () => {
  it("is a structurally valid pack", () => {
    const p = pack as unknown as StoryPack;
    expect(p.nodes.find((n) => n.id === p.startNodeId)).toBeTruthy();
    for (const r of ROLES) expect(typeof p.initialState[r]).toBe("number");
    // every non-null edge points to an existing node
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const n of p.nodes) {
      const edges = n.type === "action" ? n.choices.flatMap((c) => c.edges) : n.stances.flatMap((s) => s.edges);
      for (const e of edges) if (e.nextId !== null) expect(ids.has(e.nextId)).toBe(true);
    }
  });
});
```
Add `"resolveJsonModule": true` under `compilerOptions` in `tsconfig.json`.

- [ ] **Step 4: Run test, verify pass**

Run: `npm test`
Expected: fixture test passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: story types + revenant sample pack"
```

---

### Task 3: Meter math

**Files:**
- Create: `src/state/meters.ts`
- Test: `tests/meters.test.ts`

**Interfaces:**
- Consumes: `Role`, `Band`, `MeterState`, `ROLES` from `storyTypes`.
- Produces: `clampState(s): MeterState`, `applyDelta(s, d): MeterState`, `band(v): Band`, `bands(s): Record<Role, Band>`.

- [ ] **Step 1: Write failing tests**

`tests/meters.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { clampState, applyDelta, band, bands } from "../src/state/meters";

describe("meters", () => {
  it("bands by threshold", () => {
    expect(band(0)).toBe("low");
    expect(band(33)).toBe("low");
    expect(band(34)).toBe("mid");
    expect(band(66)).toBe("mid");
    expect(band(67)).toBe("high");
    expect(band(100)).toBe("high");
  });
  it("clamps into [0,100]", () => {
    const s = clampState({ RAPPORT: 150, VOLATILITY: -20, PRESSURE: 50, INSIGHT: 50 });
    expect(s.RAPPORT).toBe(100);
    expect(s.VOLATILITY).toBe(0);
  });
  it("applies and clamps deltas", () => {
    const s = applyDelta({ RAPPORT: 95, VOLATILITY: 50, PRESSURE: 50, INSIGHT: 50 }, { RAPPORT: 20 });
    expect(s.RAPPORT).toBe(100);
    expect(s.VOLATILITY).toBe(50);
  });
  it("computes all bands", () => {
    expect(bands({ RAPPORT: 10, VOLATILITY: 50, PRESSURE: 80, INSIGHT: 34 })).toEqual({
      RAPPORT: "low", VOLATILITY: "mid", PRESSURE: "high", INSIGHT: "mid",
    });
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/state/meters`.

- [ ] **Step 3: Implement**

`src/state/meters.ts`:
```ts
import { Role, Band, MeterState, ROLES } from "./storyTypes";

export function band(v: number): Band {
  if (v < 34) return "low";
  if (v <= 66) return "mid";
  return "high";
}
export function clampState(s: MeterState): MeterState {
  const out = {} as MeterState;
  for (const r of ROLES) out[r] = Math.max(0, Math.min(100, s[r]));
  return out;
}
export function applyDelta(s: MeterState, d: Partial<MeterState>): MeterState {
  const out = { ...s };
  for (const r of ROLES) out[r] = s[r] + (d[r] ?? 0);
  return clampState(out);
}
export function bands(s: MeterState): Record<Role, Band> {
  const out = {} as Record<Role, Band>;
  for (const r of ROLES) out[r] = band(s[r]);
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: meters tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: meter math (clamp, delta, banding)"
```

---

### Task 4: Router (state-gated selection)

**Files:**
- Create: `src/engine/router.ts`
- Test: `tests/router.test.ts`

**Interfaces:**
- Consumes: `StoryNode`, `TextVariant`, `Edge`, `BandCondition`, `MeterState` from `storyTypes`; `bands` from `meters`.
- Produces: `matchesCondition(when, b): boolean`, `pickTextVariant(node, state): string`, `selectEdge(edges, state): Edge | undefined`.

- [ ] **Step 1: Write failing tests**

`tests/router.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { matchesCondition, pickTextVariant, selectEdge } from "../src/engine/router";
import { bands } from "../src/state/meters";
import { StoryNode } from "../src/state/storyTypes";

const state = { RAPPORT: 80, VOLATILITY: 50, PRESSURE: 20, INSIGHT: 50 };

describe("router", () => {
  it("matches band conditions", () => {
    const b = bands(state);
    expect(matchesCondition(undefined, b)).toBe(true);
    expect(matchesCondition({ RAPPORT: "high" }, b)).toBe(true);
    expect(matchesCondition({ RAPPORT: "low" }, b)).toBe(false);
    expect(matchesCondition({ RAPPORT: "high", PRESSURE: "low" }, b)).toBe(true);
  });
  it("picks the most specific matching text variant, defaulting last", () => {
    const node = { id: "n", type: "action", choices: [], textVariants: [
      { text: "default" },
      { text: "high-rapport", when: { RAPPORT: "high" } },
    ] } as unknown as StoryNode;
    expect(pickTextVariant(node, state)).toBe("high-rapport");
  });
  it("selects the first matching edge, else undefined", () => {
    const edges = [{ when: { RAPPORT: "low" }, nextId: "a" }, { nextId: "b" }];
    expect(selectEdge(edges, state)?.nextId).toBe("b");
    expect(selectEdge([{ when: { PRESSURE: "high" }, nextId: "a" }], state)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/engine/router`.

- [ ] **Step 3: Implement**

`src/engine/router.ts`:
```ts
import { StoryNode, Edge, BandCondition, MeterState, Band, Role, ROLES } from "../state/storyTypes";
import { bands } from "../state/meters";

export function matchesCondition(when: BandCondition | undefined, b: Record<Role, Band>): boolean {
  if (!when) return true;
  return ROLES.every((r) => when[r] === undefined || when[r] === b[r]);
}

/** Prefer a conditional variant that matches; fall back to the first unconditional one. */
export function pickTextVariant(node: StoryNode, state: MeterState): string {
  const b = bands(state);
  const conditional = node.textVariants.find((v) => v.when && matchesCondition(v.when, b));
  if (conditional) return conditional.text;
  const def = node.textVariants.find((v) => !v.when) ?? node.textVariants[0];
  return def.text;
}

export function selectEdge(edges: Edge[], state: MeterState): Edge | undefined {
  const b = bands(state);
  return edges.find((e) => matchesCondition(e.when, b));
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: router tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: state-gated router (variant + edge selection)"
```

---

### Task 5: Scorer interfaces, MockScorer, LinearHead

**Files:**
- Create: `src/engine/scorer.ts`
- Test: `tests/scorer.test.ts`

**Interfaces:**
- Consumes: `MeterState`, `Role` from `storyTypes`.
- Produces: type `ToneVector = Record<string, number>`; `TONE_LABELS: string[]`; interfaces `ToneScorer { scoreTone(text): Promise<ToneVector> }`, `StateHead { delta(tone, state): Partial<MeterState> }`; classes `MockScorer implements ToneScorer`, `LinearHead implements StateHead`.

- [ ] **Step 1: Write failing tests**

`tests/scorer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MockScorer, LinearHead, TONE_LABELS } from "../src/engine/scorer";

describe("MockScorer", () => {
  it("returns a distribution over all tone labels", async () => {
    const tone = await new MockScorer().scoreTone("I believe you, you're safe");
    for (const l of TONE_LABELS) expect(typeof tone[l]).toBe("number");
    expect(tone["empathetic"]).toBeGreaterThan(tone["aggressive"]);
  });
  it("reads aggression from harsh text", async () => {
    const tone = await new MockScorer().scoreTone("you killed him, stop lying");
    expect(tone["aggressive"]).toBeGreaterThan(tone["empathetic"]);
  });
});

describe("LinearHead", () => {
  it("empathy raises RAPPORT, aggression lowers it", () => {
    const head = new LinearHead();
    const base = { RAPPORT: 50, VOLATILITY: 50, PRESSURE: 50, INSIGHT: 50 };
    const up = head.delta({ empathetic: 1 } as any, base);
    const down = head.delta({ aggressive: 1 } as any, base);
    expect(up.RAPPORT!).toBeGreaterThan(0);
    expect(down.RAPPORT!).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/engine/scorer`.

- [ ] **Step 3: Implement**

`src/engine/scorer.ts`:
```ts
import { MeterState, Role } from "../state/storyTypes";

export const TONE_LABELS = [
  "empathetic", "aggressive", "deceptive", "reassuring", "defiant", "cold",
  "submissive", "curious", "threatening", "apologetic", "dismissive", "sincere",
  "evasive", "calm",
] as const;
export type ToneVector = Record<string, number>;

export interface ToneScorer {
  scoreTone(text: string): Promise<ToneVector>;
}
export interface StateHead {
  /** Given a tone distribution and current state, return meter deltas. */
  delta(tone: ToneVector, state: MeterState): Partial<MeterState>;
}

/** Deterministic keyword scorer for tests + offline dev. Swapped for TransformersScorer in prod. */
export class MockScorer implements ToneScorer {
  private lex: Record<string, string[]> = {
    empathetic: ["believe", "safe", "scared", "understand", "sorry", "trust"],
    aggressive: ["killed", "lying", "stop", "now", "liar", "confess"],
    cold: ["sign", "order", "shut", "doesn't matter", "procedure"],
    reassuring: ["okay", "calm", "here", "help"],
    curious: ["what", "why", "how", "tell me"],
    sincere: ["i believe you", "the truth", "honestly"],
  };
  async scoreTone(text: string): Promise<ToneVector> {
    const t = text.toLowerCase();
    const v: ToneVector = {};
    for (const l of TONE_LABELS) v[l] = 0.05;
    for (const [label, words] of Object.entries(this.lex)) {
      for (const w of words) if (t.includes(w)) v[label] += 0.5;
    }
    const sum = Object.values(v).reduce((a, b) => a + b, 0);
    for (const l of TONE_LABELS) v[l] /= sum;
    return v;
  }
}

/**
 * Transparent stand-in for the learned head (Plan 2 replaces it behind this interface).
 * A fixed tone→role weight matrix. Kept intentionally simple; the ONNX head plugs in later.
 */
export class LinearHead implements StateHead {
  private W: Record<string, Partial<Record<Role, number>>> = {
    empathetic: { RAPPORT: 12, VOLATILITY: -6 },
    sincere: { RAPPORT: 8, INSIGHT: 4 },
    reassuring: { VOLATILITY: -8, RAPPORT: 4 },
    curious: { INSIGHT: 6 },
    aggressive: { RAPPORT: -10, VOLATILITY: 10, PRESSURE: 4 },
    threatening: { RAPPORT: -12, VOLATILITY: 14 },
    cold: { RAPPORT: -6, PRESSURE: 8 },
    dismissive: { RAPPORT: -6 },
  };
  delta(tone: ToneVector, _state: MeterState): Partial<MeterState> {
    const d: Partial<MeterState> = {};
    for (const [label, weights] of Object.entries(this.W)) {
      const p = tone[label] ?? 0;
      for (const [role, w] of Object.entries(weights)) {
        d[role as Role] = (d[role as Role] ?? 0) + p * (w as number);
      }
    }
    return d;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: scorer tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ToneScorer/StateHead interfaces + MockScorer + LinearHead"
```

---

### Task 6: GameEngine

**Files:**
- Create: `src/engine/game.ts`
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `StoryPack`, `StoryNode`, `MeterState`, `Role` from `storyTypes`; `applyDelta` from `meters`; `pickTextVariant`, `selectEdge` from `router`; `ToneScorer`, `StateHead` from `scorer`.
- Produces: types `ActInput = { choiceId: string } | { text: string }`, `ActResult = { text: string; npcResponse?: string; deltas: Partial<MeterState>; state: MeterState; nextNodeId: string | null; ended: boolean }`; class `GameEngine` with `currentNode: StoryNode`, `state: MeterState`, `history: string[]`, `currentText(): string`, `act(input): Promise<ActResult>`.

- [ ] **Step 1: Write failing tests**

`tests/game.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { GameEngine } from "../src/engine/game";
import { MockScorer, LinearHead } from "../src/engine/scorer";
import pack from "../public/stories/revenant.json";
import { StoryPack } from "../src/state/storyTypes";

function newGame() {
  return new GameEngine(pack as unknown as StoryPack, new MockScorer(), new LinearHead());
}

describe("GameEngine", () => {
  it("starts at the start node", () => {
    const g = newGame();
    expect(g.currentNode.id).toBe("cell");
    expect(g.currentText()).toContain("NIX");
  });

  it("an empathetic choice raises RAPPORT and routes forward", async () => {
    const g = newGame();
    const before = g.state.RAPPORT;
    const res = await g.act({ choiceId: "open" });
    expect(res.nextNodeId).toBe("talk");
    expect(g.currentNode.id).toBe("talk");
    expect(g.state.RAPPORT).toBeGreaterThanOrEqual(before); // "sincere" tag text scores non-negative
  });

  it("same node, different accumulated state -> different text variant", async () => {
    const g = newGame();
    // Force high rapport, then read the dialogue node text.
    (g as any)._state = { RAPPORT: 90, VOLATILITY: 40, PRESSURE: 40, INSIGHT: 40 };
    (g as any)._current = g["pack"].nodes.find((n: any) => n.id === "talk");
    expect(g.currentText()).toContain("trusting");
  });

  it("free text drives relationship via the scorer", async () => {
    const g = newGame();
    await g.act({ choiceId: "open" }); // -> talk (dialogue node)
    const before = g.state.RAPPORT;
    const res = await g.act({ text: "I believe you. You are safe with me." });
    expect(res.deltas.RAPPORT ?? 0).toBeGreaterThan(0);
    expect(g.state.RAPPORT).toBeGreaterThan(before);
  });

  it("reaching a null edge ends the story", async () => {
    const g = newGame();
    await g.act({ choiceId: "sign" });
    const res = await g.act({ choiceId: "end" });
    expect(res.ended).toBe(true);
    expect(res.nextNodeId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/engine/game`.

- [ ] **Step 3: Implement**

`src/engine/game.ts`:
```ts
import { StoryPack, StoryNode, MeterState, Partial as _ } from "../state/storyTypes";
import { applyDelta } from "../state/meters";
import { pickTextVariant, selectEdge } from "./router";
import { ToneScorer, StateHead } from "./scorer";

export type ActInput = { choiceId: string } | { text: string };
export interface ActResult {
  text: string;
  npcResponse?: string;
  deltas: Partial<MeterState>;
  state: MeterState;
  nextNodeId: string | null;
  ended: boolean;
}

export class GameEngine {
  private _state: MeterState;
  private _current: StoryNode;
  private _history: string[] = [];

  constructor(private pack: StoryPack, private scorer: ToneScorer, private head: StateHead) {
    this._state = { ...pack.initialState };
    this._current = this.node(pack.startNodeId);
    this._history.push(this._current.id);
  }

  get currentNode(): StoryNode { return this._current; }
  get state(): MeterState { return this._state; }
  get history(): string[] { return this._history; }

  currentText(): string { return pickTextVariant(this._current, this._state); }

  private node(id: string): StoryNode {
    const n = this.pack.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`unknown node ${id}`);
    return n;
  }

  async act(input: ActInput): Promise<ActResult> {
    let sourceText: string;
    let npcResponse: string | undefined;
    let edges;

    if (this._current.type === "action") {
      if (!("choiceId" in input)) throw new Error("action node needs a choiceId");
      const choice = this._current.choices.find((c) => c.id === input.choiceId);
      if (!choice) throw new Error(`unknown choice ${input.choiceId}`);
      sourceText = choice.text;
      edges = choice.edges;
    } else {
      // dialogue node
      if ("choiceId" in input) {
        const st = this._current.stances.find((s) => s.id === input.choiceId);
        if (!st) throw new Error(`unknown stance ${input.choiceId}`);
        sourceText = st.anchorPhrasings[0] ?? "";
        npcResponse = st.npcResponse;
        edges = st.edges;
      } else {
        // free text: Plan 4 adds semantic routing; here, fall back stance for routing,
        // but score the ACTUAL typed text for relationship deltas.
        const fb = this._current.stances.find((s) => s.id === this._current.fallbackStanceId)!;
        sourceText = input.text;
        npcResponse = fb.npcResponse;
        edges = fb.edges;
      }
    }

    const tone = await this.scorer.scoreTone(sourceText);
    const deltas = this.head.delta(tone, this._state);
    this._state = applyDelta(this._state, deltas);

    const edge = selectEdge(edges, this._state);
    const nextNodeId = edge ? edge.nextId : null;
    const ended = nextNodeId === null;
    if (!ended) {
      this._current = this.node(nextNodeId!);
      this._history.push(this._current.id);
    }
    return { text: ended ? "" : this.currentText(), npcResponse, deltas, state: this._state, nextNodeId, ended };
  }
}
```
Remove the stray `Partial as _` import line — `Partial` is a built-in TS utility type; the import in the header snippet above must NOT be included. The correct first import line is:
```ts
import { StoryPack, StoryNode, MeterState } from "../state/storyTypes";
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: all GameEngine tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: GameEngine turn loop (score -> delta -> route)"
```

---

### Task 7: Meter bar UI

**Files:**
- Create: `src/ui/meters.ts`, `src/ui/style.css`
- Test: `tests/metersUi.test.ts`

**Interfaces:**
- Consumes: `MeterState`, `Role`, `ROLES` from `storyTypes`; `StoryPack["meterLabels"]`.
- Produces: `renderMeters(container: HTMLElement, labels: Record<Role, string | null>, state: MeterState): void`.

- [ ] **Step 1: Write failing test**

`tests/metersUi.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderMeters } from "../src/ui/meters";

describe("renderMeters", () => {
  it("renders a labelled bar per visible role, width = value%", () => {
    const el = document.createElement("div");
    renderMeters(el, { RAPPORT: "Trust", VOLATILITY: null, PRESSURE: "Warden", INSIGHT: "Suspicion" },
      { RAPPORT: 70, VOLATILITY: 50, PRESSURE: 20, INSIGHT: 40 });
    const bars = el.querySelectorAll(".meter");
    expect(bars.length).toBe(3); // VOLATILITY hidden
    const fill = el.querySelector('.meter[data-role="RAPPORT"] .fill') as HTMLElement;
    expect(fill.style.width).toBe("70%");
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm test` — FAIL: cannot resolve `../src/ui/meters`.

- [ ] **Step 3: Implement**

`src/ui/meters.ts`:
```ts
import { MeterState, Role, ROLES } from "../state/storyTypes";

export function renderMeters(container: HTMLElement, labels: Record<Role, string | null>, state: MeterState): void {
  container.innerHTML = "";
  for (const r of ROLES) {
    const label = labels[r];
    if (!label) continue; // hidden meter
    const row = document.createElement("div");
    row.className = "meter";
    row.dataset.role = r;
    row.innerHTML = `<span class="label">${label}</span>
      <div class="track"><div class="fill" style="width:${Math.round(state[r])}%"></div></div>`;
    container.appendChild(row);
  }
}
```

`src/ui/style.css` (starter — expand freely):
```css
:root { --bg:#0d0f14; --fg:#e8e8ee; --accent:#5ad1c8; }
body { background:var(--bg); color:var(--fg); font-family:Georgia, serif; margin:0; }
#app { max-width:820px; margin:0 auto; padding:24px; }
.meter { display:flex; align-items:center; gap:8px; margin:6px 0; font-size:13px; }
.meter .label { width:130px; opacity:.8; }
.meter .track { flex:1; height:8px; background:#20242e; border-radius:6px; overflow:hidden; }
.meter .fill { height:100%; background:var(--accent); transition:width .6s ease; }
.scene { font-size:19px; line-height:1.6; margin:24px 0; }
.choice { display:block; width:100%; text-align:left; margin:8px 0; padding:12px 14px;
  background:#171b24; color:var(--fg); border:1px solid #2a2f3a; border-radius:8px; cursor:pointer; font:inherit; }
.choice:hover { border-color:var(--accent); }
.freetext { width:100%; padding:12px; background:#171b24; color:var(--fg);
  border:1px solid #2a2f3a; border-radius:8px; font:inherit; }
#flowchart { height:220px; border:1px solid #20242e; border-radius:8px; margin-top:16px; }
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test` — metersUi test passes.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: meter bar rendering + base styles"
```

---

### Task 8: Scene UI (text, choices, free-text input)

**Files:**
- Create: `src/ui/scene.ts`
- Test: `tests/sceneUi.test.ts`

**Interfaces:**
- Consumes: `StoryNode` from `storyTypes`.
- Produces: `renderScene(container, opts): void` where `opts = { text: string; npcResponse?: string; node: StoryNode; onChoice(id): void; onText(text): void }`.

- [ ] **Step 1: Write failing test**

`tests/sceneUi.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { renderScene } from "../src/ui/scene";
import { StoryNode } from "../src/state/storyTypes";

const action = { id: "cell", type: "action", textVariants: [],
  choices: [{ id: "open", text: "Open", edges: [] }, { id: "sign", text: "Sign", edges: [] }] } as unknown as StoryNode;
const dialogue = { id: "talk", type: "dialogue", textVariants: [], fallbackStanceId: "press",
  stances: [{ id: "press", anchorPhrasings: [], npcResponse: "", edges: [] }] } as unknown as StoryNode;

describe("renderScene", () => {
  it("renders one button per choice and fires onChoice", () => {
    const el = document.createElement("div");
    const onChoice = vi.fn();
    renderScene(el, { text: "hello", node: action, onChoice, onText: () => {} });
    const btns = el.querySelectorAll(".choice");
    expect(btns.length).toBe(2);
    (btns[0] as HTMLButtonElement).click();
    expect(onChoice).toHaveBeenCalledWith("open");
  });
  it("renders a free-text input on dialogue nodes and fires onText on Enter", () => {
    const el = document.createElement("div");
    const onText = vi.fn();
    renderScene(el, { text: "hi", node: dialogue, onChoice: () => {}, onText });
    const input = el.querySelector(".freetext") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = "I believe you";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onText).toHaveBeenCalledWith("I believe you");
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm test` — FAIL: cannot resolve `../src/ui/scene`.

- [ ] **Step 3: Implement**

`src/ui/scene.ts`:
```ts
import { StoryNode } from "../state/storyTypes";

interface SceneOpts {
  text: string;
  npcResponse?: string;
  node: StoryNode;
  onChoice(id: string): void;
  onText(text: string): void;
}

export function renderScene(container: HTMLElement, opts: SceneOpts): void {
  container.innerHTML = "";
  if (opts.npcResponse) {
    const npc = document.createElement("p");
    npc.className = "scene npc";
    npc.textContent = opts.npcResponse;
    container.appendChild(npc);
  }
  const p = document.createElement("p");
  p.className = "scene";
  p.textContent = opts.text;
  container.appendChild(p);

  if (opts.node.type === "action") {
    for (const c of opts.node.choices) {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = c.text;
      b.onclick = () => opts.onChoice(c.id);
      container.appendChild(b);
    }
  } else {
    // dialogue node: free-text input + optional suggested-phrasing chips
    const input = document.createElement("input");
    input.className = "freetext";
    input.placeholder = "Say something…";
    input.onkeydown = (e) => {
      if (e.key === "Enter" && input.value.trim()) opts.onText(input.value.trim());
    };
    container.appendChild(input);
    for (const s of opts.node.stances) {
      const chip = document.createElement("button");
      chip.className = "choice chip";
      chip.textContent = s.anchorPhrasings[0] ?? s.id;
      chip.onclick = () => opts.onChoice(s.id);
      container.appendChild(chip);
    }
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test` — sceneUi tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: scene rendering with choices + free-text input"
```

---

### Task 9: Flowchart (Cytoscape + ghost paths)

**Files:**
- Create: `src/ui/flowchart.ts`
- Test: `tests/flowchart.test.ts`

**Interfaces:**
- Consumes: `StoryPack` from `storyTypes`; `cytoscape`.
- Produces: `class Flowchart { constructor(container, pack); markVisited(nodeId): void; }` — renders all nodes as faded "ghost" paths and highlights the visited path.

- [ ] **Step 1: Write the graph-building test (pure, no real Cytoscape render)**

`tests/flowchart.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildElements } from "../src/ui/flowchart";
import pack from "../public/stories/revenant.json";
import { StoryPack } from "../src/state/storyTypes";

describe("buildElements", () => {
  it("creates a node per story node and an edge per outgoing edge", () => {
    const els = buildElements(pack as unknown as StoryPack);
    const nodes = els.filter((e) => !e.data.source);
    const edges = els.filter((e) => e.data.source);
    expect(nodes.length).toBe(4);
    // cell(2) + talk stances(2->1 dedup targets) + truth(2) + sign_end(1)
    expect(edges.length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm test` — FAIL: cannot resolve `../src/ui/flowchart`.

- [ ] **Step 3: Implement**

`src/ui/flowchart.ts`:
```ts
import cytoscape, { Core, ElementDefinition } from "cytoscape";
import { StoryPack } from "../state/storyTypes";

export function buildElements(pack: StoryPack): ElementDefinition[] {
  const els: ElementDefinition[] = [];
  for (const n of pack.nodes) els.push({ data: { id: n.id, label: n.id } });
  for (const n of pack.nodes) {
    const edges = n.type === "action" ? n.choices.flatMap((c) => c.edges) : n.stances.flatMap((s) => s.edges);
    edges.forEach((e, i) => {
      if (e.nextId) els.push({ data: { id: `${n.id}->${e.nextId}#${i}`, source: n.id, target: e.nextId } });
    });
  }
  return els;
}

export class Flowchart {
  private cy: Core;
  constructor(container: HTMLElement, pack: StoryPack) {
    this.cy = cytoscape({
      container,
      elements: buildElements(pack),
      style: [
        { selector: "node", style: { "background-color": "#2a2f3a", label: "data(label)",
          color: "#8a90a0", "font-size": 9 } },
        { selector: "edge", style: { "line-color": "#20242e", width: 1, "target-arrow-shape": "triangle",
          "target-arrow-color": "#20242e", "curve-style": "bezier" } },
        { selector: ".visited", style: { "background-color": "#5ad1c8", color: "#e8e8ee" } },
        { selector: ".path", style: { "line-color": "#5ad1c8", "target-arrow-color": "#5ad1c8", width: 2 } },
      ],
      layout: { name: "breadthfirst", directed: true, padding: 8 },
    });
  }
  markVisited(nodeId: string, fromId?: string): void {
    this.cy.getElementById(nodeId).addClass("visited");
    if (fromId) {
      this.cy.edges(`[source = "${fromId}"][target = "${nodeId}"]`).addClass("path");
    }
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test` — flowchart element test passes. (Cytoscape rendering is exercised manually in Task 10 via `npm run dev`.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cytoscape flowchart with ghost paths + visited highlight"
```

---

### Task 10: Menu + main wiring (playable end-to-end with MockScorer)

**Files:**
- Create: `src/ui/menu.ts`
- Modify: `src/main.ts`
- Test: `tests/menu.test.ts`

**Interfaces:**
- Consumes: `StoryManifestEntry`, `StoryPack` from `storyTypes`; `GameEngine`; `MockScorer`, `LinearHead`; `renderMeters`; `renderScene`; `Flowchart`.
- Produces: `renderMenu(container, entries, onPick): void`; a running app.

- [ ] **Step 1: Write the menu test**

`tests/menu.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { renderMenu } from "../src/ui/menu";

describe("renderMenu", () => {
  it("lists stories and fires onPick with the id", () => {
    const el = document.createElement("div");
    const onPick = vi.fn();
    renderMenu(el, [{ id: "revenant", title: "REVENANT", genre: "Sci-fi", blurb: "b" }], onPick);
    const card = el.querySelector(".story-card") as HTMLElement;
    expect(card.textContent).toContain("REVENANT");
    card.click();
    expect(onPick).toHaveBeenCalledWith("revenant");
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm test` — FAIL: cannot resolve `../src/ui/menu`.

- [ ] **Step 3: Implement menu + wiring**

`src/ui/menu.ts`:
```ts
import { StoryManifestEntry } from "../state/storyTypes";

export function renderMenu(container: HTMLElement, entries: StoryManifestEntry[], onPick: (id: string) => void): void {
  container.innerHTML = "<h1>Living Stories</h1>";
  for (const e of entries) {
    const card = document.createElement("button");
    card.className = "story-card choice";
    card.innerHTML = `<strong>${e.title}</strong> — <em>${e.genre}</em><br><span>${e.blurb}</span>`;
    card.onclick = () => onPick(e.id);
    container.appendChild(card);
  }
}
```

`src/main.ts`:
```ts
import "./ui/style.css";
import { StoryManifestEntry, StoryPack } from "./state/storyTypes";
import { GameEngine, ActInput } from "./engine/game";
import { MockScorer, LinearHead } from "./engine/scorer";
import { renderMeters } from "./ui/meters";
import { renderScene } from "./ui/scene";
import { renderMenu } from "./ui/menu";
import { Flowchart } from "./ui/flowchart";

const app = document.getElementById("app")!;
const base = import.meta.env.BASE_URL;

async function main() {
  const entries: StoryManifestEntry[] = await (await fetch(`${base}stories/index.json`)).json();
  renderMenu(app, entries, (id) => startStory(id));
}

async function startStory(id: string) {
  const pack: StoryPack = await (await fetch(`${base}stories/${id}.json`)).json();
  app.innerHTML = `<div id="meters"></div><div id="scene"></div><div id="flowchart"></div>`;
  const metersEl = document.getElementById("meters")!;
  const sceneEl = document.getElementById("scene")!;
  const flow = new Flowchart(document.getElementById("flowchart")!, pack);
  flow.markVisited(pack.startNodeId);

  // TODO(Plan 2): swap MockScorer for TransformersScorer.
  const engine = new GameEngine(pack, new MockScorer(), new LinearHead());

  function draw(text: string, npcResponse?: string) {
    renderMeters(metersEl, pack.meterLabels, engine.state);
    renderScene(sceneEl, {
      text, npcResponse, node: engine.currentNode,
      onChoice: (cid) => turn({ choiceId: cid }),
      onText: (t) => turn({ text: t }),
    });
  }
  async function turn(input: ActInput) {
    const from = engine.currentNode.id;
    const res = await engine.act(input);
    if (res.ended) {
      renderMeters(metersEl, pack.meterLabels, engine.state);
      sceneEl.innerHTML = `<p class="scene">${res.npcResponse ?? ""}</p><p class="scene"><em>— End —</em></p>`;
      return;
    }
    flow.markVisited(engine.currentNode.id, from);
    draw(res.text, res.npcResponse);
  }
  draw(engine.currentText());
}

main();
```

- [ ] **Step 4: Run tests + manual play**

Run: `npm test` (menu test passes), then `npm run dev` and open the URL.
Expected: menu → pick REVENANT → scene text, meters, flowchart; clicking choices and typing in the dialogue node moves meters, advances scenes, and lights up the flowchart path. Verify a run through both `open→talk` and `sign→sign_end`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: story menu + end-to-end wiring (playable with MockScorer)"
```

---

### Task 11: Real client-side ML — TransformersScorer

**Files:**
- Create: `src/ml/transformersScorer.ts`
- Modify: `src/main.ts` (feature-flag the real scorer with graceful fallback to MockScorer)
- Test: `tests/transformersScorer.test.ts`

**Interfaces:**
- Consumes: `ToneScorer`, `ToneVector`, `TONE_LABELS` from `scorer`; `@huggingface/transformers`.
- Produces: `class TransformersScorer implements ToneScorer` with `static async create(modelId?: string): Promise<TransformersScorer>`.

**Note on the model:** Until Plan 2 publishes the fine-tuned emotion model, use a public text-classification model that transformers.js can load to validate the in-browser pipeline end-to-end (e.g. `Xenova/distilbert-base-uncased-finetuned-sst-2-english` for a smoke test, or a public GoEmotions ONNX export). The class maps model output labels into the fixed `TONE_LABELS` space; labels not present default to a small baseline. Plan 2 replaces `modelId` with the fine-tuned model and removes the label remap.

- [ ] **Step 1: Write a guarded integration test**

`tests/transformersScorer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { TransformersScorer } from "../src/ml/transformersScorer";
import { TONE_LABELS } from "../src/engine/scorer";

// Network + model download; skipped in normal unit runs. Run with: RUN_ML=1 npm test
const maybe = process.env.RUN_ML ? describe : describe.skip;

maybe("TransformersScorer (integration)", () => {
  it("returns a full tone vector for input text", async () => {
    const scorer = await TransformersScorer.create();
    const tone = await scorer.scoreTone("I believe you, you're safe now");
    for (const l of TONE_LABELS) expect(typeof tone[l]).toBe("number");
  }, 120000);
});
```

- [ ] **Step 2: Run test, verify it is skipped by default**

Run: `npm test`
Expected: the TransformersScorer suite is skipped (0 failures). This keeps CI/unit runs offline and fast.

- [ ] **Step 3: Implement**

`src/ml/transformersScorer.ts`:
```ts
import { pipeline, type TextClassificationPipeline } from "@huggingface/transformers";
import { ToneScorer, ToneVector, TONE_LABELS } from "../engine/scorer";

/**
 * Runs a text-classification model in-browser via transformers.js and projects its
 * output labels into the fixed TONE_LABELS space. Plan 2 supplies the fine-tuned model.
 */
export class TransformersScorer implements ToneScorer {
  private constructor(private clf: TextClassificationPipeline) {}

  static async create(modelId = "Xenova/distilbert-base-uncased-finetuned-sst-2-english"): Promise<TransformersScorer> {
    const clf = (await pipeline("text-classification", modelId, { dtype: "q8" })) as TextClassificationPipeline;
    return new TransformersScorer(clf);
  }

  async scoreTone(text: string): Promise<ToneVector> {
    const out = (await this.clf(text, { top_k: 0 })) as Array<{ label: string; score: number }>;
    const v: ToneVector = {};
    for (const l of TONE_LABELS) v[l] = 0.02;
    for (const { label, score } of out) {
      const key = mapLabel(label);
      if (key) v[key] += score;
    }
    const sum = Object.values(v).reduce((a, b) => a + b, 0);
    for (const l of TONE_LABELS) v[l] /= sum;
    return v;
  }
}

/** Placeholder remap; Plan 2's model emits TONE_LABELS directly and this becomes identity. */
function mapLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (l === "positive") return "empathetic";
  if (l === "negative") return "aggressive";
  if (TONE_LABELS.includes(l as any)) return l;
  return null;
}
```

Modify `src/main.ts` — replace the `MockScorer` line in `startStory` with a guarded upgrade:
```ts
import { ToneScorer } from "./engine/scorer";
// ... inside startStory, before creating the engine:
let scorer: ToneScorer = new MockScorer();
try {
  const { TransformersScorer } = await import("./ml/transformersScorer");
  scorer = await TransformersScorer.create();
} catch (err) {
  console.warn("ML scorer unavailable, using MockScorer:", err);
}
const engine = new GameEngine(pack, scorer, new LinearHead());
```

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev`, open the app, play the dialogue node, and confirm in DevTools console that the model loads (or that it cleanly falls back to MockScorer offline). Meters must still move.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: in-browser TransformersScorer with graceful MockScorer fallback"
```

---

### Task 12: Production build + GitHub Pages deploy

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `vite.config.ts` (set `base` to the repo name)

**Interfaces:**
- Consumes: the built `dist/`.
- Produces: a public URL on GitHub Pages.

- [ ] **Step 1: Set the Pages base path**

Edit `vite.config.ts` — replace `base: "./"` with the repo name (example repo `living-stories`):
```ts
export default defineConfig({ base: "/living-stories/" });
```

- [ ] **Step 2: Add the deploy workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verify local production build**

Run:
```bash
npm run build
npm run preview
```
Expected: the built site serves from `dist/`, menu loads, a full playthrough works. Confirm `stories/*.json` are present under `dist/stories/` (Vite copies `public/` automatically).

- [ ] **Step 4: Push and enable Pages**

```bash
git add -A && git commit -m "chore: github pages build + deploy workflow"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```
Then in the GitHub repo: Settings → Pages → Source = "GitHub Actions". Confirm the deployed URL plays end-to-end.

- [ ] **Step 5: Final commit (if base path adjusted)**

```bash
git add -A && git commit -m "chore: finalize pages base path" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage (Plan 1 scope = spec §3 catalog, §5 roles, §8 runtime loop, §10 frontend, parts of §4 client-side ML, §14 phases 0–1, §13 ghost paths):**
- Catalog/manifest → Tasks 2, 10. ✅
- Fixed meter roles + bands → Global Constraints, Tasks 2, 3. ✅
- Continuous accumulated state + state-gated selection (not if/else) → Tasks 3, 4, 6. ✅
- Free-text input moving relationships via the scorer → Tasks 5, 6, 8 (semantic *story* routing deferred to Plan 4, explicitly). ✅
- Meters + flowchart + ghost paths → Tasks 7, 9. ✅
- Client-side transformers.js ONNX inference → Task 11. ✅
- GitHub Pages static deploy, no server/key → Task 12. ✅
- Deferred by design (separate plans, noted in code TODOs): learned ONNX head (Plan 2), fine-tuned emotion model (Plan 2), semantic free-text routing + live 0.5B flavor (Plan 4), authored packs from the pipeline (Plan 3). ✅

**Placeholder scan:** No "TBD"/"handle edge cases" left; the one intentional stand-in (`LinearHead`) and the smoke-test model in Task 11 are explicitly labelled as swap points for Plan 2, with the interface fixed so the swap is drop-in.

**Type consistency:** `MeterState`, `Role`, `ROLES`, `Band`, `ToneVector`, `TONE_LABELS`, `ToneScorer`, `StateHead`, `ActInput`, `ActResult`, `StoryPack`, `StoryNode`, `renderMeters`, `renderScene`, `renderMenu`, `Flowchart`, `buildElements` are defined once and consumed with matching signatures across tasks. The `game.ts` header snippet's erroneous `Partial as _` import is explicitly corrected in Task 6 Step 3.
