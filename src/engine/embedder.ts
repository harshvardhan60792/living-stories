import { l2normalize } from "./similarity";

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Deterministic hashing bag-of-words embedder for tests + offline dev.
 *  Shared tokens map to shared dimensions, so lexical overlap ⇒ higher cosine. */
export class MockEmbedder implements Embedder {
  constructor(private dim = 256) {}
  async embed(text: string): Promise<number[]> {
    const v = new Array(this.dim).fill(0);
    for (const tok of text.toLowerCase().split(/[^a-z']+/).filter(Boolean)) {
      v[this.hash(tok) % this.dim] += 1;
    }
    return l2normalize(v);
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
  private hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
}
