import { describe, it, expect } from "vitest";
import { packEndings, readCounts, recordEnding, endingStats } from "../src/ui/stats";
import { StoryPack } from "../src/state/storyTypes";
import revenant from "../public/stories/revenant.json";

const pack = revenant as unknown as StoryPack;

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe("stats", () => {
  it("derives every reachable ending from the pack with its author label", () => {
    const ids = packEndings(pack);
    expect(ids.map((e) => e.id).sort()).toEqual(["sign_end:end", "truth:doom", "truth:spare"]);
    expect(ids.find((e) => e.id === "truth:spare")!.label).toBe("You spared NIX");
  });

  it("falls back to the actor id when no ending label is authored", () => {
    const p: StoryPack = {
      ...pack,
      nodes: [
        {
          id: "n",
          type: "action",
          textVariants: [{ text: "x" }],
          choices: [{ id: "leave", text: "go", edges: [{ nextId: null }] }],
        },
      ],
      startNodeId: "n",
    };
    expect(packEndings(p)).toEqual([{ id: "n:leave", label: "leave" }]);
  });

  it("records and reads counts through injected storage", () => {
    const s = fakeStorage();
    expect(readCounts("revenant", s)).toEqual({});
    recordEnding("revenant", "truth:spare", s);
    recordEnding("revenant", "truth:spare", s);
    recordEnding("revenant", "truth:doom", s);
    expect(readCounts("revenant", s)).toEqual({ "truth:spare": 2, "truth:doom": 1 });
  });

  it("computes divergence percentages against total playthroughs", () => {
    const s = fakeStorage();
    recordEnding("revenant", "truth:spare", s);
    recordEnding("revenant", "truth:spare", s);
    recordEnding("revenant", "truth:spare", s);
    recordEnding("revenant", "truth:doom", s);
    const stats = endingStats(pack, readCounts("revenant", s));
    const spare = stats.find((e) => e.id === "truth:spare")!;
    const doom = stats.find((e) => e.id === "truth:doom")!;
    const shot = stats.find((e) => e.id === "sign_end:end")!;
    expect(spare.pct).toBe(75);
    expect(doom.pct).toBe(25);
    expect(shot.reached).toBe(false);
    expect(shot.pct).toBe(0);
  });

  it("treats a corrupt store as empty (never throws)", () => {
    const s = fakeStorage();
    s.setItem("living-stories:endings:revenant", "{not json");
    expect(readCounts("revenant", s)).toEqual({});
  });
});
