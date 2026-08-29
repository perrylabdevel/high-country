/**
 * Living-requirements state for the autonomous evolution loop.
 *
 * Thin on purpose: the stores are version-controlled JSON/JSONL under state/,
 * and this module only reads, validates, ranks, and appends. The agent harness
 * that runs the loop is the executor; this file is the durable memory.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const STATE = (p) => path.join(ROOT, "state", p);

export const STATUSES = ["proposed", "accepted", "active", "verified", "rejected", "deferred", "retired"];
export const COSTS = ["S", "M", "L"];
export const CAMPAIGN_STAGES = [
  "selected", "planned", "implementing", "verifying",
  "accepted", "reverted", "deferred", "escalated"
];

export function readJson(file, fallback) {
  if (!existsSync(file)) {
    return fallback;
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/** Append one decision to the append-only log. Returns the record. */
export function decide({ action, actor = "harness", subject, summary, evidence = [] }) {
  const file = STATE("decisions.jsonl");
  const record = {
    ts: new Date().toISOString(),
    action,
    actor,
    subject,
    summary,
    evidence
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, readFileSync(file, "utf8") + JSON.stringify(record) + "\n");
  return record;
}

export function readDecisions() {
  const file = STATE("decisions.jsonl");
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function requirements() {
  return readJson(STATE("requirements.json"), { requirements: [] }).requirements;
}

/** Schema-validate the requirements store. Throws with a readable message. */
export function validateRequirements(store) {
  const errs = [];
  const seen = new Set();
  for (const r of store.requirements) {
    const tag = r.id || "(missing id)";
    if (!/^R\d+$/.test(r.id || "")) {
      errs.push(`${tag}: id must match /^R\\d+$/`);
    }
    if (seen.has(r.id)) {
      errs.push(`${tag}: duplicate id`);
    }
    seen.add(r.id);
    for (const f of ["title", "status", "playerExperience", "source"]) {
      if (typeof r[f] !== "string" || !r[f]) {
        errs.push(`${tag}: missing string field ${f}`);
      }
    }
    if (!STATUSES.includes(r.status)) {
      errs.push(`${tag}: bad status ${r.status}`);
    }
    if (typeof r.locked !== "boolean") {
      errs.push(`${tag}: locked must be boolean`);
    }
    if (!Number.isInteger(r.priority) || r.priority < 1 || r.priority > 5) {
      errs.push(`${tag}: priority must be 1..5`);
    }
    if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) {
      errs.push(`${tag}: confidence must be 0..1`);
    }
    if (!COSTS.includes(r.cost)) {
      errs.push(`${tag}: cost must be S/M/L`);
    }
    for (const f of ["risk"]) {
      if (typeof r[f] !== "string" || r[f].length > 1) {
        errs.push(`${tag}: risk must be a single-letter severity`);
      }
    }
    for (const f of ["acceptance", "verification", "history", "evidenceRefs", "files", "deps", "attempts"]) {
      if (!Array.isArray(r[f])) {
        errs.push(`${tag}: ${f} must be an array`);
      }
    }
    if (r.acceptance.length === 0) {
      errs.push(`${tag}: acceptance conditions required`);
    }
    if (r.verification.length === 0) {
      errs.push(`${tag}: verification methods required`);
    }
    if (r.history.length === 0) {
      errs.push(`${tag}: creation history required`);
    }
  }
  // Ids are append-only: a store that drops a previously known id rewrote history.
  const idFile = STATE("known-ids.json");
  const known = readJson(idFile, null);
  if (known && known.ids && Array.isArray(known.ids)) {
    for (const id of known.ids) {
      if (!seen.has(id)) {
        errs.push(`requirement ${id} existed before and was silently deleted (retire it instead)`);
      }
    }
    for (const r of store.requirements) {
      if (!known.ids.includes(r.id) && ["retired", "rejected"].includes(r.status) === false) {
        errs.push(`${r.id}: new id but store already has ids; ok only on first write`);
      }
    }
  }
  return errs;
}

/** Persist validation baseline: known ids live append-only across edits. */
export function sealIds() {
  const ids = requirements().map((r) => r.id);
  const idFile = STATE("known-ids.json");
  const known = readJson(idFile, { ids: [] });
  const merged = Array.from(new Set([...(known.ids || []), ...ids]));
  writeJson(idFile, { ids: merged });
  return merged;
}

const COST_RANK = { S: 1, M: 2, L: 3 };

/**
 * Rank candidate requirements for the next campaign.
 * Eligible: proposed/accepted/active, all deps verified.
 * Rank: priority asc, then confidence desc, then cost asc, then id.
 */
export function rank() {
  const all = requirements();
  const verified = new Set(all.filter((r) => r.status === "verified").map((r) => r.id));
  return all
    .filter((r) => ["proposed", "accepted", "active"].includes(r.status))
    .filter((r) => r.deps.every((d) => verified.has(d)))
    .map((r) => ({ r, score: [r.priority, -r.confidence, COST_RANK[r.cost] || 3, r.id] }))
    .sort((a, b) => {
      for (let i = 0; i < 4; i += 1) {
        if (a.score[i] !== b.score[i]) {
          return a.score[i] < b.score[i] ? -1 : 1;
        }
      }
      return 0;
    })
    .map((x) => x.r);
}

export function campaign() {
  return readJson(STATE("campaign.json"), null);
}

export function writeCampaign(c) {
  writeJson(STATE("campaign.json"), c);
}

export function evidence() {
  return readJson(STATE("evidence.json"), []);
}

export function addEvidence({ kind, path: p, summary, durable = true }) {
  const list = evidence();
  const id = `E${list.length + 1}`;
  let n = list.length;
  while (list.some((e) => e.id === id)) {
    n += 1;
  }
  const rec = { id: `E${n}`, date: new Date().toISOString(), kind, path: p || null, summary, durable };
  list.push(rec);
  writeJson(STATE("evidence.json"), list);
  return rec;
}

export const BUDGET = { maxRounds: 4, maxCalls: 30, maxMinutes: 120 };