import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePack } from "../src/state/validatePack";
import { StoryManifestEntry } from "../src/state/storyTypes";

// CI gate (Plan 5 T8): every shipped story pack must pass the validator, and the
// menu manifest must line up with the pack files. Runs under `npm test`, which
// the deploy workflow executes before build — so an invalid pack fails the deploy
// instead of shipping a broken story.
const STORIES_DIR = join(__dirname, "..", "public", "stories");

function packFiles(): string[] {
  return readdirSync(STORIES_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(STORIES_DIR, file), "utf8"));
}

describe("shipped story packs", () => {
  it("has at least one pack besides the manifest", () => {
    expect(packFiles().length).toBeGreaterThan(0);
  });

  it.each(packFiles())("%s validates with zero errors", (file) => {
    const r = validatePack(readJson(file));
    // include the actual errors in the failure message for a fast diagnosis
    expect(r.errors, `${file}: ${r.errors.join(" | ")}`).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("index.json entries each map to a pack file whose id matches", () => {
    const entries = readJson("index.json") as StoryManifestEntry[];
    expect(Array.isArray(entries)).toBe(true);
    const files = new Set(packFiles());
    for (const e of entries) {
      expect(files.has(`${e.id}.json`), `manifest id "${e.id}" has no ${e.id}.json`).toBe(true);
      const pack = readJson(`${e.id}.json`) as { id?: string };
      expect(pack.id, `${e.id}.json internal id mismatch`).toBe(e.id);
    }
  });
});
