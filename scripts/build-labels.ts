/**
 * Plan 3 Task 2 — bootstrap `labels.jsonl` (spec §9) from existing story packs.
 *
 * Schema per line: { text, tone, delta: Partial<MeterState> }.
 *
 * CAVEAT (documented, not hidden): the `delta` values are produced by running each
 * tagged text through TODAY's transparent stand-ins (MockScorer + LinearHead) — i.e.
 * the very things Plan 3 Task 5 replaces. This is circular: a head trained on these
 * rows re-learns LinearHead's hand-picked biases, it does not discover new signal.
 * It is fine for proving the head's shape/plumbing (it trains + exports correctly).
 * Real signal needs hand-authored deltas per stance/choice, added when more packs
 * exist (Plan 5). Until then, treat labels.jsonl as a scaffold, not ground truth.
 */
import { StoryPack, MeterState } from "../src/state/storyTypes";
import { MockScorer, LinearHead } from "../src/engine/scorer";

export interface LabelRow {
  text: string;
  tone: string;
  delta: Partial<MeterState>;
}

/** Round deltas so the jsonl is stable/diffable across runs. */
function roundDelta(d: Partial<MeterState>): Partial<MeterState> {
  const out: Partial<MeterState> = {};
  for (const [k, v] of Object.entries(d)) out[k as keyof MeterState] = Math.round((v as number) * 1000) / 1000;
  return out;
}

/**
 * Walk every toneTag-bearing choice (action nodes) and stance (dialogue nodes)
 * across all packs, scoring each surface text with the current stand-ins.
 * Stances contribute one row per anchor phrasing.
 */
export async function buildLabels(packs: StoryPack[]): Promise<LabelRow[]> {
  const scorer = new MockScorer();
  const head = new LinearHead();
  const rows: LabelRow[] = [];

  const emit = async (text: string, tone: string, refState: MeterState) => {
    const tv = await scorer.scoreTone(text);
    rows.push({ text, tone, delta: roundDelta(head.delta(tv, refState)) });
  };

  for (const pack of packs) {
    const ref = pack.initialState;
    for (const node of pack.nodes) {
      if (node.type === "action") {
        for (const c of node.choices) {
          if (c.toneTag) await emit(c.text, c.toneTag, ref);
        }
      } else {
        for (const s of node.stances) {
          if (!s.toneTag) continue;
          for (const anchor of s.anchorPhrasings) await emit(anchor, s.toneTag, ref);
        }
      }
    }
  }
  return rows;
}

export function toJsonl(rows: LabelRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

// --- runnable main: `npx tsx scripts/build-labels.ts` ---------------------------
// Guarded so importing this module (tests) never touches the filesystem.
const isMain = typeof process !== "undefined" && process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/build-labels.ts");
if (isMain) {
  (async () => {
    const { readdirSync, readFileSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const storiesDir = join(root, "public", "stories");
    const packs: StoryPack[] = readdirSync(storiesDir)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .map((f) => JSON.parse(readFileSync(join(storiesDir, f), "utf8")) as StoryPack);
    const rows = await buildLabels(packs);
    const outPath = join(root, "ml-training", "data", "labels.jsonl");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, toJsonl(rows), "utf8");
    console.log(`wrote ${rows.length} rows -> ${outPath}`);
  })();
}
