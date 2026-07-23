import { describe, it, expect } from "vitest";
import { GameEngine } from "../src/engine/game";
import { MockScorer, LinearHead } from "../src/engine/scorer";
import { buildStanceIndex } from "../src/engine/intentRouter";
import { MockEmbedder } from "../src/engine/embedder";
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

  it("memory callback: truth node recalls the earlier decision to talk", async () => {
    const g = newGame();
    // land on the truth node with "talk" in history (the wired path arrives there
    // only via talk), then confirm currentText picks the recallWhen:"talk" variant.
    (g as any)._history = ["cell", "talk", "truth"];
    (g as any)._current = g["pack"].nodes.find((n: any) => n.id === "truth");
    expect(g.currentText()).toContain("sat down instead of reaching");
    // and without that history, the default variant is used
    (g as any)._history = ["truth"];
    expect(g.currentText()).not.toContain("sat down instead of reaching");
  });

  it("reaching a null edge ends the story", async () => {
    const g = newGame();
    await g.act({ choiceId: "sign" });
    const res = await g.act({ choiceId: "end" });
    expect(res.ended).toBe(true);
    expect(res.nextNodeId).toBeNull();
  });

  it("free text routes to the nearest authored stance", async () => {
    const index = await buildStanceIndex(pack as unknown as StoryPack, new MockEmbedder(), 0.3);
    const g = new GameEngine(pack as unknown as StoryPack, new MockScorer(), new LinearHead(), index);
    await g.act({ choiceId: "open" }); // -> talk
    const res = await g.act({ text: "I believe you, you're safe with me" });
    expect(res.stanceId).toBe("empathize");
    expect(res.npcResponse).toContain("Scared"); // empathize stance's authored line
  });

  it("without a stance index, free text uses the fallback stance (back-compat)", async () => {
    const g = new GameEngine(pack as unknown as StoryPack, new MockScorer(), new LinearHead());
    await g.act({ choiceId: "open" });
    const res = await g.act({ text: "anything at all" });
    expect(res.stanceId).toBe("press"); // fallbackStanceId
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
