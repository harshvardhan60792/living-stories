# Living Stories

Text-based interactive fiction where **choices matter**, in the spirit of *Detroit: Become Human*. Branching stories are driven by continuous relationship meters that accumulate from both your choices **and** your free-typed words — not fixed menus. Everything runs client-side; the ML runs **in your browser**.

**▶ Play live: https://harshvardhan60792.github.io/living-stories/**

First story: **REVENANT** — one android, one night, one signature that ends a life, or doesn't.

## How it works

Three cheap, composable layers, all in-browser (transformers.js, WebGPU with automatic WASM fallback — no server, no API keys):

1. **Tone encoder** — a fine-tuned MiniLM ([`Harsh-ag26/living-stories-tone-encoder`](https://huggingface.co/Harsh-ag26/living-stories-tone-encoder), 14-label multi-label, int8 ONNX) reads the emotional tone of what you type or pick.
2. **State head** — a small learned linear map turns that tone into meter shifts (RAPPORT / VOLATILITY / PRESSURE / INSIGHT), clamped to [0, 100].
3. **Stance routing** — free text is embedded (MiniLM) and cosine-matched to the nearest authored NPC stance; off-topic input falls back to a safe stance, so the story never freezes.

Meters, not flags, select which authored text you reach — the same node reads differently depending on the relationship you've built. Untaken branches show as **ghost paths** on the flowchart, late scenes **recall** earlier decisions, hovering a choice **previews** its meter shift, and the end screen shows how your ending **diverges** from your past runs.

## Develop

```bash
npm install
npm run dev      # Vite dev server
npm test         # vitest — includes pack validation; gates deploy
npx tsc --noEmit # typecheck
```

Stories live in `public/stories/*.json` (validated by `src/state/validatePack.ts`). ML model-training scripts are in `ml-training/`. Deploy is a test-gated GitHub Actions workflow to Pages; ML code is lazy code-split so first paint isn't blocked on model download.

## Stack

Vite · vanilla TypeScript · transformers.js · Cytoscape (flowchart) · vitest
