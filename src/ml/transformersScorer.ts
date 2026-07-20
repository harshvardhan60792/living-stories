import { pipeline, type TextClassificationPipeline } from "@huggingface/transformers";
import { ToneScorer, ToneVector, TONE_LABELS } from "../engine/scorer";

/**
 * Runs a text-classification model in-browser via transformers.js and projects its
 * output labels into the fixed TONE_LABELS space. Plan 2 supplies the fine-tuned model.
 */
export class TransformersScorer implements ToneScorer {
  private constructor(private clf: TextClassificationPipeline) {}

  static async create(modelId = "Xenova/distilbert-base-uncased-finetuned-sst-2-english"): Promise<TransformersScorer> {
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

/** Placeholder remap; Plan 2's model emits TONE_LABELS directly and this becomes identity. */
function mapLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (l === "positive") return "empathetic";
  if (l === "negative") return "aggressive";
  if (TONE_LABELS.includes(l as any)) return l;
  return null;
}
