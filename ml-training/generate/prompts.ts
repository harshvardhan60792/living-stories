import { StoryBible } from "../../src/state/bibleTypes";

/**
 * Plan 4 Task 3 — node-by-node prompt builder. Spec §6 mandates the model fills
 * ONE bounded slot at a time, grounded only in a compact bible digest + a
 * running summary of already-generated nodes, never the whole tree.
 */
export interface SlotSpec {
  id: string; // the node id to emit
  incoming: { from: string; via: string }[]; // edges already pointing here
  typeHint?: "action" | "dialogue"; // author steer; LM may still choose
  isStart?: boolean;
  guidance?: string; // one-line beat, e.g. an ending's summary
}

export interface Exemplar {
  prompt: string;
  completion: string;
}

const BOUNDS = [
  'type must be "action" or "dialogue".',
  "action nodes: 3-6 choices, each { id, text, toneTag?, edges } — prefer richer branching over binary choices.",
  "dialogue nodes: 2-4 stances { id, anchorPhrasings[], npcResponse, toneTag?, edges } + a fallbackStanceId naming one of them.",
  "every node: non-empty textVariants[] ({ text, when? }); prose 120-200 words max, in the bible's voice.",
  "edges: [{ when?: {ROLE:'low'|'mid'|'high'}, nextId }]; nextId is another node id or null (an ending). Always include one edge with no `when` as a fallback.",
  "toneTag (optional) must be one of: empathetic, aggressive, deceptive, reassuring, defiant, cold, submissive, curious, threatening, apologetic, dismissive, sincere, evasive, calm.",
  "when-conditions use only these roles: RAPPORT, VOLATILITY, PRESSURE, INSIGHT.",
].map((s) => `- ${s}`).join("\n");

function bibleDigest(b: StoryBible): string {
  const chars = b.characters.map((c) => `${c.name} (${c.role}) — ${c.voice}`).join("; ");
  const meters = Object.entries(b.meterTheming)
    .map(([r, l]) => `${r}=${l ?? "(hidden)"}`)
    .join(", ");
  const endings = b.endings.map((e) => `${e.id}: ${e.label} — ${e.summary}`).join("\n  ");
  return [
    `TITLE: ${b.title}  GENRE: ${b.genre}`,
    `PREMISE: ${b.premise}`,
    `THE TRUTH (hidden, reveal gradually): ${b.theTruth}`,
    `TONE: ${b.tone}`,
    `CHARACTERS: ${chars}`,
    `METERS: ${meters}`,
    `NODE BUDGET: depth ${b.nodeBudget.minDepth}-${b.nodeBudget.maxDepth}`,
    `ENDINGS (each reached by a choice/stance edge with nextId:null, tagged with an \`ending\` label):\n  ${endings}`,
  ].join("\n");
}

/** Build the grounded per-node prompt. `exemplars` are 2-3 shape demonstrations. */
export function buildNodePrompt(
  bible: StoryBible,
  stateSummary: string,
  slot: SlotSpec,
  exemplars: Exemplar[] = [],
): string {
  const incoming = slot.incoming.length
    ? slot.incoming.map((e) => `from "${e.from}" via ${e.via}`).join("; ")
    : slot.isStart
    ? "(this is the START node)"
    : "(no incoming edges recorded yet)";
  const ex = exemplars
    .map((e, i) => `--- EXEMPLAR ${i + 1} ---\nPROMPT: ${e.prompt}\nNODE JSON: ${e.completion}`)
    .join("\n");

  return [
    "You author ONE node of a branching interactive-fiction story as strict JSON.",
    "Return ONLY the JSON object for this single node — no prose, no markdown fence.",
    "",
    "=== STORY BIBLE ===",
    bibleDigest(bible),
    "",
    "=== STORY SO FAR (already-generated nodes) ===",
    stateSummary || "(none yet — you are writing the first node)",
    "",
    "=== TARGET NODE ===",
    `Target node id: "${slot.id}"  (use exactly this id)`,
    `Type hint: ${slot.typeHint ?? "(you choose action or dialogue)"}`,
    `Incoming: ${incoming}`,
    slot.isStart ? `Open on: ${bible.startSituation}` : "",
    slot.guidance ? `Beat guidance: ${slot.guidance}` : "",
    "",
    "=== SCHEMA BOUNDS (hard) ===",
    BOUNDS,
    "",
    exemplars.length ? "=== EXEMPLARS ===\n" + ex + "\n" : "",
    'Now emit the JSON node for id "' + slot.id + '".',
  ]
    .filter(Boolean)
    .join("\n");
}
