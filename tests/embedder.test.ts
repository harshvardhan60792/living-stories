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
