import { StoryPack, StoryNode, MeterState } from "../state/storyTypes";
import { applyDelta } from "../state/meters";
import { pickTextVariant, selectEdge } from "./router";
import { ToneScorer, StateHead, ToneVector } from "./scorer";
import { StanceRouter } from "./intentRouter";

export type ActInput = { choiceId: string } | { text: string };
export interface ActResult {
  text: string;
  npcResponse?: string;
  deltas: Partial<MeterState>;
  state: MeterState;
  nextNodeId: string | null;
  ended: boolean;
  stanceId?: string; // which dialogue stance drove this turn, if any
  endingId?: string; // stable "nodeId:choiceOrStanceId" key, only when ended
  endingLabel?: string; // author `ending` label for the reached ending, if any
}

export class GameEngine {
  private _state: MeterState;
  private _current: StoryNode;
  private _history: string[] = [];

  constructor(
    private pack: StoryPack,
    private scorer: ToneScorer,
    private head: StateHead,
    private stanceIndex?: Map<string, StanceRouter>,
  ) {
    this._state = { ...pack.initialState };
    this._current = this.node(pack.startNodeId);
    this._history.push(this._current.id);
  }

  get currentNode(): StoryNode { return this._current; }
  get state(): MeterState { return { ...this._state }; }
  get history(): string[] { return this._history; }

  currentText(): string { return pickTextVariant(this._current, this._state, this._history); }

  private node(id: string): StoryNode {
    const n = this.pack.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`unknown node ${id}`);
    return n;
  }

  async act(input: ActInput): Promise<ActResult> {
    let sourceText: string;
    let npcResponse: string | undefined;
    let stanceId: string | undefined;
    let edges;
    // Identify the acting choice/stance so a reached ending can be labelled.
    const decisionNodeId = this._current.id;
    let actingId: string | undefined;
    let endingLabel: string | undefined;

    if (this._current.type === "action") {
      const current = this._current;
      if (!("choiceId" in input)) throw new Error("action node needs a choiceId");
      const choice = current.choices.find((c) => c.id === input.choiceId);
      if (!choice) throw new Error(`unknown choice ${input.choiceId}`);
      sourceText = choice.text;
      edges = choice.edges;
      actingId = choice.id;
      endingLabel = choice.ending;
    } else {
      // dialogue node
      const current = this._current;
      if ("choiceId" in input) {
        const st = current.stances.find((s) => s.id === input.choiceId);
        if (!st) throw new Error(`unknown stance ${input.choiceId}`);
        sourceText = st.anchorPhrasings[0] ?? "";
        npcResponse = st.npcResponse;
        edges = st.edges;
        stanceId = st.id;
        actingId = st.id;
        endingLabel = st.ending;
      } else {
        // Free text (Layer 2): semantically route to the nearest authored stance.
        // Layer 1 still scores the ACTUAL typed text for relationship deltas below.
        // A routing failure (or no router) must not freeze the turn — degrade to
        // the authored fallback stance, mirroring the scoreTone guard.
        stanceId = current.fallbackStanceId;
        const router = this.stanceIndex?.get(current.id);
        if (router) {
          try {
            stanceId = (await router.route(input.text)).stanceId;
          } catch (err) {
            console.warn("stance routing failed; using fallback stance:", err);
          }
        }
        const st = current.stances.find((s) => s.id === stanceId) ?? current.stances[0];
        sourceText = input.text;
        npcResponse = st.npcResponse;
        edges = st.edges;
        actingId = st.id;
        endingLabel = st.ending;
      }
    }

    // A mid-game scorer failure (transient model/WASM error) must not freeze the
    // turn — fall back to a neutral tone so the story still advances (load-time
    // failures are handled separately by main.ts's MockScorer fallback).
    let tone: ToneVector;
    try {
      tone = await this.scorer.scoreTone(sourceText);
    } catch (err) {
      console.warn("scoreTone failed; treating as neutral tone:", err);
      tone = {};
    }
    const deltas = this.head.delta(tone, this._state);
    this._state = applyDelta(this._state, deltas);

    const edge = selectEdge(edges, this._state);
    const nextNodeId = edge ? edge.nextId : null;
    const ended = nextNodeId === null;
    if (!ended) {
      this._current = this.node(nextNodeId!);
      this._history.push(this._current.id);
    }
    const endingId = ended && actingId ? `${decisionNodeId}:${actingId}` : undefined;
    return {
      text: ended ? "" : this.currentText(),
      npcResponse, deltas, state: this._state, nextNodeId, ended, stanceId,
      endingId, endingLabel: ended ? endingLabel : undefined,
    };
  }
}
