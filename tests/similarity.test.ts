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
