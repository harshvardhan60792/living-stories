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
