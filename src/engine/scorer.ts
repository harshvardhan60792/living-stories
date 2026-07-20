import { MeterState, Role } from "../state/storyTypes";

export const TONE_LABELS = [
  "empathetic", "aggressive", "deceptive", "reassuring", "defiant", "cold",
  "submissive", "curious", "threatening", "apologetic", "dismissive", "sincere",
  "evasive", "calm",
] as const;
export type ToneVector = Record<string, number>;

export interface ToneScorer {
  scoreTone(text: string): Promise<ToneVector>;
}
export interface StateHead {
  /** Given a tone distribution and current state, return meter deltas. */
  delta(tone: ToneVector, state: MeterState): Partial<MeterState>;
}

/** Deterministic keyword scorer for tests + offline dev. Swapped for TransformersScorer in prod. */
export class MockScorer implements ToneScorer {
  private lex: Record<string, string[]> = {
    empathetic: ["believe", "safe", "scared", "understand", "sorry", "trust"],
    aggressive: ["killed", "lying", "stop", "now", "liar", "confess"],
    cold: ["sign", "order", "shut", "doesn't matter", "procedure"],
    reassuring: ["okay", "calm", "here", "help"],
    curious: ["what", "why", "how", "tell me"],
    sincere: ["i believe you", "the truth", "honestly"],
  };
  async scoreTone(text: string): Promise<ToneVector> {
    const t = text.toLowerCase();
    const v: ToneVector = {};
    for (const l of TONE_LABELS) v[l] = 0.05;
    for (const [label, words] of Object.entries(this.lex)) {
      for (const w of words) if (t.includes(w)) v[label] += 0.5;
    }
    const sum = Object.values(v).reduce((a, b) => a + b, 0);
    for (const l of TONE_LABELS) v[l] /= sum;
    return v;
  }
}

/**
 * Transparent stand-in for the learned head (Plan 2 replaces it behind this interface).
 * A fixed tone→role weight matrix. Kept intentionally simple; the ONNX head plugs in later.
 */
export class LinearHead implements StateHead {
  private W: Record<string, Partial<Record<Role, number>>> = {
    empathetic: { RAPPORT: 12, VOLATILITY: -6 },
    sincere: { RAPPORT: 8, INSIGHT: 4 },
    reassuring: { VOLATILITY: -8, RAPPORT: 4 },
    curious: { INSIGHT: 6 },
    aggressive: { RAPPORT: -10, VOLATILITY: 10, PRESSURE: 4 },
    threatening: { RAPPORT: -12, VOLATILITY: 14 },
    cold: { RAPPORT: -6, PRESSURE: 8 },
    dismissive: { RAPPORT: -6 },
  };
  delta(tone: ToneVector, _state: MeterState): Partial<MeterState> {
    const d: Partial<MeterState> = {};
    for (const [label, weights] of Object.entries(this.W)) {
      const p = tone[label] ?? 0;
      for (const [role, w] of Object.entries(weights)) {
        d[role as Role] = (d[role as Role] ?? 0) + p * (w as number);
      }
    }
    return d;
  }
}
