import { describe, it, expect } from "vitest";
import { buildLabels, toJsonl } from "../scripts/build-labels";
import pack from "../public/stories/revenant.json";
import { StoryPack } from "../src/state/storyTypes";

const packs = [pack as unknown as StoryPack];

describe("buildLabels", () => {
  it("emits one row per toneTagged choice + one per stance anchor phrasing", async () => {
    const rows = await buildLabels(packs);
    // revenant: cell(open,sign) + truth(spare,doom) = 4 choices; talk stances
    // empathize(3 anchors) + press(3 anchors) = 6; sign_end 'end' has no toneTag.
    expect(rows.length).toBe(10);
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
    expect(texts).toContain("Reach for the shutdown order."); // a choice
    expect(texts).toContain("you're safe with me"); // an empathize anchor
    expect(texts).not.toContain("Leave."); // sign_end's untagged choice
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
});
