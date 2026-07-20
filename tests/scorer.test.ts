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
