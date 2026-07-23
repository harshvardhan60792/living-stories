import { StoryNode, Edge, BandCondition, MeterState, Band, Role, ROLES } from "../state/storyTypes";
import { bands } from "../state/meters";

export function matchesCondition(when: BandCondition | undefined, b: Record<Role, Band>): boolean {
  if (!when) return true;
  return ROLES.every((r) => when[r] === undefined || when[r] === b[r]);
}

/**
 * Choose a node's text variant, most-specific first:
 *   1. a memory-callback variant (recallWhen node visited) whose band also matches
 *   2. a plain band-conditional variant that matches
 *   3. the first unconditional (default) variant
 * `history` defaults to empty so recall variants are simply skipped when omitted.
 */
export function pickTextVariant(node: StoryNode, state: MeterState, history: string[] = []): string {
  const b = bands(state);
  const recalled = node.textVariants.find(
    (v) => v.recallWhen && history.includes(v.recallWhen) && matchesCondition(v.when, b),
  );
  if (recalled) return recalled.text;
  const conditional = node.textVariants.find((v) => !v.recallWhen && v.when && matchesCondition(v.when, b));
  if (conditional) return conditional.text;
  const def = node.textVariants.find((v) => !v.when && !v.recallWhen) ?? node.textVariants[0];
  return def.text;
}

export function selectEdge(edges: Edge[], state: MeterState): Edge | undefined {
  const b = bands(state);
  return edges.find((e) => matchesCondition(e.when, b));
}
