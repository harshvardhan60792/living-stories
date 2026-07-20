import { describe, it, expect } from "vitest";
import { renderMeters } from "../src/ui/meters";

describe("renderMeters", () => {
  it("renders a labelled bar per visible role, width = value%", () => {
    const el = document.createElement("div");
    renderMeters(el, { RAPPORT: "Trust", VOLATILITY: null, PRESSURE: "Warden", INSIGHT: "Suspicion" },
      { RAPPORT: 70, VOLATILITY: 50, PRESSURE: 20, INSIGHT: 40 });
    const bars = el.querySelectorAll(".meter");
    expect(bars.length).toBe(3); // VOLATILITY hidden
    const fill = el.querySelector('.meter[data-role="RAPPORT"] .fill') as HTMLElement;
    expect(fill.style.width).toBe("70%");
  });
});
