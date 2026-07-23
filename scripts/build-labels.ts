/**
 * Plan 3 Task 2 — build `labels.jsonl` (spec §9) from existing story packs.
 *
 * Schema per line: { text, tone, delta: Partial<MeterState> }.
 *
 * `delta` comes from the AUTHORED design-intent table (ml-training/data/tone_intent.json),
 * NOT from running text through LinearHead. This is deliberate: sourcing deltas from the
 * runtime stand-in that Task 5 replaces would be circular (the head would just re-learn
 * LinearHead's biases). The intent table is independent human design ground truth and
 * covers all 14 tones. At train time the tone VECTOR is produced by the real encoder on
 * `text`; `delta` is the authored target; `tone` is the authoring tag (metadata).
 */
import { StoryPack, MeterState, Role, ROLES } from "../src/state/storyTypes";
import intentTable from "../ml-training/data/tone_intent.json";

export interface LabelRow {
  text: string;
  tone: string;
  delta: Partial<MeterState>;
}

const INTENT = (intentTable as { intent: Record<string, Record<Role, number>> }).intent;

/** Drop zero components so the jsonl stays compact/diffable. */
function trimDelta(d: Record<Role, number>): Partial<MeterState> {
  const out: Partial<MeterState> = {};
  for (const r of ROLES) if (d[r]) out[r] = d[r];
  return out;
}

/**
 * Walk every toneTag-bearing choice (action nodes) and stance (dialogue nodes)
 * across all packs; the delta is the authored intent for that tone tag.
 * Stances contribute one row per anchor phrasing.
 */
export async function buildLabels(packs: StoryPack[]): Promise<LabelRow[]> {
  const rows: LabelRow[] = [];

  const emit = (text: string, tone: string) => {
    const intent = INTENT[tone];
    if (!intent) throw new Error(`toneTag "${tone}" has no entry in tone_intent.json`);
    rows.push({ text, tone, delta: trimDelta(intent) });
  };

  for (const pack of packs) {
    for (const node of pack.nodes) {
      if (node.type === "action") {
        for (const c of node.choices) {
          if (c.toneTag) emit(c.text, c.toneTag);
        }
      } else {
        for (const s of node.stances) {
          if (!s.toneTag) continue;
          for (const anchor of s.anchorPhrasings) emit(anchor, s.toneTag);
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
