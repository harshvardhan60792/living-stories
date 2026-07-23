import { MeterState, Role, ROLES } from "../state/storyTypes";
import { StateHead, ToneVector } from "./scorer";

/** Shape of ml-training/artifacts/state_head_weights.json (Plan 3 Task 5). */
export interface StateHeadWeights {
  toneLabels: string[];
  roles: Role[];
  /** toneLabels.length × roles.length */
  W_tone: number[][];
  /** roles.length × roles.length (state → Δ; currently zeros by design) */
  W_state: number[][];
  /** roles.length */
  bias: number[];
}

/**
 * Learned replacement for LinearHead's hand-picked matrix, behind the same StateHead
 * interface (Plan 3 Task 8). Applies delta = tone · W_tone + state · W_state + bias,
 * using weights fit by ml-training/train_state_head.py. The weight JSON is bundled at
 * build time (tiny — 14×4), so there is no network fetch and no fallback needed.
 */
export class LearnedStateHead implements StateHead {
  private toneIdx: Map<string, number>;

  constructor(private w: StateHeadWeights) {
    this.toneIdx = new Map(w.toneLabels.map((t, i) => [t, i]));
  }

  delta(tone: ToneVector, state: MeterState): Partial<MeterState> {
    const d: Partial<MeterState> = {};
    this.w.roles.forEach((role, j) => {
      let acc = this.w.bias[j] ?? 0;
      // tone contribution
      for (const [label, p] of Object.entries(tone)) {
        const i = this.toneIdx.get(label);
        if (i === undefined) continue;
        acc += p * (this.w.W_tone[i]?.[j] ?? 0);
      }
      // state contribution (W_state is zeros today; kept for future retrains)
      ROLES.forEach((r, k) => {
        acc += (state[r] ?? 0) * (this.w.W_state[k]?.[j] ?? 0);
      });
      if (acc !== 0) d[role] = acc;
    });
    return d;
  }
}
