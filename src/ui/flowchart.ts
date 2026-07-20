import cytoscape, { Core, ElementDefinition } from "cytoscape";
import { StoryPack } from "../state/storyTypes";

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
  constructor(container: HTMLElement, pack: StoryPack) {
    this.cy = cytoscape({
      container,
      elements: buildElements(pack),
      style: [
        { selector: "node", style: { "background-color": "#2a2f3a", label: "data(label)",
          color: "#8a90a0", "font-size": 9 } },
        { selector: "edge", style: { "line-color": "#20242e", width: 1, "target-arrow-shape": "triangle",
          "target-arrow-color": "#20242e", "curve-style": "bezier" } },
        { selector: ".visited", style: { "background-color": "#5ad1c8", color: "#e8e8ee" } },
        { selector: ".path", style: { "line-color": "#5ad1c8", "target-arrow-color": "#5ad1c8", width: 2 } },
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
}
