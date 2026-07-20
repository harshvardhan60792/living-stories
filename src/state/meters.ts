import { Role, Band, MeterState, ROLES } from "./storyTypes";

export function band(v: number): Band {
  if (v < 34) return "low";
  if (v <= 66) return "mid";
  return "high";
}
export function clampState(s: MeterState): MeterState {
  const out = {} as MeterState;
  for (const r of ROLES) out[r] = Math.max(0, Math.min(100, s[r]));
  return out;
}
export function applyDelta(s: MeterState, d: Partial<MeterState>): MeterState {
  const out = { ...s };
  for (const r of ROLES) out[r] = s[r] + (d[r] ?? 0);
  return clampState(out);
}
export function bands(s: MeterState): Record<Role, Band> {
  const out = {} as Record<Role, Band>;
  for (const r of ROLES) out[r] = band(s[r]);
  return out;
}
