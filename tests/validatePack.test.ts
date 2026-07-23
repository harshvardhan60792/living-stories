import { describe, it, expect } from "vitest";
import { validatePack } from "../src/state/validatePack";
import { StoryPack } from "../src/state/storyTypes";
import revenant from "../public/stories/revenant.json";

// A minimal well-formed pack: start action node -> dialogue node -> ending.
function goodPack(): StoryPack {
  return {
    id: "t",
    title: "T",
    genre: "test",
    meterLabels: { RAPPORT: "R", VOLATILITY: "V", PRESSURE: "P", INSIGHT: null },
    startNodeId: "a",
    initialState: { RAPPORT: 30, VOLATILITY: 50, PRESSURE: 50, INSIGHT: 20 },
    nodes: [
      {
        id: "a",
        type: "action",
        textVariants: [{ text: "open" }],
        choices: [{ id: "c1", text: "go", edges: [{ nextId: "d" }] }],
      },
      {
        id: "d",
        type: "dialogue",
        textVariants: [{ text: "npc speaks" }],
        fallbackStanceId: "s1",
        stances: [
          {
            id: "s1",
            anchorPhrasings: ["hello"],
            npcResponse: "hi",
            edges: [{ nextId: null }],
          },
        ],
      },
    ],
  };
}

describe("validatePack", () => {
  it("accepts a well-formed pack", () => {
    const r = validatePack(goodPack());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(validatePack(null).ok).toBe(false);
    expect(validatePack(42).ok).toBe(false);
  });

  it("flags a dangling edge to an unknown node", () => {
    const p = goodPack();
    (p.nodes[0] as any).choices[0].edges[0].nextId = "nope";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('unknown node "nope"'))).toBe(true);
  });

  it("flags a startNodeId that is not a node", () => {
    const p = goodPack();
    p.startNodeId = "ghost";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("startNodeId"))).toBe(true);
  });

  it("flags a fallbackStanceId not among the node's stances", () => {
    const p = goodPack();
    (p.nodes[1] as any).fallbackStanceId = "sX";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("fallbackStanceId"))).toBe(true);
  });

  it("flags initialState out of [0,100]", () => {
    const p = goodPack();
    p.initialState.RAPPORT = 140;
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("out of range"))).toBe(true);
  });

  it("flags a missing meter role", () => {
    const p = goodPack();
    delete (p.meterLabels as any).INSIGHT;
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("missing role INSIGHT"))).toBe(true);
  });

  it("errors when no ending is reachable", () => {
    const p = goodPack();
    // point the only ending edge back to a real node -> no nextId:null anywhere
    (p.nodes[1] as any).stances[0].edges[0].nextId = "a";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("no reachable ending"))).toBe(true);
  });

  it("warns on an unreachable node", () => {
    const p = goodPack();
    p.nodes.push({
      id: "orphan",
      type: "action",
      textVariants: [{ text: "x" }],
      choices: [{ id: "c", text: "y", edges: [{ nextId: null }] }],
    } as any);
    const r = validatePack(p);
    expect(r.ok).toBe(true); // unreachable is a warning, not an error
    expect(r.warnings.some((w) => w.includes('"orphan" is unreachable'))).toBe(true);
  });

  it("warns when an edge list has no unconditional fallback", () => {
    const p = goodPack();
    (p.nodes[0] as any).choices[0].edges = [{ when: { RAPPORT: "high" }, nextId: "d" }];
    const r = validatePack(p);
    expect(r.warnings.some((w) => w.includes("no unconditional fallback"))).toBe(true);
  });

  it("rejects an invalid band in a condition", () => {
    const p = goodPack();
    (p.nodes[0] as any).textVariants[0].when = { RAPPORT: "medium" };
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("low|mid|high"))).toBe(true);
  });

  it("rejects an unknown node type", () => {
    const p = goodPack();
    (p.nodes[0] as any).type = "cutscene";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('type must be "action" or "dialogue"'))).toBe(true);
  });

  it("flags a recallWhen that references an unknown node", () => {
    const p = goodPack();
    (p.nodes[1] as any).textVariants[0].recallWhen = "nope";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('recallWhen references unknown node "nope"'))).toBe(true);
  });

  it("accepts a recallWhen that references a real node", () => {
    const p = goodPack();
    (p.nodes[1] as any).textVariants[0].recallWhen = "a";
    expect(validatePack(p).ok).toBe(true);
  });

  it("passes the shipped REVENANT pack with zero errors", () => {
    const r = validatePack(revenant as unknown as StoryPack);
    // Surface any real errors in the assertion message for quick diagnosis.
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
