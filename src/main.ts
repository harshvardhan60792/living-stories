import "./ui/style.css";
import { StoryManifestEntry, StoryPack } from "./state/storyTypes";
import { GameEngine, ActInput } from "./engine/game";
import { MockScorer, LinearHead, ToneScorer } from "./engine/scorer";
import type { StanceRouter } from "./engine/intentRouter";
import { renderMeters } from "./ui/meters";
import { renderScene } from "./ui/scene";
import { renderMenu } from "./ui/menu";
import { Flowchart } from "./ui/flowchart";

const app = document.getElementById("app")!;
const base = import.meta.env.BASE_URL;

async function main() {
  const entries: StoryManifestEntry[] = await (await fetch(`${base}stories/index.json`)).json();
  renderMenu(app, entries, (id) => startStory(id));
}

async function startStory(id: string) {
  const pack: StoryPack = await (await fetch(`${base}stories/${id}.json`)).json();
  app.innerHTML = `<div id="meters"></div><div id="scene"></div><div id="flowchart"></div>`;
  const metersEl = document.getElementById("meters")!;
  const sceneEl = document.getElementById("scene")!;
  const flow = new Flowchart(document.getElementById("flowchart")!, pack);
  flow.markVisited(pack.startNodeId);

  // Models lazy-load from the HF Hub on first play; show a placeholder so the
  // scene area isn't blank while they download (cold load can take some seconds).
  sceneEl.innerHTML = `<p class="scene reading">Waking the interrogation room…</p>`;

  let scorer: ToneScorer = new MockScorer();
  try {
    const { TransformersScorer } = await import("./ml/transformersScorer");
    scorer = await TransformersScorer.create();
  } catch (err) {
    console.warn("ML scorer unavailable, using MockScorer:", err);
  }

  // Build a real (MiniLM) stance index for semantic free-text routing. On any
  // failure the engine simply falls back to each dialogue node's authored
  // fallback stance, so the game stays fully playable offline.
  let stanceIndex: Map<string, StanceRouter> | undefined;
  try {
    const { TransformersEmbedder } = await import("./ml/transformersEmbedder");
    const { buildStanceIndex } = await import("./engine/intentRouter");
    // Threshold 0.3 tuned against MiniLM on this pack: genuine paraphrases score
    // >=~0.39, off-topic input <=~0.24, so 0.3 cleanly separates match from fallback.
    stanceIndex = await buildStanceIndex(pack, await TransformersEmbedder.create(), 0.3);
  } catch (err) {
    console.warn("stance router unavailable, using fallback stances:", err);
  }

  const engine = new GameEngine(pack, scorer, new LinearHead(), stanceIndex);

  function draw(text: string, npcResponse?: string, stanceId?: string) {
    renderMeters(metersEl, pack.meterLabels, engine.state);
    renderScene(sceneEl, {
      text, npcResponse, stanceId, node: engine.currentNode,
      onChoice: (cid) => turn({ choiceId: cid }),
      onText: (t) => turn({ text: t }),
    });
  }
  async function turn(input: ActInput) {
    const from = engine.currentNode.id;
    // Typed turns embed the text (async); show a brief "reading…" affordance.
    if ("text" in input) {
      sceneEl.innerHTML = `<p class="scene reading">NIX considers your words…</p>`;
    }
    const res = await engine.act(input);
    if (res.ended) {
      renderMeters(metersEl, pack.meterLabels, engine.state);
      sceneEl.innerHTML = `<p class="scene">${res.npcResponse ?? ""}</p><p class="scene"><em>— End —</em></p>`;
      return;
    }
    flow.markVisited(engine.currentNode.id, from);
    draw(res.text, res.npcResponse, res.stanceId);
  }
  draw(engine.currentText());
}

main();
