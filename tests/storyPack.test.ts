import { describe, it, expect } from "vitest";
import pack from "../public/stories/revenant.json";
import { StoryPack, ROLES } from "../src/state/storyTypes";

describe("revenant fixture", () => {
  it("is a structurally valid pack", () => {
    const p = pack as unknown as StoryPack;
    expect(p.nodes.find((n) => n.id === p.startNodeId)).toBeTruthy();
    for (const r of ROLES) expect(typeof p.initialState[r]).toBe("number");
    // every non-null edge points to an existing node
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const n of p.nodes) {
      const edges = n.type === "action" ? n.choices.flatMap((c) => c.edges) : n.stances.flatMap((s) => s.edges);
      for (const e of edges) if (e.nextId !== null) expect(ids.has(e.nextId)).toBe(true);
    }
  });
});
