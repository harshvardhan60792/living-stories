import { describe, it, expect } from "vitest";
import { clampState, applyDelta, band, bands } from "../src/state/meters";

describe("meters", () => {
  it("bands by threshold", () => {
    expect(band(0)).toBe("low");
    expect(band(33)).toBe("low");
    expect(band(34)).toBe("mid");
    expect(band(66)).toBe("mid");
    expect(band(67)).toBe("high");
    expect(band(100)).toBe("high");
  });
  it("clamps into [0,100]", () => {
    const s = clampState({ RAPPORT: 150, VOLATILITY: -20, PRESSURE: 50, INSIGHT: 50 });
    expect(s.RAPPORT).toBe(100);
    expect(s.VOLATILITY).toBe(0);
  });
  it("applies and clamps deltas", () => {
    const s = applyDelta({ RAPPORT: 95, VOLATILITY: 50, PRESSURE: 50, INSIGHT: 50 }, { RAPPORT: 20 });
    expect(s.RAPPORT).toBe(100);
    expect(s.VOLATILITY).toBe(50);
  });
  it("computes all bands", () => {
    expect(bands({ RAPPORT: 10, VOLATILITY: 50, PRESSURE: 80, INSIGHT: 34 })).toEqual({
      RAPPORT: "low", VOLATILITY: "mid", PRESSURE: "high", INSIGHT: "mid",
    });
  });
});
