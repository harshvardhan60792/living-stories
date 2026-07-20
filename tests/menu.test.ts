import { describe, it, expect, vi } from "vitest";
import { renderMenu } from "../src/ui/menu";

describe("renderMenu", () => {
  it("lists stories and fires onPick with the id", () => {
    const el = document.createElement("div");
    const onPick = vi.fn();
    renderMenu(el, [{ id: "revenant", title: "REVENANT", genre: "Sci-fi", blurb: "b" }], onPick);
    const card = el.querySelector(".story-card") as HTMLElement;
    expect(card.textContent).toContain("REVENANT");
    card.click();
    expect(onPick).toHaveBeenCalledWith("revenant");
  });
});
