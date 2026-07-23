// @vitest-environment node
// ORT-node's native binding type-checks tensors against Node's real Float32Array;
// jsdom (the default env) swaps in its own, which fails the check. Run in node env.
import { describe, it, expect } from "vitest";
import { TransformersEmbedder } from "../src/ml/transformersEmbedder";
import { cosineSimilarity } from "../src/engine/similarity";

// Network + model download; skipped in normal unit runs. Run with: RUN_ML=1 npm test
const maybe = process.env.RUN_ML ? describe : describe.skip;

maybe("TransformersEmbedder (integration)", () => {
  it("returns a fixed-length numeric embedding", async () => {
    const e = await TransformersEmbedder.create();
    const a = await e.embed("I believe you");
    const b = await e.embed("you're safe with me");
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBe(b.length);
    expect(a.every((x) => typeof x === "number")).toBe(true);
  }, 120000);

  it("scores semantically related text higher than unrelated text", async () => {
    const e = await TransformersEmbedder.create();
    const q = await e.embed("I believe you, you're safe with me");
    const near = await e.embed("you're safe");
    const far = await e.embed("you killed him");
    expect(cosineSimilarity(q, near)).toBeGreaterThan(cosineSimilarity(q, far));
  }, 120000);
});
