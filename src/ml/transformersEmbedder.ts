import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { Embedder } from "../engine/embedder";

/**
 * Sentence embeddings in-browser via transformers.js feature-extraction.
 * Off-the-shelf MiniLM (Xenova/all-MiniLM-L6-v2); mean-pooled + L2-normalized,
 * so cosine similarity is well-scaled and a routing threshold near 0.4 is sane.
 * Lazy-loaded from the HF Hub; callers guard construction and fall back gracefully.
 */
export class TransformersEmbedder implements Embedder {
  private constructor(private extractor: FeatureExtractionPipeline) {}

  static async create(modelId = "Xenova/all-MiniLM-L6-v2"): Promise<TransformersEmbedder> {
    const extractor = (await pipeline("feature-extraction", modelId, { dtype: "q8" })) as FeatureExtractionPipeline;
    return new TransformersEmbedder(extractor);
  }

  async embed(text: string): Promise<number[]> {
    const out = await this.extractor(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const out = await this.extractor(texts, { pooling: "mean", normalize: true });
    return out.tolist() as number[][];
  }
}
