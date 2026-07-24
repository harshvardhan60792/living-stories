import "./ui/style.css";
import { StoryManifestEntry, StoryPack } from "./state/storyTypes";
import { GameEngine, ActInput } from "./engine/game";
import { MockScorer, LinearHead, ToneScorer, StateHead } from "./engine/scorer";
import { LearnedStateHead, StateHeadWeights } from "./engine/learnedStateHead";
import stateHeadWeights from "../ml-training/artifacts/state_head_weights.json";
import type { StanceRouter } from "./engine/intentRouter";
import { renderMeters } from "./ui/meters";
import { renderScene } from "./ui/scene";
import { renderMenu } from "./ui/menu";
import { renderIntro } from "./ui/intro";
import { Flowchart } from "./ui/flowchart";
import { recordEnding, endingStats } from "./ui/stats";
import { effectiveDeltas } from "./ui/deltaPreview";
import { applyDelta } from "./state/meters";
import type { MeterState } from "./state/storyTypes";

const app = document.getElementById("app")!;
const base = import.meta.env.BASE_URL;

async function main() {
  const entries: StoryManifestEntry[] = await (await fetch(`${base}stories/index.json`)).json();
  renderMenu(app, entries, (id) => startStory(id));
}

function toMenu() {
  main();
}

// Fetch the pack, then show the world-setting intro. Only on "Begin" do we
// load the ML models and drop into the first scene.
async function startStory(id: string) {
  const pack: StoryPack = await (await fetch(`${base}stories/${id}.json`)).json();
  renderIntro(app, pack, () => beginStory(pack), toMenu);
}

async function beginStory(pack: StoryPack) {
  app.innerHTML = `<div id="meters"></div><div id="scene"></div><div id="flowchart"></div>`;
  const metersEl = document.getElementById("meters")!;
  const sceneEl = document.getElementById("scene")!;
  const flow = new Flowchart(document.getElementById("flowchart")!, pack);
  flow.markVisited(pack.startNodeId);
  flow.refreshGhosts([pack.startNodeId]);

  // Models lazy-load from the HF Hub on first play; show a placeholder so the
  // scene area isn't blank while they download (cold load can take some seconds).
  sceneEl.innerHTML = `<p class="scene reading">Setting the scene…</p>`;

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

  // Learned tone->meter head (Plan 3 Task 5/8), bundled weights — no network fetch.
  // Falls back to the hand-tuned LinearHead only if the weights JSON is somehow bad.
  let head: StateHead;
  try {
    head = new LearnedStateHead(stateHeadWeights as unknown as StateHeadWeights);
  } catch (err) {
    console.warn("LearnedStateHead unavailable, using LinearHead:", err);
    head = new LinearHead();
  }

  const engine = new GameEngine(pack, scorer, head, stanceIndex);

  // Emotion-read preview (T4): reuse the loaded scorer+head to predict the
  // clamp-aware meter shift a given source text would apply from current state.
  async function previewFor(sourceText: string): Promise<Partial<MeterState>> {
    const tone = await scorer.scoreTone(sourceText);
    const raw = head.delta(tone, engine.state);
    return effectiveDeltas(engine.state, applyDelta(engine.state, raw));
  }
  function draw(text: string, npcResponse?: string, stanceId?: string) {
    renderMeters(metersEl, pack.meterLabels, engine.state, pack.meterBands);
    renderScene(sceneEl, {
      text, npcResponse, stanceId, node: engine.currentNode,
      onChoice: (cid) => turn({ choiceId: cid }),
      onText: (t) => turn({ text: t }),
      previewFor, meterLabels: pack.meterLabels,
    });
  }
  // Detroit-style divergence panel: record this run's ending, then show how the
  // player's choice compares to every ending recorded on this device.
  function endScreenHtml(endingId?: string, endingLabel?: string): string {
    if (!endingId) return "";
    const counts = recordEnding(pack.id, endingId);
    const rows = endingStats(pack, counts)
      .map((s) => {
        const mine = s.id === endingId;
        const pct = Math.round(s.pct);
        return (
          `<li class="ending-row${mine ? " mine" : ""}${s.reached ? "" : " locked"}">` +
          `<div class="ending-bar" style="width:${pct}%"></div>` +
          `<span class="ending-label">${escapeHtml(s.label)}${mine ? " · your ending" : ""}</span>` +
          `<span class="ending-pct">${s.reached ? pct + "%" : "—"}</span>` +
          `</li>`
        );
      })
      .join("");
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return (
      `<div class="endstats">` +
      `<h3>${escapeHtml(endingLabel ?? "Your ending")}</h3>` +
      `<ul class="ending-list">${rows}</ul>` +
      `<p class="endstats-total">${total} playthrough${total === 1 ? "" : "s"} recorded on this device</p>` +
      `</div>`
    );
  }
  async function turn(input: ActInput) {
    const from = engine.currentNode.id;
    // Typed turns embed the text (async); show a brief "reading…" affordance.
    if ("text" in input) {
      sceneEl.innerHTML = `<p class="scene reading">Considering your words…</p>`;
    }
    const res = await engine.act(input);
    if (res.ended) {
      renderMeters(metersEl, pack.meterLabels, engine.state, pack.meterBands);
      sceneEl.innerHTML =
        `<p class="scene">${escapeHtml(res.npcResponse ?? "")}</p>` +
        `<p class="scene"><em>— End —</em></p>` +
        endScreenHtml(res.endingId, res.endingLabel);
      return;
    }
    flow.markVisited(engine.currentNode.id, from);
    flow.refreshGhosts(engine.history);
    draw(res.text, res.npcResponse, res.stanceId);
  }
  draw(engine.currentText());
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

main();
