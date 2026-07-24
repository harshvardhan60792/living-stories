import { describe, it, expect } from "vitest";
import { formatDeltas, effectiveDeltas } from "../src/ui/deltaPreview";
import { applyDelta } from "../src/state/meters";
import { MeterState, Role } from "../src/state/storyTypes";

const labels: Record<Role, string | null> = {
  RAPPORT: "Trust",
  VOLATILITY: "Stability",
  PRESSURE: "Warden",
  INSIGHT: "Suspicion",
};

describe("formatDeltas", () => {
  it("describes shifts qualitatively with the short themed label, no numbers", () => {
    expect(formatDeltas({ RAPPORT: 6.4, VOLATILITY: -2.1 }, labels)).toBe("↑ Trust   ↓ Stability");
  });

  it("uses the evocative name after the middle dot", () => {
    const themed = { ...labels, RAPPORT: "The Countess · Pity" };
    expect(formatDeltas({ RAPPORT: 4 }, themed)).toBe("↑ Pity");
  });

  it("drops negligible moves", () => {
    expect(formatDeltas({ RAPPORT: 0.3, PRESSURE: 4 }, labels)).toBe("↑ Warden");
  });

  it("omits hidden meters (null label)", () => {
    const hidden = { ...labels, INSIGHT: null };
    expect(formatDeltas({ INSIGHT: 9, RAPPORT: 3 }, hidden)).toBe("↑ Trust");
  });

  it("returns empty string when nothing moves", () => {
    expect(formatDeltas({ RAPPORT: 0.1 }, labels)).toBe("");
    expect(formatDeltas({}, labels)).toBe("");
  });
});

describe("effectiveDeltas", () => {
  it("reports the clamp-aware shift the engine would actually apply", () => {
    const state: MeterState = { RAPPORT: 98, VOLATILITY: 2, PRESSURE: 50, INSIGHT: 50 };
    const next = applyDelta(state, { RAPPORT: 10, VOLATILITY: -10, PRESSURE: 5 });
    const eff = effectiveDeltas(state, next);
    expect(eff.RAPPORT).toBe(2); // capped at 100, not +10
    expect(eff.VOLATILITY).toBe(-2); // floored at 0, not -10
    expect(eff.PRESSURE).toBe(5); // unbounded here
    expect(eff.INSIGHT).toBe(0);
  });
});
