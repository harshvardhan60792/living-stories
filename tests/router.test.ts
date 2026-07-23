import { describe, it, expect } from "vitest";
import { matchesCondition, pickTextVariant, selectEdge } from "../src/engine/router";
import { bands } from "../src/state/meters";
import { StoryNode, Edge } from "../src/state/storyTypes";

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
  it("prefers a memory-callback variant only when its node was visited", () => {
    const node = { id: "n", type: "action", choices: [], textVariants: [
      { text: "default" },
      { text: "recalled", recallWhen: "early" },
    ] } as unknown as StoryNode;
    expect(pickTextVariant(node, state, ["early", "n"])).toBe("recalled");
    expect(pickTextVariant(node, state, ["n"])).toBe("default"); // early not visited
    expect(pickTextVariant(node, state)).toBe("default"); // no history -> skipped
  });
  it("requires a recall variant's band condition to also hold", () => {
    const node = { id: "n", type: "action", choices: [], textVariants: [
      { text: "default" },
      { text: "recalled", recallWhen: "early", when: { RAPPORT: "low" } },
    ] } as unknown as StoryNode;
    // RAPPORT is high in `state`, so the recall variant's band gate fails -> default
    expect(pickTextVariant(node, state, ["early"])).toBe("default");
  });
  it("selects the first matching edge, else undefined", () => {
    const edges: Edge[] = [{ when: { RAPPORT: "low" }, nextId: "a" }, { nextId: "b" }];
    expect(selectEdge(edges, state)?.nextId).toBe("b");
    expect(selectEdge([{ when: { PRESSURE: "high" }, nextId: "a" }] as Edge[], state)).toBeUndefined();
  });
});
