import { StoryBible } from "../../src/state/bibleTypes";
import { StoryPack, StoryNode, MeterState, Role, ROLES } from "../../src/state/storyTypes";
import { validatePack, ValidationResult } from "../../src/state/validatePack";
import { buildNodePrompt, Exemplar, SlotSpec } from "./prompts";

/**
 * Plan 4 Task 3 — the assembler. Walks a frontier of unfilled node slots,
 * asking the injected `lm` for ONE node's JSON at a time (grounded via
 * buildNodePrompt), stitches them into a candidate StoryPack, then runs the
 * Task-1 validator. `lm` is injected so tests use a deterministic stub and the
 * dry-run (Task 4) can plug in a real few-shot model — the harness itself never
 * touches a GPU or the network.
 */
export type LM = (prompt: string) => Promise<string>;

export interface GenerateOptions {
  startId?: string; // slot id of the first node (default "start")
  exemplars?: Exemplar[];
  maxNodes?: number; // safety cap against a runaway LM inventing endless slots
  initialState?: MeterState;
}

export interface GenerateResult {
  pack: StoryPack;
  report: ValidationResult;
  genErrors: string[]; // per-slot generation failures (bad JSON, missing id, ...)
}

const DEFAULT_STATE: MeterState = { RAPPORT: 30, VOLATILITY: 50, PRESSURE: 40, INSIGHT: 20 };

export async function generatePack(
  bible: StoryBible,
  lm: LM,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const startId = opts.startId ?? "start";
  const maxNodes = opts.maxNodes ?? 24;
  const exemplars = opts.exemplars ?? [];
  const genErrors: string[] = [];

  const filled = new Map<string, StoryNode>();
  const incoming = new Map<string, { from: string; via: string }[]>();
  const queued = new Set<string>([startId]);
  const queue: string[] = [startId];

  while (queue.length) {
    const id = queue.shift()!;
    if (filled.has(id)) continue;
    if (filled.size >= maxNodes) {
      genErrors.push(`node budget exceeded (${maxNodes}) — stopped before filling "${id}"`);
      break;
    }
    const slot: SlotSpec = {
      id,
      isStart: id === startId,
      incoming: incoming.get(id) ?? [],
      guidance: endingGuidance(bible, id),
    };
    const prompt = buildNodePrompt(bible, summarize(filled), slot, exemplars);

    let node: StoryNode | undefined;
    try {
      node = coerceNode(await lm(prompt), id);
    } catch (e) {
      genErrors.push(`slot "${id}": ${(e as Error).message}`);
      continue;
    }
    filled.set(id, node);

    // Discover downstream slots from this node's edges.
    for (const { via, nextId } of outEdges(node)) {
      if (nextId === null) continue;
      const list = incoming.get(nextId) ?? [];
      list.push({ from: id, via });
      incoming.set(nextId, list);
      if (!filled.has(nextId) && !queued.has(nextId)) {
        queued.add(nextId);
        queue.push(nextId);
      }
    }
  }

  const pack: StoryPack = {
    id: bible.id,
    title: bible.title,
    genre: bible.genre,
    meterLabels: bible.meterTheming,
    startNodeId: startId,
    initialState: opts.initialState ?? DEFAULT_STATE,
    nodes: [...filled.values()],
  };
  return { pack, report: validatePack(pack), genErrors };
}

// --------------------------------------------------------------------------- helpers

/** Parse the LM output into a node, force its id, and shape-guard the essentials. */
function coerceNode(raw: string, id: string): StoryNode {
  const json = extractJson(raw);
  const obj = JSON.parse(json) as Record<string, unknown>;
  if (obj.type !== "action" && obj.type !== "dialogue") {
    throw new Error(`missing/invalid type ${JSON.stringify(obj.type)}`);
  }
  obj.id = id; // the slot owns the id; never trust the LM to echo it
  return obj as unknown as StoryNode;
}

/** Tolerate a stray markdown fence or leading prose around the JSON object. */
function extractJson(raw: string): string {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s === -1 || e === -1 || e < s) throw new Error("no JSON object in LM output");
  return raw.slice(s, e + 1);
}

function outEdges(node: StoryNode): { via: string; nextId: string | null }[] {
  const out: { via: string; nextId: string | null }[] = [];
  const carriers =
    node.type === "action"
      ? node.choices.map((c) => ({ via: c.id, edges: c.edges }))
      : node.stances.map((s) => ({ via: s.id, edges: s.edges }));
  for (const c of carriers) {
    for (const edge of c.edges ?? []) out.push({ via: c.via, nextId: edge?.nextId ?? null });
  }
  return out;
}

/** Compact running summary of filled nodes — the only backward context the LM sees. */
function summarize(filled: Map<string, StoryNode>): string {
  if (!filled.size) return "";
  return [...filled.values()]
    .map((n) => {
      const first = n.textVariants?.[0]?.text ?? "";
      const snippet = first.length > 90 ? first.slice(0, 90) + "…" : first;
      const outs = outEdges(n).map((e) => `${e.via}->${e.nextId ?? "END"}`).join(", ");
      return `- ${n.id} (${n.type}): "${snippet}" [${outs}]`;
    })
    .join("\n");
}

function endingGuidance(bible: StoryBible, id: string): string | undefined {
  const e = bible.endings.find((x) => x.id === id || id.includes(x.id));
  return e ? `If this node is an ending, aim for "${e.label}": ${e.summary}` : undefined;
}

export type { Role };
export { ROLES };
