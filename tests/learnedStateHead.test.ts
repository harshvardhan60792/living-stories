import { describe, it, expect } from "vitest";
import { LearnedStateHead, StateHeadWeights } from "../src/engine/learnedStateHead";
import { MeterState } from "../src/state/storyTypes";

const ZERO: MeterState = { RAPPORT: 0, VOLATILITY: 0, PRESSURE: 0, INSIGHT: 0 };

// Small fixture (not the trained weights): 2 tones, so the math is checkable by hand.
const FIX: StateHeadWeights = {
  toneLabels: ["empathetic", "aggressive"],
  roles: ["RAPPORT", "VOLATILITY", "PRESSURE", "INSIGHT"],
  W_tone: [
    [8, -5, 0, 1], // empathetic
    [-8, 8, 3, 0], // aggressive
  ],
  W_state: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  bias: [0, 0, 0, 0],
};

describe("LearnedStateHead", () => {
  it("applies a pure tone vector against W_tone", () => {
    const h = new LearnedStateHead(FIX);
    const d = h.delta({ empathetic: 1 }, ZERO);
    expect(d).toEqual({ RAPPORT: 8, VOLATILITY: -5, INSIGHT: 1 }); // PRESSURE 0 trimmed
  });

  it("blends a tone distribution linearly", () => {
    const h = new LearnedStateHead(FIX);
    const d = h.delta({ empathetic: 0.5, aggressive: 0.5 }, ZERO);
    expect(d.RAPPORT ?? 0).toBeCloseTo(0); // (8 + -8)/2, exact-zero trimmed
    expect(d.VOLATILITY).toBeCloseTo(1.5); // (-5 + 8)/2
    expect(d.PRESSURE).toBeCloseTo(1.5); // (0 + 3)/2
  });

  it("ignores unknown tone labels", () => {
    const h = new LearnedStateHead(FIX);
    const d = h.delta({ nonsense: 1 }, ZERO);
    expect(d).toEqual({});
  });

  it("applies W_state and bias when present", () => {
    const withState: StateHeadWeights = {
      ...FIX,
      W_state: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      bias: [1, 0, 0, 0],
    };
    const h = new LearnedStateHead(withState);
    // RAPPORT = empathetic(8) + state.RAPPORT(3)*2 + bias(1) = 15
    const d = h.delta({ empathetic: 1 }, { ...ZERO, RAPPORT: 3 });
    expect(d.RAPPORT).toBe(15);
  });

  it("loads the real trained artifact and recovers authored intent", async () => {
    const weights = (await import("../ml-training/artifacts/state_head_weights.json"))
      .default as unknown as StateHeadWeights;
    const h = new LearnedStateHead(weights);
    const d = h.delta({ threatening: 1 }, ZERO);
    // tone_intent.threatening = RAPPORT -10, VOLATILITY 12, PRESSURE 5, INSIGHT 1
    expect(d.RAPPORT!).toBeCloseTo(-10, 1);
    expect(d.VOLATILITY!).toBeCloseTo(12, 1);
    expect(d.PRESSURE!).toBeCloseTo(5, 1);
    expect(d.INSIGHT!).toBeCloseTo(1, 1);
  });
});
