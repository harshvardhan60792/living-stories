import cytoscape, { Core, ElementDefinition } from "cytoscape";
import { StoryPack } from "../state/storyTypes";
import { successors } from "./ghostPaths";

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
  private succ: Map<string, string[]>;
  constructor(container: HTMLElement, pack: StoryPack) {
    this.pack = pack;
    this.succ = successors(pack);
    this.cy = cytoscape({
      container,
      elements: buildElements(pack),
      // Presentation only: the player can't pan, zoom, drag, or box-select, so
      // the map physically cannot wander out of its frame. It's a picture, not
      // a toy. Smooth colour/opacity transitions animate visited/ghost changes.
      userZoomingEnabled: false,
      userPanningEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: true,
      autolock: true,
      minZoom: 0.2,
      maxZoom: 1.5,
      style: [
        // No labels: raw node ids aren't player-facing and overlap badly on a
        // deep graph. The map reads by colour — where you've been, where you
        // could have gone — like a constellation, not a diagram.
        { selector: "node", style: { "background-color": "#2a2f3a", width: 12, height: 12,
          "transition-property": "background-color, border-width, opacity", "transition-duration": 350 } },
        { selector: "edge", style: { "line-color": "#20242e", width: 1, "target-arrow-shape": "triangle",
          "target-arrow-color": "#20242e", "curve-style": "bezier",
          "transition-property": "line-color, width, opacity", "transition-duration": 350 } },
        // ghost = branches the player saw from a visited node but didn't take:
        // faded + dashed so divergence is visible without dominating the view.
        { selector: "node.ghost", style: { "background-color": "#2a2f3a", "border-color": "#5ad1c8",
          "border-width": 1, "border-style": "dashed", opacity: 0.45 } },
        { selector: "edge.ghost", style: { "line-color": "#3a5f5b", "target-arrow-color": "#3a5f5b",
          "line-style": "dashed", opacity: 0.45 } },
        { selector: ".visited", style: { "background-color": "#5ad1c8", opacity: 1 } },
        { selector: ".path", style: { "line-color": "#5ad1c8", "target-arrow-color": "#5ad1c8", width: 2.5, opacity: 1 } },
        // "You are here": the node the player is currently on, enlarged + haloed.
        { selector: ".current", style: { "background-color": "#8ff0e8", width: 18, height: 18,
          "border-color": "#8ff0e8", "border-width": 4, "border-opacity": 0.35 } },
      ],
      layout: { name: "breadthfirst", directed: true, padding: 14, spacingFactor: 1.1 },
    });
    // A story is deep (start -> many beats -> endings): laid out vertically it's
    // tall and narrow and collapses into this wide, short frame. Transpose it to
    // flow left-to-right so it fills the frame and stays legible, then fit.
    this.cy.ready(() => {
      this.transpose();
      this.fit();
    });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.fit()).observe(container);
    }
  }
  private transpose(): void {
    this.cy.batch(() => {
      this.cy.nodes().forEach((n) => {
        const p = n.position();
        n.position({ x: p.y, y: p.x });
      });
    });
  }
  private fit(): void {
    this.cy.resize();
    const shown = this.cy.elements(":visible");
    this.cy.fit(shown.length ? shown : undefined, 18);
  }
  markVisited(nodeId: string, fromId?: string): void {
    this.cy.nodes().removeClass("current");
    this.cy.getElementById(nodeId).addClass("visited").addClass("current");
    if (fromId) {
      this.cy.edges(`[source = "${fromId}"][target = "${nodeId}"]`).addClass("path");
    }
  }
  /**
   * Reveal the map as the player earns it — never spoil the road ahead.
   * Shown: nodes you've visited, plus the branches you *passed up* at decisions
   * you've already moved through (the "what you missed" ghosts). The choices at
   * the node you're standing on now are NOT previewed here — you only learn a
   * road existed once you've chosen past it. Everything else stays hidden.
   */
  refreshGhosts(history: string[]): void {
    const visited = new Set(history);
    const current = history[history.length - 1];
    const ghostNodes = new Set<string>();
    const ghostEdges = new Set<string>();
    for (const v of history) {
      if (v === current) continue; // don't reveal the choices where you now stand
      for (const s of this.succ.get(v) ?? []) {
        if (!visited.has(s)) {
          ghostNodes.add(s);
          ghostEdges.add(`${v}->${s}`);
        }
      }
    }
    const revealed = new Set([...visited, ...ghostNodes]);
    this.cy.nodes().forEach((n) => {
      const id = n.id();
      if (!revealed.has(id)) {
        n.style("display", "none");
        return;
      }
      n.style("display", "element");
      if (ghostNodes.has(id) && !visited.has(id)) n.addClass("ghost");
      else n.removeClass("ghost");
    });
    this.cy.edges().forEach((e) => {
      if (e.hasClass("path")) {
        e.style("display", "element");
        return;
      }
      const key = `${e.data("source")}->${e.data("target")}`;
      if (ghostEdges.has(key)) {
        e.style("display", "element");
        e.addClass("ghost");
      } else {
        e.style("display", "none");
        e.removeClass("ghost");
      }
    });
    this.fit();
  }
}
