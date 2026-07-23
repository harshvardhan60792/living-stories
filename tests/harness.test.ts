import { describe, it, expect } from "vitest";
import { generatePack, LM } from "../ml-training/generate/harness";
import { StoryBible } from "../src/state/bibleTypes";

const bible: StoryBible = {
  id: "stub",
  title: "STUB",
  genre: "test",
  premise: "p",
  characters: [{ name: "N", role: "r", voice: "v" }],
  theTruth: "t",
  tone: "tone",
  meterTheming: { RAPPORT: "R", VOLATILITY: "V", PRESSURE: "P", INSIGHT: null },
  nodeBudget: { minDepth: 2, maxDepth: 5 },
  startSituation: "begin",
  endings: [{ id: "d1", label: "the end", summary: "reach d1 and stop" }],
};

function slotId(prompt: string): string {
  return /Target node id: "([^"]+)"/.exec(prompt)![1];
}

/** Stub LM: returns canned valid node JSON per requested slot id. */
const validLM =
  (): LM =>
  async (prompt) => {
    const id = slotId(prompt);
    const canned: Record<string, unknown> = {
      start: {
        type: "action",
        textVariants: [{ text: "You arrive." }],
        choices: [
          { id: "go", text: "go on", edges: [{ nextId: "d1" }] },
          { id: "stop", text: "walk out", ending: "You left", edges: [{ nextId: null }] },
        ],
      },
      d1: {
        type: "dialogue",
        textVariants: [{ text: "N looks up." }],
        fallbackStanceId: "s1",
        stances: [
          { id: "s1", anchorPhrasings: ["hello"], npcResponse: "hi", ending: "the end", edges: [{ nextId: null }] },
          { id: "s2", anchorPhrasings: ["leave"], npcResponse: "bye", edges: [{ nextId: null }] },
        ],
      },
    };
    // wrap in stray prose/fence to exercise extractJson tolerance
    return "Sure:\n```json\n" + JSON.stringify(canned[id]) + "\n```";
  };

describe("generatePack", () => {
  it("assembles a pack from a stub LM that passes the Task-1 validator", async () => {
    const { pack, report, genErrors } = await generatePack(bible, validLM());
    expect(genErrors).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(pack.nodes.map((n) => n.id).sort()).toEqual(["d1", "start"]);
    expect(pack.startNodeId).toBe("start");
  });

  it("surfaces the validator's fatal error (not a broken pack) on a dangling edge", async () => {
    const danglingLM: LM = async (prompt) => {
      const id = slotId(prompt);
      if (id === "start") {
        return JSON.stringify({
          type: "action",
          textVariants: [{ text: "x" }],
          choices: [
            { id: "go", text: "go", edges: [{ nextId: "ghost" }] },
            { id: "stop", text: "stop", edges: [{ nextId: null }] },
          ],
        });
      }
      return "not json at all"; // "ghost" slot fails to generate
    };
    const { report, genErrors } = await generatePack(bible, danglingLM);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes('unknown node "ghost"'))).toBe(true);
    expect(genErrors.some((e) => e.includes("ghost"))).toBe(true);
  });

  it("caps runaway generation at maxNodes", async () => {
    let n = 0;
    const runawayLM: LM = async () => {
      const next = `n${n++}`;
      return JSON.stringify({
        type: "action",
        textVariants: [{ text: "loop" }],
        choices: [{ id: "c", text: "c", edges: [{ nextId: next }, { nextId: null }] }],
      });
    };
    const { genErrors } = await generatePack(bible, runawayLM, { maxNodes: 5 });
    expect(genErrors.some((e) => e.includes("node budget exceeded"))).toBe(true);
  });
});
