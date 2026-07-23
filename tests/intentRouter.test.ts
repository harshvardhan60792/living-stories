import { describe, it, expect } from "vitest";
import { nearestStance, StanceRouter, buildStanceIndex } from "../src/engine/intentRouter";
import { MockEmbedder } from "../src/engine/embedder";
import pack from "../public/stories/revenant.json";
import { StoryPack } from "../src/state/storyTypes";

describe("nearestStance (pure)", () => {
  it("picks the stance with the highest max-anchor cosine", () => {
    const q = [1, 0];
    const anchors = [[[0, 1]], [[1, 0], [0.9, 0.1]]]; // stance 1 aligns with q
    expect(nearestStance(q, anchors, 0.5)!.index).toBe(1);
  });
  it("returns null below threshold", () => {
    expect(nearestStance([1, 0], [[[0, 1]]], 0.5)).toBeNull();
  });
});

describe("StanceRouter over the revenant 'talk' node", () => {
  const talk = (pack as unknown as StoryPack).nodes.find((n) => n.id === "talk")! as any;

  it("routes empathetic free text to the empathize stance", async () => {
    const r = await StanceRouter.build(new MockEmbedder(), talk.stances, talk.fallbackStanceId, 0.3);
    const out = await r.route("I believe you, you're safe with me");
    expect(out.stanceId).toBe("empathize");
    expect(out.isFallback).toBe(false);
  });
  it("routes accusatory free text to the press stance", async () => {
    const r = await StanceRouter.build(new MockEmbedder(), talk.stances, talk.fallbackStanceId, 0.3);
    expect((await r.route("you killed him, stop lying")).stanceId).toBe("press");
  });
  it("falls back on off-topic input", async () => {
    const r = await StanceRouter.build(new MockEmbedder(), talk.stances, talk.fallbackStanceId, 0.3);
    const out = await r.route("what is the weather forecast tomorrow");
    expect(out.isFallback).toBe(true);
    expect(out.stanceId).toBe(talk.fallbackStanceId);
  });
});

describe("buildStanceIndex", () => {
  it("has a router for dialogue nodes and none for action nodes", async () => {
    const index = await buildStanceIndex(pack as unknown as StoryPack, new MockEmbedder(), 0.3);
    expect(index.has("talk")).toBe(true); // dialogue node
    expect(index.has("cell")).toBe(false); // action node
    const out = await index.get("talk")!.route("I believe you");
    expect(out.stanceId).toBe("empathize");
  });
});
