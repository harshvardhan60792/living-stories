import { Role, ROLES } from "./storyTypes";

/**
 * Plan 4 Task 2 — the Story Bible: the ONLY grounding the author-time generator
 * gets (spec §6). Small, human-authored, machine-checkable so node-by-node
 * generation can't drift off-premise. It is NOT played by the runtime; it is the
 * source brief the pipeline expands into a validated `StoryPack`.
 */
export interface BibleCharacter {
  name: string;
  role: string; // narrative function, e.g. "the accused", "the medium"
  voice: string; // how they speak — guides authored NPC lines
}

export interface BibleEnding {
  id: string; // stable slug, becomes a pack `ending` label anchor
  label: string; // short player-facing outcome, e.g. "You spared NIX"
  summary: string; // one line on how the run gets here (for the author)
}

export interface StoryBible {
  id: string;
  title: string;
  genre: string;
  premise: string; // one paragraph: the situation and the hook
  characters: BibleCharacter[];
  theTruth: string; // the secret the plot hides and slowly reveals
  tone: string; // mood/voice guidance for prose
  meterTheming: Record<Role, string | null>; // Role -> label (null = hidden), spec §5
  nodeBudget: { minDepth: number; maxDepth: number };
  startSituation: string; // the opening beat the start node dramatizes
  endings: BibleEnding[];
}

export interface BibleValidation {
  ok: boolean;
  errors: string[];
}

/** Mechanically check a parsed bible. Pure; returns a verdict, never throws. */
export function validateBible(input: unknown): BibleValidation {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["bible is not an object"] };
  }
  const b = input as Record<string, unknown>;

  for (const f of ["id", "title", "genre", "premise", "theTruth", "tone", "startSituation"] as const) {
    if (typeof b[f] !== "string" || !(b[f] as string).length) err(`bible.${f} must be a non-empty string`);
  }

  if (!Array.isArray(b.characters) || b.characters.length === 0) {
    err("bible.characters must be a non-empty array");
  } else {
    b.characters.forEach((c, i) => {
      const o = c as Record<string, unknown>;
      for (const f of ["name", "role", "voice"] as const) {
        if (typeof o?.[f] !== "string" || !(o[f] as string).length) err(`characters[${i}].${f} must be a non-empty string`);
      }
    });
  }

  if (typeof b.meterTheming !== "object" || b.meterTheming === null) {
    err("bible.meterTheming must be an object keyed by role");
  } else {
    for (const r of ROLES) {
      if (!(r in (b.meterTheming as object))) err(`meterTheming missing role ${r}`);
      else {
        const v = (b.meterTheming as Record<string, unknown>)[r];
        if (v !== null && typeof v !== "string") err(`meterTheming.${r} must be a string or null`);
      }
    }
  }

  const nb = b.nodeBudget as Record<string, unknown> | undefined;
  if (typeof nb !== "object" || nb === null) {
    err("bible.nodeBudget must be { minDepth, maxDepth }");
  } else {
    const min = nb.minDepth, max = nb.maxDepth;
    if (typeof min !== "number" || typeof max !== "number") err("nodeBudget.minDepth/maxDepth must be numbers");
    else if (min < 1 || max < min) err(`nodeBudget must satisfy 1 <= minDepth <= maxDepth (got ${min}..${max})`);
  }

  if (!Array.isArray(b.endings) || b.endings.length === 0) {
    err("bible.endings must be a non-empty array");
  } else {
    b.endings.forEach((e, i) => {
      const o = e as Record<string, unknown>;
      for (const f of ["id", "label", "summary"] as const) {
        if (typeof o?.[f] !== "string" || !(o[f] as string).length) err(`endings[${i}].${f} must be a non-empty string`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}
