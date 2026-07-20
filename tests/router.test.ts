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
