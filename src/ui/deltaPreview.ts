import { MeterState, Role, ROLES } from "../state/storyTypes";

/** Emotion-read tooltip (Plan 5 T4): format a predicted meter change into a
 *  compact string like "↑ RAPPORT +6   ↓ VOLATILITY −2". Pure. Hidden meters
 *  (null label) are omitted, and roles whose rounded shift is 0 are dropped.
 *  Returns "" when nothing moves — the caller shows a "no shift" affordance. */
export function formatDeltas(
  deltas: Partial<MeterState>,
  meterLabels: Record<Role, string | null>,
): string {
  const parts: string[] = [];
  for (const r of ROLES) {
    if (meterLabels[r] == null) continue; // hidden meter for this story
    const n = Math.round(deltas[r] ?? 0);
    if (n === 0) continue;
    const arrow = n > 0 ? "↑" : "↓";
    const sign = n > 0 ? "+" : "−"; // U+2212 minus, matches |n|
    parts.push(`${arrow} ${r} ${sign}${Math.abs(n)}`);
  }
  return parts.join("   ");
}

/** Effective (clamp-aware) delta between two states — matches what the engine
 *  commits, so the preview never over-promises a shift that a meter already at
 *  its 0/100 bound can't actually take. */
export function effectiveDeltas(state: MeterState, next: MeterState): Partial<MeterState> {
  const out: Partial<MeterState> = {};
  for (const r of ROLES) out[r] = next[r] - state[r];
  return out;
}
