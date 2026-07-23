import { pipeline, type TextClassificationPipeline } from "@huggingface/transformers";
import { ToneScorer, ToneVector, TONE_LABELS } from "../engine/scorer";

/**
 * Runs a text-classification model in-browser via transformers.js and projects its
 * output labels into the fixed TONE_LABELS space. Plan 2 supplies the fine-tuned model.
 */
export class TransformersScorer implements ToneScorer {
  private constructor(private clf: TextClassificationPipeline) {}

  // Fine-tuned MiniLM tone classifier (Plan 3 Task 3/6): emits the 14 TONE_LABELS
  // directly as its output labels, so mapLabel below is an identity check.
  static async create(modelId = "Harsh-ag26/living-stories-tone-encoder"): Promise<TransformersScorer> {
    const clf = (await pipeline("text-classification", modelId, { dtype: "q8" })) as TextClassificationPipeline;
    return new TransformersScorer(clf);
  }

  async scoreTone(text: string): Promise<ToneVector> {
    // top_k: null asks the pipeline for scores across all labels (top_k: 0 returns zero
    // results in this transformers.js version's topk() implementation).
    const out = (await this.clf(text, { top_k: null })) as Array<{ label: string; score: number }>;
    const v: ToneVector = {};
    for (const l of TONE_LABELS) v[l] = 0.02;
    for (const { label, score } of out) {
      const key = mapLabel(label);
      if (key) v[key] += score;
    }
    const sum = Object.values(v).reduce((a, b) => a + b, 0);
    for (const l of TONE_LABELS) v[l] /= sum;
    return v;
  }
}

/** The fine-tuned encoder emits TONE_LABELS directly, so this is an identity check
 *  that just drops any label outside the taxonomy. */
function mapLabel(label: string): string | null {
  const l = label.toLowerCase();
  return TONE_LABELS.includes(l as any) ? l : null;
}
