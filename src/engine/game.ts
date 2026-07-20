import { StoryPack, StoryNode, MeterState } from "../state/storyTypes";
import { applyDelta } from "../state/meters";
import { pickTextVariant, selectEdge } from "./router";
import { ToneScorer, StateHead } from "./scorer";

export type ActInput = { choiceId: string } | { text: string };
export interface ActResult {
  text: string;
  npcResponse?: string;
  deltas: Partial<MeterState>;
  state: MeterState;
  nextNodeId: string | null;
  ended: boolean;
}

export class GameEngine {
  private _state: MeterState;
  private _current: StoryNode;
  private _history: string[] = [];

  constructor(private pack: StoryPack, private scorer: ToneScorer, private head: StateHead) {
    this._state = { ...pack.initialState };
    this._current = this.node(pack.startNodeId);
    this._history.push(this._current.id);
  }

  get currentNode(): StoryNode { return this._current; }
  get state(): MeterState { return this._state; }
  get history(): string[] { return this._history; }

  currentText(): string { return pickTextVariant(this._current, this._state); }

  private node(id: string): StoryNode {
    const n = this.pack.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`unknown node ${id}`);
    return n;
  }

  async act(input: ActInput): Promise<ActResult> {
    let sourceText: string;
    let npcResponse: string | undefined;
    let edges;

    if (this._current.type === "action") {
      const current = this._current;
      if (!("choiceId" in input)) throw new Error("action node needs a choiceId");
      const choice = current.choices.find((c) => c.id === input.choiceId);
      if (!choice) throw new Error(`unknown choice ${input.choiceId}`);
      sourceText = choice.text;
      edges = choice.edges;
    } else {
      // dialogue node
      const current = this._current;
      if ("choiceId" in input) {
        const st = current.stances.find((s) => s.id === input.choiceId);
        if (!st) throw new Error(`unknown stance ${input.choiceId}`);
        sourceText = st.anchorPhrasings[0] ?? "";
        npcResponse = st.npcResponse;
        edges = st.edges;
      } else {
        // free text: Plan 4 adds semantic routing; here, fall back stance for routing,
        // but score the ACTUAL typed text for relationship deltas.
        const fb = current.stances.find((s) => s.id === current.fallbackStanceId)!;
        sourceText = input.text;
        npcResponse = fb.npcResponse;
        edges = fb.edges;
      }
    }

    const tone = await this.scorer.scoreTone(sourceText);
    const deltas = this.head.delta(tone, this._state);
    this._state = applyDelta(this._state, deltas);

    const edge = selectEdge(edges, this._state);
    const nextNodeId = edge ? edge.nextId : null;
    const ended = nextNodeId === null;
    if (!ended) {
      this._current = this.node(nextNodeId!);
      this._history.push(this._current.id);
    }
    return { text: ended ? "" : this.currentText(), npcResponse, deltas, state: this._state, nextNodeId, ended };
  }
}
