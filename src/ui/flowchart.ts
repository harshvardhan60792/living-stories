import cytoscape, { Core, ElementDefinition } from "cytoscape";
import { StoryPack } from "../state/storyTypes";
import { classifyNodes, ghostEdgeKeys } from "./ghostPaths";

export function buildElements(pack: StoryPack): ElementDefinition[] {
  const els: ElementDefinition[] = [];
  for (const n of pack.nodes) els.push({ data: { id: n.id, label: n.id } });
  for (const n of pack.nodes) {
    const edges = n.type === "action" ? n.choices.flatMap((c) => c.edges) : n.stances.flatMap((s) => s.edges);
    edges.forEach((e, i) => {
      if (e.nextId) els.push({ data: { id: `${n.id}->${e.nextId}#${i}`, source: n.id, target: e.nextId } });
    });
  }
  return els;
}

export class Flowchart {
  private cy: Core;
  private pack: StoryPack;
  constructor(container: HTMLElement, pack: StoryPack) {
    this.pack = pack;
    this.cy = cytoscape({
      container,
      elements: buildElements(pack),
      style: [
        { selector: "node", style: { "background-color": "#2a2f3a", label: "data(label)",
          color: "#8a90a0", "font-size": 9 } },
        { selector: "edge", style: { "line-color": "#20242e", width: 1, "target-arrow-shape": "triangle",
          "target-arrow-color": "#20242e", "curve-style": "bezier" } },
        // ghost = branches the player saw from a visited node but didn't take:
        // faded + dashed so divergence is visible without dominating the view.
        { selector: "node.ghost", style: { "background-color": "#2a2f3a", "border-color": "#5ad1c8",
          "border-width": 1, "border-style": "dashed", opacity: 0.45 } },
        { selector: "edge.ghost", style: { "line-color": "#3a5f5b", "target-arrow-color": "#3a5f5b",
          "line-style": "dashed", opacity: 0.45 } },
        { selector: ".visited", style: { "background-color": "#5ad1c8", color: "#e8e8ee", opacity: 1 } },
        { selector: ".path", style: { "line-color": "#5ad1c8", "target-arrow-color": "#5ad1c8", width: 2, opacity: 1 } },
      ],
      layout: { name: "breadthfirst", directed: true, padding: 8 },
    });
  }
  markVisited(nodeId: string, fromId?: string): void {
    this.cy.getElementById(nodeId).addClass("visited");
    if (fromId) {
      this.cy.edges(`[source = "${fromId}"][target = "${nodeId}"]`).addClass("path");
    }
  }
  /** Recompute ghost (untaken-but-seen) nodes/edges from the visit history. */
  refreshGhosts(history: string[]): void {
    const states = classifyNodes(this.pack, history);
    this.cy.nodes().forEach((n) => {
      // never override a taken node; only (re)mark ghosts
      if (states.get(n.id()) === "ghost" && !n.hasClass("visited")) n.addClass("ghost");
      else n.removeClass("ghost");
    });
    const ghostEdges = ghostEdgeKeys(this.pack, history);
    this.cy.edges().forEach((e) => {
      const key = `${e.data("source")}->${e.data("target")}`;
      if (ghostEdges.has(key) && !e.hasClass("path")) e.addClass("ghost");
      else e.removeClass("ghost");
    });
  }
}
