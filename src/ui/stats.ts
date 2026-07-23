import { StoryPack } from "../state/storyTypes";

/** Divergence stats (Plan 5 T6): record which ending each playthrough reached
 *  in localStorage, so the end screen can show "you and N% of players chose
 *  this" — the Detroit: Become Human post-scene payoff. Pack-agnostic: ending
 *  ids are derived the same way here and in GameEngine (`nodeId:choiceOrStanceId`
 *  for any choice/stance whose edges can resolve to a null "ending" edge). */

export interface EndingInfo {
  id: string; // stable "nodeId:choiceOrStanceId" key
  label: string; // author `ending` label, falling back to the choice/stance id
}

/** Every ending the pack can reach, in authored order. Pure. */
export function packEndings(pack: StoryPack): EndingInfo[] {
  const out: EndingInfo[] = [];
  for (const node of pack.nodes) {
    const actors =
      node.type === "action"
        ? node.choices.map((c) => ({ id: c.id, label: c.ending, edges: c.edges }))
        : node.stances.map((s) => ({ id: s.id, label: s.ending, edges: s.edges }));
    for (const a of actors) {
      if (a.edges.some((e) => e.nextId === null)) {
        out.push({ id: `${node.id}:${a.id}`, label: a.label ?? a.id });
      }
    }
  }
  return out;
}

function storageKey(packId: string): string {
  return `living-stories:endings:${packId}`;
}

/** Ending -> times reached, from storage. Missing/corrupt store => {}. */
export function readCounts(
  packId: string,
  storage: Storage | undefined = safeStorage(),
): Record<string, number> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(storageKey(packId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Increment the counter for `endingId`, returning the updated counts. */
export function recordEnding(
  packId: string,
  endingId: string,
  storage: Storage | undefined = safeStorage(),
): Record<string, number> {
  const counts = readCounts(packId, storage);
  counts[endingId] = (counts[endingId] ?? 0) + 1;
  if (storage) {
    try {
      storage.setItem(storageKey(packId), JSON.stringify(counts));
    } catch {
      /* quota / disabled storage: stats are best-effort, never block the end screen */
    }
  }
  return counts;
}

export interface EndingStat extends EndingInfo {
  count: number;
  pct: number; // 0..100, share of total recorded playthroughs
  reached: boolean; // player has ever reached this ending
}

/** Merge the pack's possible endings with recorded counts into display rows. */
export function endingStats(pack: StoryPack, counts: Record<string, number>): EndingStat[] {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return packEndings(pack).map((e) => {
    const count = counts[e.id] ?? 0;
    return { ...e, count, reached: count > 0, pct: total ? (count / total) * 100 : 0 };
  });
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined; // some privacy modes throw on access
  }
}
