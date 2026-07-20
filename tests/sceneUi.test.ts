import { describe, it, expect, vi } from "vitest";
import { renderScene } from "../src/ui/scene";
import { StoryNode } from "../src/state/storyTypes";

const action = { id: "cell", type: "action", textVariants: [],
  choices: [{ id: "open", text: "Open", edges: [] }, { id: "sign", text: "Sign", edges: [] }] } as unknown as StoryNode;
const dialogue = { id: "talk", type: "dialogue", textVariants: [], fallbackStanceId: "press",
  stances: [{ id: "press", anchorPhrasings: [], npcResponse: "", edges: [] }] } as unknown as StoryNode;

describe("renderScene", () => {
  it("renders one button per choice and fires onChoice", () => {
    const el = document.createElement("div");
    const onChoice = vi.fn();
    renderScene(el, { text: "hello", node: action, onChoice, onText: () => {} });
    const btns = el.querySelectorAll(".choice");
    expect(btns.length).toBe(2);
    (btns[0] as HTMLButtonElement).click();
    expect(onChoice).toHaveBeenCalledWith("open");
  });
  it("renders a free-text input on dialogue nodes and fires onText on Enter", () => {
    const el = document.createElement("div");
    const onText = vi.fn();
    renderScene(el, { text: "hi", node: dialogue, onChoice: () => {}, onText });
    const input = el.querySelector(".freetext") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = "I believe you";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onText).toHaveBeenCalledWith("I believe you");
  });
});
