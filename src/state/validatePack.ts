import {
  Band,
  BandCondition,
  Role,
  ROLES,
  StoryPack,
  TextVariant,
} from "./storyTypes";

/**
 * Plan 4 Task 1 — the pack validator that gates every story pack (authored or
 * generated) before it ships. Pure and dependency-free: takes an unknown value
 * (e.g. freshly parsed JSON) and returns a structured verdict rather than
 * throwing, so callers (CI, the loader, the authoring pipeline) can decide how
 * to react.
 *
 * errors  = the pack is broken and must not ship (bad shape, dangling edge,
 *           unreachable-from-start ending, out-of-range meters, ...).
 * warnings = the pack loads and plays but something is probably an authoring
 *           mistake (unreachable node, an edge list with no unconditional
 *           fallback that can strand the player, ...).
 * ok = errors.length === 0.
 */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_BANDS: Band[] = ["low", "mid", "high"];

export function validatePack(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  if (!isObject(input)) {
    return { ok: false, errors: ["pack is not an object"], warnings };
  }
  const pack = input as Partial<StoryPack> & Record<string, unknown>;

  // ---- top-level scalars ---------------------------------------------------
  for (const f of ["id", "title", "genre", "startNodeId"] as const) {
    if (typeof pack[f] !== "string" || !(pack[f] as string).length) {
      err(`pack.${f} must be a non-empty string`);
    }
  }

  // ---- meterLabels: every role present, value string|null ------------------
  if (!isObject(pack.meterLabels)) {
    err("pack.meterLabels must be an object keyed by role");
  } else {
    for (const r of ROLES) {
      if (!(r in pack.meterLabels)) err(`meterLabels missing role ${r}`);
      else {
        const v = (pack.meterLabels as Record<string, unknown>)[r];
        if (v !== null && typeof v !== "string") {
          err(`meterLabels.${r} must be a string or null`);
        }
      }
    }
  }

  // ---- initialState: every role present, number in [0,100] -----------------
  if (!isObject(pack.initialState)) {
    err("pack.initialState must be an object keyed by role");
  } else {
    for (const r of ROLES) {
      const v = (pack.initialState as Record<string, unknown>)[r];
      if (typeof v !== "number" || Number.isNaN(v)) {
        err(`initialState.${r} must be a number`);
      } else if (v < 0 || v > 100) {
        err(`initialState.${r} = ${v} is out of range [0,100]`);
      }
    }
  }

  // ---- nodes ---------------------------------------------------------------
  if (!Array.isArray(pack.nodes) || pack.nodes.length === 0) {
    err("pack.nodes must be a non-empty array");
    // Nothing more we can check meaningfully without nodes.
    return finalize(errors, warnings);
  }

  const ids = new Set<string>();
  for (const node of pack.nodes as unknown[]) {
    if (!isObject(node) || typeof node.id !== "string" || !node.id.length) {
      err("every node needs a non-empty string id");
      continue;
    }
    if (ids.has(node.id)) err(`duplicate node id "${node.id}"`);
    ids.add(node.id);
  }

  // collects (fromNodeId, edge) so graph checks can run after the shape pass
  const edgeTargets: { from: string; nextId: string | null }[] = [];

  for (const raw of pack.nodes as unknown[]) {
    if (!isObject(raw) || typeof raw.id !== "string") continue;
    const node = raw as Record<string, unknown> & { id: string };
    const at = `node "${node.id}"`;

    // textVariants
    if (!Array.isArray(node.textVariants) || node.textVariants.length === 0) {
      err(`${at}: textVariants must be a non-empty array`);
    } else {
      node.textVariants.forEach((v, i) =>
        checkTextVariant(v, `${at}.textVariants[${i}]`, err, ids),
      );
    }

    if (node.type === "action") {
      if (!Array.isArray(node.choices) || node.choices.length === 0) {
        err(`${at}: action node must have a non-empty choices array`);
      } else {
        node.choices.forEach((c, i) => {
          const cat = `${at}.choices[${i}]`;
          if (!isObject(c) || typeof c.id !== "string" || !c.id.length) {
            err(`${cat}: choice needs a non-empty string id`);
          }
          if (isObject(c) && (typeof c.text !== "string" || !c.text.length)) {
            err(`${cat}: choice needs non-empty text`);
          }
          checkEdges(isObject(c) ? c.edges : undefined, cat, node.id, edgeTargets, err, warn);
        });
      }
    } else if (node.type === "dialogue") {
      const stanceIds = new Set<string>();
      if (!Array.isArray(node.stances) || node.stances.length === 0) {
        err(`${at}: dialogue node must have a non-empty stances array`);
      } else {
        node.stances.forEach((s, i) => {
          const sat = `${at}.stances[${i}]`;
          if (!isObject(s) || typeof s.id !== "string" || !s.id.length) {
            err(`${sat}: stance needs a non-empty string id`);
          } else {
            stanceIds.add(s.id);
          }
          if (isObject(s)) {
            if (!Array.isArray(s.anchorPhrasings) || s.anchorPhrasings.length === 0 ||
                !s.anchorPhrasings.every((p) => typeof p === "string" && p.length)) {
              err(`${sat}: anchorPhrasings must be a non-empty array of non-empty strings`);
            }
            if (typeof s.npcResponse !== "string" || !s.npcResponse.length) {
              err(`${sat}: npcResponse must be a non-empty string`);
            }
            checkEdges(s.edges, sat, node.id, edgeTargets, err, warn);
          }
        });
      }
      // fallbackStanceId must reference a stance in THIS node
      if (typeof node.fallbackStanceId !== "string" || !node.fallbackStanceId.length) {
        err(`${at}: dialogue node needs a fallbackStanceId`);
      } else if (stanceIds.size && !stanceIds.has(node.fallbackStanceId)) {
        err(`${at}: fallbackStanceId "${node.fallbackStanceId}" is not one of its stances`);
      }
    } else {
      err(`${at}: type must be "action" or "dialogue" (got ${JSON.stringify(node.type)})`);
    }
  }

  // ---- graph integrity -----------------------------------------------------
  const startId = pack.startNodeId;
  if (typeof startId === "string" && startId.length && !ids.has(startId)) {
    err(`startNodeId "${startId}" is not a node in the pack`);
  }
  for (const { from, nextId } of edgeTargets) {
    if (nextId !== null && !ids.has(nextId)) {
      err(`node "${from}" has an edge to unknown node "${nextId}"`);
    }
  }

  // ---- reachability + at-least-one-ending ----------------------------------
  if (typeof startId === "string" && ids.has(startId)) {
    const adj = buildAdjacency(pack.nodes as unknown[]);
    const reachable = bfs(startId, adj);
    for (const id of ids) {
      if (!reachable.has(id)) warn(`node "${id}" is unreachable from startNodeId`);
    }
    const hasReachableEnding = edgeTargets.some(
      (e) => e.nextId === null && reachable.has(e.from),
    );
    if (!hasReachableEnding) {
      err("no reachable ending: no edge with nextId:null is reachable from start");
    }
  }

  return finalize(errors, warnings);
}

// --------------------------------------------------------------------------- helpers

function finalize(errors: string[], warnings: string[]): ValidationResult {
  return { ok: errors.length === 0, errors, warnings };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkTextVariant(
  v: unknown,
  at: string,
  err: (m: string) => void,
  nodeIds: Set<string>,
): void {
  if (!isObject(v)) return err(`${at} must be an object`);
  if (typeof v.text !== "string" || !v.text.length) err(`${at}.text must be a non-empty string`);
  if (v.when !== undefined) checkBandCondition(v.when, `${at}.when`, err);
  if (v.recallWhen !== undefined) {
    if (typeof v.recallWhen !== "string" || !v.recallWhen.length) {
      err(`${at}.recallWhen must be a non-empty node id`);
    } else if (!nodeIds.has(v.recallWhen)) {
      err(`${at}.recallWhen references unknown node "${v.recallWhen}"`);
    }
  }
}

function checkBandCondition(when: unknown, at: string, err: (m: string) => void): void {
  if (!isObject(when)) return err(`${at} must be an object`);
  for (const [k, val] of Object.entries(when)) {
    if (!ROLES.includes(k as Role)) err(`${at} has unknown role "${k}"`);
    if (!VALID_BANDS.includes(val as Band)) err(`${at}.${k} must be low|mid|high (got ${JSON.stringify(val)})`);
  }
}

function checkEdges(
  edges: unknown,
  at: string,
  fromNodeId: string,
  sink: { from: string; nextId: string | null }[],
  err: (m: string) => void,
  warn: (m: string) => void,
): void {
  if (!Array.isArray(edges) || edges.length === 0) {
    return err(`${at}: edges must be a non-empty array`);
  }
  let hasFallback = false;
  edges.forEach((e, i) => {
    const eat = `${at}.edges[${i}]`;
    if (!isObject(e)) return err(`${eat} must be an object`);
    if (!("nextId" in e) || (typeof e.nextId !== "string" && e.nextId !== null)) {
      err(`${eat}.nextId must be a string or null`);
    } else {
      sink.push({ from: fromNodeId, nextId: e.nextId });
    }
    if (e.when === undefined) hasFallback = true;
    else checkBandCondition(e.when, `${eat}.when`, err);
  });
  // A band-gated edge list with no unconditional fallback can leave the player
  // with no matching edge in some meter states — playable but a likely mistake.
  if (!hasFallback) warn(`${at}: no unconditional fallback edge — player may hit a dead end in some meter bands`);
}

function buildAdjacency(nodes: unknown[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const raw of nodes) {
    if (!isObject(raw) || typeof raw.id !== "string") continue;
    const outs: string[] = [];
    const collect = (edges: unknown) => {
      if (!Array.isArray(edges)) return;
      for (const e of edges) {
        if (isObject(e) && typeof e.nextId === "string") outs.push(e.nextId);
      }
    };
    if (raw.type === "action" && Array.isArray(raw.choices)) {
      for (const c of raw.choices) if (isObject(c)) collect(c.edges);
    } else if (raw.type === "dialogue" && Array.isArray(raw.stances)) {
      for (const s of raw.stances) if (isObject(s)) collect(s.edges);
    }
    adj.set(raw.id, outs);
  }
  return adj;
}

function bfs(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// Re-export for callers that want the type alongside the fn.
export type { BandCondition, TextVariant };
