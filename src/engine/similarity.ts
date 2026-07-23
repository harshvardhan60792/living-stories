export function l2normalize(v: number[]): number[] {
  const mag = Math.hypot(...v);
  return mag === 0 ? v.slice() : v.map((x) => x / mag);
}
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const denom = Math.sqrt(ma) * Math.sqrt(mb);
  return denom === 0 ? 0 : dot / denom;
}
