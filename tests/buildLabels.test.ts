import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLabels, toJsonl } from "../scripts/build-labels";
import pack from "../public/stories/revenant.json";
import intentTable from "../ml-training/data/tone_intent.json";
import { StoryPack } from "../src/state/storyTypes";
import { TONE_LABELS } from "../src/engine/scorer";

const packs = [pack as unknown as StoryPack];
const INTENT = (intentTable as { intent: Record<string, Record<string, number>> }).intent;
const GAP_LABELS = ["deceptive", "evasive", "threatening", "cold", "defiant"];

describe("buildLabels", () => {
  it("emits one row per toneTagged choice + one per stance anchor phrasing", async () => {
    const rows = await buildLabels(packs);
    // revenant (expanded): 13 toneTagged choices + 18 stance anchor phrasings
    // (talk/wren_memory/confront × 2 stances × 3 anchors). sign_end 'end' is untagged.
    expect(rows.length).toBe(31);
  });

  it("every row matches the spec §9 schema", async () => {
    const rows = await buildLabels(packs);
    for (const r of rows) {
      expect(typeof r.text).toBe("string");
      expect(r.text.length).toBeGreaterThan(0);
      expect(typeof r.tone).toBe("string");
      expect(r.delta).toBeTypeOf("object");
    }
  });

  it("covers each toneTagged surface text exactly once", async () => {
    const rows = await buildLabels(packs);
    const texts = rows.map((r) => r.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts).toContain("you're safe with me"); // an empathize anchor
    expect(texts).toContain("I believe you"); // another empathize anchor
    expect(texts).not.toContain("Set down the pen and leave the cell block."); // sign_end's untagged choice
  });

  it("bootstrap deltas are non-degenerate (empathetic text raises RAPPORT)", async () => {
    const rows = await buildLabels(packs);
    const emp = rows.find((r) => r.text === "you're safe with me")!;
    expect(emp.delta.RAPPORT ?? 0).toBeGreaterThan(0);
  });

  it("toJsonl round-trips to valid JSON lines", async () => {
    const rows = await buildLabels(packs);
    const lines = toJsonl(rows).trimEnd().split("\n");
    expect(lines.length).toBe(rows.length);
    expect(JSON.parse(lines[0])).toHaveProperty("tone");
  });

  it("deltas come from the authored intent table, not LinearHead (non-circular)", async () => {
    const rows = await buildLabels(packs);
    const emp = rows.find((r) => r.text === "you're safe with me")!;
    expect(emp.delta).toEqual({ RAPPORT: 8, VOLATILITY: -5, INSIGHT: 1 }); // == tone_intent.empathetic (zeros trimmed)
  });
});

describe("tone_intent.json (authored ground truth)", () => {
  it("covers all 14 TONE_LABELS", () => {
    for (const t of TONE_LABELS) expect(INTENT[t], `missing intent for ${t}`).toBeDefined();
  });
  it("every toneTag used in a pack has an intent entry (build never throws)", async () => {
    await expect(buildLabels(packs)).resolves.toBeTruthy();
  });
});

describe("tone_seed.jsonl (fills the 5 unreachable gap labels)", () => {
  const seed = readFileSync(join(process.cwd(), "ml-training", "data", "tone_seed.jsonl"), "utf8")
    .trim().split("\n").map((l) => JSON.parse(l) as { text: string; labels: string[] });

  it("provides authored examples for every gap label", () => {
    const covered = new Set(seed.flatMap((r) => r.labels));
    for (const g of GAP_LABELS) expect(covered.has(g), `no seed example for ${g}`).toBe(true);
  });
  it("every seed label is a valid TONE_LABEL", () => {
    for (const r of seed) for (const l of r.labels) expect(TONE_LABELS).toContain(l);
  });
});
