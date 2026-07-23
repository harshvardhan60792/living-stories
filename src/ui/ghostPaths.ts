import { StoryPack } from "../state/storyTypes";

/**
 * Plan 5 Task 3 — classify a pack's nodes/edges into three visual states so the
 * flowchart can render *ghost paths*: the faded untaken branches that make a
 * playthrough's divergence legible (spec §13, Detroit-style flow view).
 *
 *   taken     — node the player has visited (bright)
 *   ghost     — unvisited node reachable in ONE step from a visited node: an
 *               untaken branch the player could have picked (faded/dashed)
 *   available — every other unvisited node (normal styling)
 *
 * Pure and Cytoscape-free so it is unit-testable in isolation; the Flowchart
 * class consumes the result to set CSS classes.
 */
export type NodeVizState = "taken" | "ghost" | "available";

/** Directed successors (non-null nextId) of each node id. */
export function successors(pack: StoryPack): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of pack.nodes) {
    const edges = n.type === "action"
      ? n.choices.flatMap((c) => c.edges)
      : n.stances.flatMap((s) => s.edges);
    const outs: string[] = [];
    for (const e of edges) if (e.nextId) outs.push(e.nextId);
    adj.set(n.id, outs);
  }
  return adj;
}

export function classifyNodes(pack: StoryPack, history: string[]): Map<string, NodeVizState> {
  const taken = new Set(history);
  const adj = successors(pack);

  // one-step-from-taken, minus taken itself, are ghosts
  const ghost = new Set<string>();
  for (const id of taken) {
    for (const next of adj.get(id) ?? []) {
      if (!taken.has(next)) ghost.add(next);
    }
  }

  const out = new Map<string, NodeVizState>();
  for (const n of pack.nodes) {
    out.set(n.id, taken.has(n.id) ? "taken" : ghost.has(n.id) ? "ghost" : "available");
  }
  return out;
}

/**
 * Edge ids whose SOURCE is visited but TARGET is not — the branches the player
 * saw but didn't take. Returned as a set of `${source}->${target}` keys the
 * flowchart matches against its edge endpoints.
 */
export function ghostEdgeKeys(pack: StoryPack, history: string[]): Set<string> {
  const taken = new Set(history);
  const keys = new Set<string>();
  const adj = successors(pack);
  for (const id of taken) {
    for (const next of adj.get(id) ?? []) {
      if (!taken.has(next)) keys.add(`${id}->${next}`);
    }
  }
  return keys;
}
