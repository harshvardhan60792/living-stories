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
    expect(ids.map((e) => e.id).sort()).toEqual([
      "judge1:doom_shallow",
      "judge1:spare_shallow",
      "sign_end:end",
      "wren:expose",
      "wren:mercy",
      "wren:sacrifice",
    ]);
    expect(ids.find((e) => e.id === "wren:mercy")!.label).toBe(
      "You buried the truth so NIX could go home to Wren",
    );
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
    recordEnding("revenant", "wren:mercy", s);
    recordEnding("revenant", "wren:mercy", s);
    recordEnding("revenant", "wren:expose", s);
    expect(readCounts("revenant", s)).toEqual({ "wren:mercy": 2, "wren:expose": 1 });
  });

  it("computes divergence percentages against total playthroughs", () => {
    const s = fakeStorage();
    recordEnding("revenant", "wren:mercy", s);
    recordEnding("revenant", "wren:mercy", s);
    recordEnding("revenant", "wren:mercy", s);
    recordEnding("revenant", "wren:expose", s);
    const stats = endingStats(pack, readCounts("revenant", s));
    const spare = stats.find((e) => e.id === "wren:mercy")!;
    const doom = stats.find((e) => e.id === "wren:expose")!;
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
