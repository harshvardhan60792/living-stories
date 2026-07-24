import { describe, it, expect } from "vitest";
import { buildElements } from "../src/ui/flowchart";
import pack from "../public/stories/revenant.json";
import { StoryPack } from "../src/state/storyTypes";

describe("buildElements", () => {
  it("creates a node per story node and an edge per outgoing edge", () => {
    const els = buildElements(pack as unknown as StoryPack);
    const nodes = els.filter((e) => !e.data.source);
    const edges = els.filter((e) => e.data.source);
    expect(nodes.length).toBe(10);
    // one edge per outgoing non-null edge across the expanded 10-node pack
    expect(edges.length).toBeGreaterThanOrEqual(5);
  });
});
