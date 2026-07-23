import { cosineSimilarity } from "./similarity";
import { Embedder } from "./embedder";
import { Stance } from "../state/storyTypes";

/**
 * Pure nearest-stance selection. `stanceAnchors[i]` is the list of anchor
 * embeddings for stance `i`; a stance scores as the MAX cosine over its anchors.
 * Returns the best stance if its score >= threshold, else null (caller uses the
 * authored fallback stance).
 */
export function nearestStance(
  query: number[],
  stanceAnchors: number[][][],
  threshold: number,
): { index: number; score: number } | null {
  let best = { index: -1, score: -Infinity };
  stanceAnchors.forEach((anchors, i) => {
    const score = anchors.length
      ? Math.max(...anchors.map((a) => cosineSimilarity(query, a)))
      : -Infinity;
    if (score > best.score) best = { index: i, score };
  });
  return best.index >= 0 && best.score >= threshold ? best : null;
}

/**
 * Holds an embedder + the precomputed anchor index for ONE dialogue node.
 * `route(text)` embeds the text and returns the nearest authored stance, or the
 * node's fallback stance when nothing clears the similarity threshold.
 */
export class StanceRouter {
  private constructor(
    private stances: Stance[],
    private fallbackStanceId: string,
    private anchorEmbeddings: number[][][],
    private embedder: Embedder,
    private threshold: number,
  ) {}

  static async build(
    embedder: Embedder,
    stances: Stance[],
    fallbackStanceId: string,
    threshold = 0.4,
  ): Promise<StanceRouter> {
    const anchorEmbeddings = await Promise.all(
      stances.map((s) => embedder.embedBatch(s.anchorPhrasings)),
    );
    return new StanceRouter(stances, fallbackStanceId, anchorEmbeddings, embedder, threshold);
  }

  async route(text: string): Promise<{ stanceId: string; score: number; isFallback: boolean }> {
    const q = await this.embedder.embed(text);
    const hit = nearestStance(q, this.anchorEmbeddings, this.threshold);
    if (!hit) return { stanceId: this.fallbackStanceId, score: 0, isFallback: true };
    return { stanceId: this.stances[hit.index].id, score: hit.score, isFallback: false };
  }
}
