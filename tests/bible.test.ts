import { describe, it, expect } from "vitest";
import { validateBible } from "../src/state/bibleTypes";
import { ROLES } from "../src/state/storyTypes";
import bible from "../ml-training/bibles/seventh-guest.bible.json";

describe("validateBible", () => {
  it("accepts the authored SEVENTH GUEST bible", () => {
    const r = validateBible(bible);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("its meterTheming covers all four roles", () => {
    for (const role of ROLES) expect(role in (bible as any).meterTheming).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(validateBible(null).ok).toBe(false);
  });

  it("flags a missing meter role", () => {
    const b: any = structuredClone(bible);
    delete b.meterTheming.INSIGHT;
    const r = validateBible(b);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("missing role INSIGHT"))).toBe(true);
  });

  it("flags an inverted node budget", () => {
    const b: any = structuredClone(bible);
    b.nodeBudget = { minDepth: 9, maxDepth: 4 };
    expect(validateBible(b).ok).toBe(false);
  });

  it("flags empty characters / endings", () => {
    const b: any = structuredClone(bible);
    b.characters = [];
    b.endings = [];
    const r = validateBible(b);
    expect(r.errors.some((e) => e.includes("characters"))).toBe(true);
    expect(r.errors.some((e) => e.includes("endings"))).toBe(true);
  });
});
