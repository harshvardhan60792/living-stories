import "./ui/style.css";
import { StoryManifestEntry, StoryPack } from "./state/storyTypes";
import { GameEngine, ActInput } from "./engine/game";
import { MockScorer, LinearHead, ToneScorer } from "./engine/scorer";
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

  let scorer: ToneScorer = new MockScorer();
  try {
    const { TransformersScorer } = await import("./ml/transformersScorer");
    scorer = await TransformersScorer.create();
  } catch (err) {
    console.warn("ML scorer unavailable, using MockScorer:", err);
  }
  const engine = new GameEngine(pack, scorer, new LinearHead());

  function draw(text: string, npcResponse?: string) {
    renderMeters(metersEl, pack.meterLabels, engine.state);
    renderScene(sceneEl, {
      text, npcResponse, node: engine.currentNode,
      onChoice: (cid) => turn({ choiceId: cid }),
      onText: (t) => turn({ text: t }),
    });
  }
  async function turn(input: ActInput) {
    const from = engine.currentNode.id;
    const res = await engine.act(input);
    if (res.ended) {
      renderMeters(metersEl, pack.meterLabels, engine.state);
      sceneEl.innerHTML = `<p class="scene">${res.npcResponse ?? ""}</p><p class="scene"><em>— End —</em></p>`;
      return;
    }
    flow.markVisited(engine.currentNode.id, from);
    draw(res.text, res.npcResponse);
  }
  draw(engine.currentText());
}

main();
