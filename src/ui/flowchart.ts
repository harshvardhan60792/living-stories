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
      // autoungrabify blocks the user from dragging nodes. NOTE: do NOT also set
      // autolock — locked nodes are skipped by layouts, which pins every node at
      // (0,0) and collapses the whole map into a single dot.
      autoungrabify: true,
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
      // No cytoscape layout: we position nodes ourselves (positionByDepth) so the
      // graph reliably flows LEFT-TO-RIGHT and fills this wide, short frame. The
      // built-in breadthfirst+transpose approach produced a portrait aspect that
      // fit() could only shrink into a narrow centred column.
      layout: { name: "preset" },
    });
    this.cy.ready(() => {
      this.positionByDepth();
      this.fit();
    });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.fit()).observe(container);
    }
  }
  /**
   * Deterministic left-to-right DAG layout. x = BFS depth from the start node
   * (story progress flows rightward); y spreads a depth's nodes evenly around
   * the centre line. Wide by construction, so it fills the landscape frame.
   */
  private positionByDepth(): void {
    const depth = new Map<string, number>();
    const start = this.pack.startNodeId;
    const queue = [start];
    depth.set(start, 0);
    while (queue.length) {
      const cur = queue.shift()!;
      const d = depth.get(cur)!;
      for (const s of this.succ.get(cur) ?? []) {
        if (!depth.has(s)) {
          depth.set(s, d + 1);
          queue.push(s);
        }
      }
    }
    const byDepth = new Map<number, string[]>();
    this.cy.nodes().forEach((n) => {
      const d = depth.get(n.id()) ?? 0;
      const bucket = byDepth.get(d) ?? [];
      bucket.push(n.id());
      byDepth.set(d, bucket);
    });
    const XGAP = 96;
    const YGAP = 46;
    this.cy.batch(() => {
      for (const [d, ids] of byDepth) {
        ids.forEach((id, i) => {
          const y = (i - (ids.length - 1) / 2) * YGAP;
          this.cy.getElementById(id).position({ x: d * XGAP, y });
        });
      }
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
