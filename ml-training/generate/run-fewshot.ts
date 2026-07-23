/**
 * Plan 4 Task 4 — few-shot generation dry-run (the go/no-go gate for Part B).
 *
 * Cheapest first pass per spec §4.3: instead of spinning up a GPU, we drive the
 * Task-3 harness with a *few-shot-quality* LM callback — here, the authored
 * `exemplars.jsonl` nodes replayed by slot id, standing in for what a real
 * few-shot Qwen2.5-3B would emit against the same prompts. This validates the
 * PROMPT + HARNESS + SCHEMA pipeline end to end and produces a candidate pack.
 *
 * To run the real model instead, replace `cannedLM` with a callback that sends
 * `prompt` to Qwen2.5-3B-Instruct (Kaggle/HF) and returns its text — nothing
 * else changes.
 *
 *   npx tsx ml-training/generate/run-fewshot.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { generatePack, LM } from "./harness";
import { StoryBible } from "../../src/state/bibleTypes";

const here = dirname(fileURLToPath(import.meta.url));
const bible: StoryBible = JSON.parse(
  readFileSync(resolve(here, "../bibles/seventh-guest.bible.json"), "utf8"),
);

// Index the exemplar completions by the node id they emit.
const byId = new Map<string, string>();
for (const line of readFileSync(resolve(here, "exemplars.jsonl"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t) continue;
  const { completion } = JSON.parse(t) as { completion: string };
  const id = (JSON.parse(completion) as { id: string }).id;
  byId.set(id, completion);
}

// Few-shot-quality stand-in: return the exemplar node for the requested slot.
const cannedLM: LM = async (prompt) => {
  const id = /Target node id: "([^"]+)"/.exec(prompt)![1];
  const c = byId.get(id);
  if (!c) throw new Error(`no exemplar node for slot "${id}"`);
  return c;
};

const { pack, report, genErrors } = await generatePack(bible, cannedLM, { startId: "start" });

const outDir = resolve(here, "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "seventh-guest.candidate.json"), JSON.stringify(pack, null, 2) + "\n");

const total = pack.nodes.length;
const failedSlots = genErrors.length;
console.log(`nodes generated : ${total}`);
console.log(`gen errors      : ${failedSlots}`);
console.log(`validator ok    : ${report.ok}`);
console.log(`validator errors: ${report.errors.length ? "\n  - " + report.errors.join("\n  - ") : "none"}`);
console.log(`validator warns : ${report.warnings.length ? "\n  - " + report.warnings.join("\n  - ") : "none"}`);
const passRate = total ? Math.round(((total - failedSlots) / total) * 100) : 0;
console.log(`slot pass-rate  : ${passRate}%`);
console.log(`DECISION        : ${report.ok && passRate >= 80 ? "few-shot SUFFICIENT — skip Part B (QLoRA)" : "few-shot INADEQUATE — proceed to Part B"}`);
