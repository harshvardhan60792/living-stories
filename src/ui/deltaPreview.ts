import { MeterState, Role, ROLES } from "../state/storyTypes";

/** The evocative short name of a themed meter for inline use — the part after
 *  the "·" ("The Countess · Pity" -> "Pity"), else the whole label. */
export function shortLabel(label: string): string {
  const i = label.lastIndexOf("·");
  return (i >= 0 ? label.slice(i + 1) : label).trim();
}

/** Emotion-read tooltip (Plan 5 T4): describe where a choice would move the
 *  feelings — qualitative and diegetic, e.g. "↑ Pity   ↓ Dread". No numbers, no
 *  raw role enums (labels are polarity-aligned: value up = more of the named
 *  thing). Hidden meters (null label) and negligible moves are dropped. Returns
 *  "" when nothing meaningful moves. */
export function formatDeltas(
  deltas: Partial<MeterState>,
  meterLabels: Record<Role, string | null>,
): string {
  const parts: string[] = [];
  for (const r of ROLES) {
    const label = meterLabels[r];
    if (label == null) continue; // hidden meter for this story
    const n = deltas[r] ?? 0;
    if (Math.abs(n) < 0.5) continue; // negligible — don't clutter the read
    parts.push(`${n > 0 ? "↑" : "↓"} ${shortLabel(label)}`);
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
