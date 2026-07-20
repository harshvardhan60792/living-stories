import { StoryNode, Edge, BandCondition, MeterState, Band, Role, ROLES } from "../state/storyTypes";
import { bands } from "../state/meters";

export function matchesCondition(when: BandCondition | undefined, b: Record<Role, Band>): boolean {
  if (!when) return true;
  return ROLES.every((r) => when[r] === undefined || when[r] === b[r]);
}

/** Prefer a conditional variant that matches; fall back to the first unconditional one. */
export function pickTextVariant(node: StoryNode, state: MeterState): string {
  const b = bands(state);
  const conditional = node.textVariants.find((v) => v.when && matchesCondition(v.when, b));
  if (conditional) return conditional.text;
  const def = node.textVariants.find((v) => !v.when) ?? node.textVariants[0];
  return def.text;
}

export function selectEdge(edges: Edge[], state: MeterState): Edge | undefined {
  const b = bands(state);
  return edges.find((e) => matchesCondition(e.when, b));
}
