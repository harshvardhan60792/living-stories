import { describe, it, expect } from "vitest";
import { classifyNodes, ghostEdgeKeys, successors } from "../src/ui/ghostPaths";
import { StoryPack } from "../src/state/storyTypes";

// start "a" branches to "b" (empathetic) and "c" (hostile); "b" -> ending.
function pack(): StoryPack {
  return {
    id: "t", title: "T", genre: "test",
    meterLabels: { RAPPORT: "R", VOLATILITY: "V", PRESSURE: "P", INSIGHT: "I" },
    startNodeId: "a",
    initialState: { RAPPORT: 30, VOLATILITY: 50, PRESSURE: 50, INSIGHT: 20 },
    nodes: [
      {
        id: "a", type: "action", textVariants: [{ text: "x" }],
        choices: [
          { id: "c1", text: "kind", edges: [{ nextId: "b" }] },
          { id: "c2", text: "cruel", edges: [{ nextId: "c" }] },
        ],
      },
      {
        id: "b", type: "dialogue", textVariants: [{ text: "x" }], fallbackStanceId: "s",
        stances: [{ id: "s", anchorPhrasings: ["hi"], npcResponse: "ok", edges: [{ nextId: null }] }],
      },
      {
        id: "c", type: "action", textVariants: [{ text: "x" }],
        choices: [{ id: "c3", text: "end", edges: [{ nextId: null }] }],
      },
    ],
  };
}

describe("ghostPaths", () => {
  it("maps successors correctly (null endings dropped)", () => {
    const s = successors(pack());
    expect(s.get("a")).toEqual(["b", "c"]);
    expect(s.get("b")).toEqual([]); // only a null ending
  });

  it("classifies the untaken sibling as ghost after taking one branch", () => {
    const c = classifyNodes(pack(), ["a", "b"]);
    expect(c.get("a")).toBe("taken");
    expect(c.get("b")).toBe("taken");
    expect(c.get("c")).toBe("ghost"); // sibling branch from visited "a", not taken
  });

  it("marks nothing ghost/available-only at the very start", () => {
    const c = classifyNodes(pack(), ["a"]);
    expect(c.get("a")).toBe("taken");
    expect(c.get("b")).toBe("ghost");
    expect(c.get("c")).toBe("ghost");
  });

  it("treats unvisited nodes not adjacent to a visited node as available", () => {
    // empty history -> nothing taken, nothing one-step-from-taken
    const c = classifyNodes(pack(), []);
    expect([...c.values()].every((v) => v === "available")).toBe(true);
  });

  it("ghostEdgeKeys returns visited->unvisited edges only", () => {
    const k = ghostEdgeKeys(pack(), ["a", "b"]);
    expect(k.has("a->c")).toBe(true); // saw it, didn't take it
    expect(k.has("a->b")).toBe(false); // taken path, not a ghost
  });
});
