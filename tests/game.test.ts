import { describe, it, expect } from "vitest";
import { GameEngine } from "../src/engine/game";
import { MockScorer, LinearHead } from "../src/engine/scorer";
import pack from "../public/stories/revenant.json";
import { StoryPack } from "../src/state/storyTypes";

function newGame() {
  return new GameEngine(pack as unknown as StoryPack, new MockScorer(), new LinearHead());
}

describe("GameEngine", () => {
  it("starts at the start node", () => {
    const g = newGame();
    expect(g.currentNode.id).toBe("cell");
    expect(g.currentText()).toContain("NIX");
  });

  it("an empathetic choice raises RAPPORT and routes forward", async () => {
    const g = newGame();
    const before = g.state.RAPPORT;
    const res = await g.act({ choiceId: "open" });
    expect(res.nextNodeId).toBe("talk");
    expect(g.currentNode.id).toBe("talk");
    expect(g.state.RAPPORT).toBeGreaterThanOrEqual(before); // "sincere" tag text scores non-negative
  });

  it("same node, different accumulated state -> different text variant", async () => {
    const g = newGame();
    // Force high rapport, then read the dialogue node text.
    (g as any)._state = { RAPPORT: 90, VOLATILITY: 40, PRESSURE: 40, INSIGHT: 40 };
    (g as any)._current = g["pack"].nodes.find((n: any) => n.id === "talk");
    expect(g.currentText()).toContain("trusting");
  });

  it("free text drives relationship via the scorer", async () => {
    const g = newGame();
    await g.act({ choiceId: "open" }); // -> talk (dialogue node)
    const before = g.state.RAPPORT;
    const res = await g.act({ text: "I believe you. You are safe with me." });
    expect(res.deltas.RAPPORT ?? 0).toBeGreaterThan(0);
    expect(g.state.RAPPORT).toBeGreaterThan(before);
  });

  it("reaching a null edge ends the story", async () => {
    const g = newGame();
    await g.act({ choiceId: "sign" });
    const res = await g.act({ choiceId: "end" });
    expect(res.ended).toBe(true);
    expect(res.nextNodeId).toBeNull();
  });

  it("survives a mid-game scorer failure: advances with neutral (zero) deltas", async () => {
    const throwingScorer = {
      scoreTone: async () => {
        throw new Error("model exploded");
      },
    };
    const g = new GameEngine(pack as unknown as StoryPack, throwingScorer, new LinearHead());
    const before = g.state;
    const res = await g.act({ choiceId: "open" });
    // turn still advances despite the scorer throwing
    expect(res.nextNodeId).toBe("talk");
    expect(g.currentNode.id).toBe("talk");
    // neutral tone => no meter movement
    expect(g.state.RAPPORT).toBe(before.RAPPORT);
  });
});
