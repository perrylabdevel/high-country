#!/usr/bin/env node
/**
 * Control plane CLI for the High Country autonomous evolution loop.
 *
 *   node scripts/loop.mjs init            # create the state stores
 *   node scripts/loop.mjs status          # current state, backlog, budgets
 *   node scripts/loop.mjs dry-run         # inspect + rank candidates, no writes
 *   node scripts/loop.mjs check-store     # validate requirements.json schema
 *   node scripts/loop.mjs evidence add --kind probe --summary "..." [--path p] [--durable false]
 *   node scripts/loop.mjs campaign select          # pick next requirement
 *   node scripts/loop.mjs campaign note --stage <s> --text "..." [--builder id]
 *   node scripts/loop.mjs campaign verify  --verifier id --verdict accept|reject --note "..."
 *   node scripts/loop.mjs campaign close --outcome accepted|reverted|deferred|escalated
 *   node scripts/loop.mjs campaign next            # select after closing current
 *   node scripts/loop.mjs report                   # compact operational report
 *   node scripts/loop.mjs resume                   # exact resumption state
 *
 * The CLI is the durable memory and the guardrails; an agent harness is the
 * executor. See docs/EVOLUTION.md.
 */
import { existsSync, mkdirSync } from "node:fs";
import {
  STATE, decide, readDecisions, readJson, writeJson, requirements,
  validateRequirements, sealIds, rank, campaign, writeCampaign, evidence,
  addEvidence, BUDGET, CAMPAIGN_STAGES, STATUSES
} from "./loop/lib.mjs";

const CLOSED = ["accepted", "reverted", "deferred", "escalated"];

function arg(name, argv) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function brief(r) {
  return `${r.id} [${r.status}] P${r.priority} conf=${r.confidence} cost=${r.cost} — ${r.title}`;
}

function printBrief(r, c) {
  console.log(`campaign ${c.id}`);
  console.log(`  requirement: ${brief(r)}`);
  console.log(`  stage: ${c.stage} · rounds ${c.rounds}/${c.budget.maxRounds}`);
  console.log("  acceptance:");
  r.acceptance.forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
  console.log(`  verification: ${r.verification.join("; ")}`);
  console.log(`  files: ${r.files.join(", ")}`);
}

function checkStore() {
  const store = readJson(STATE("requirements.json"), { requirements: [] });
  const errs = validateRequirements(store);
  if (errs.length) {
    for (const e of errs) {
      console.error(`✗ ${e}`);
    }
    process.exit(1);
  }
  sealIds();
}

function cmdInit() {
  for (const f of ["requirements.json", "roles.json"]) {
    if (!existsSync(STATE(f))) {
      throw new Error(`state/${f} missing — it is committed with the loop; refusing to invent one`);
    }
  }
  mkdirSync(STATE(""), { recursive: true });
  if (!existsSync(STATE("decisions.jsonl"))) {
    writeJson(STATE("decisions.jsonl"), "");
  }
  if (!existsSync(STATE("evidence.json"))) {
    writeJson(STATE("evidence.json"), []);
  }
  if (!existsSync(STATE("campaign.json"))) {
    writeJson(STATE("campaign.json"), null);
  }
  const ids = sealIds();
  const dec = readDecisions();
  if (!dec.some((d) => d.action === "init")) {
    decide({
      action: "init",
      subject: "state/",
      summary: `Loop stores initialised; ${ids.length} requirement ids sealed as append-only.`
    });
  }
  console.log(`loop ready · ${ids.length} requirement ids sealed`);
}

function cmdSelect(argv) {
  checkStore();
  const current = campaign();
  if (current && !CLOSED.includes(current.stage)) {
    console.error(`campaign ${current.id} on ${current.requirementId} is still ${current.stage}; close it first (campaign next)`);
    process.exit(1);
  }
  const ranked = rank();
  if (!ranked.length) {
    console.log("no eligible requirements: all verified, blocked, or deferred");
    process.exit(2);
  }
  const r = ranked[0];
  if (argv.includes("--dry")) {
    console.log(`would select ${r.id}: ${r.title}`);
    return;
  }
  const c = {
    id: new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + r.id,
    requirementId: r.id,
    stage: "selected",
    startedAt: new Date().toISOString(),
    rounds: 0,
    builder: null,
    verifier: null,
    budget: BUDGET,
    notes: [],
    evidence: [],
    outcome: null
  };
  writeCampaign(c);
  decide({
    action: "select",
    actor: "director",
    subject: r.id,
    summary: `Campaign ${c.id} selected ${r.id} (${r.title}). Ranked over ${ranked.length} eligible.`
  });
  printBrief(r, c);
}

function cmdNote(argv) {
  const c = campaign();
  if (!c) {
    console.error("no active campaign");
    process.exit(1);
  }
  const iv = arg("--text", argv);
  if (!iv) {
    throw new Error("--text required");
  }
  const stage = arg("--stage", argv);
  if (stage && !CAMPAIGN_STAGES.includes(stage)) {
    throw new Error(`--stage must be one of ${CAMPAIGN_STAGES.join("|")}`);
  }
  c.notes.push({ ts: new Date().toISOString(), stage: stage || c.stage, text: iv });
  if (stage) {
    c.stage = stage;
  }
  const builder = arg("--builder", argv);
  if (builder) {
    c.builder = builder;
  }
  c.rounds += 1;
  if (c.rounds > c.budget.maxRounds) {
    console.error(`budget: campaign has used ${c.rounds - 1} prior rounds + this one, over the max of ${c.budget.maxRounds}; stop repairing — defer or escalate`);
    process.exit(1);
  }
  writeCampaign(c);
  console.log(`noted · stage=${c.stage} rounds=${c.rounds}/${c.budget.maxRounds}`);
}

function cmdVerify(argv) {
  const c = campaign();
  if (!c) {
    console.error("no active campaign");
    process.exit(1);
  }
  const verifier = arg("--verifier", argv);
  const verdict = arg("--verdict", argv);
  const note = arg("--note", argv) || "";
  const evId = arg("--evidence", argv);
  if (!verifier || !verdict) {
    throw new Error('campaign verify --verifier <role/model> --verdict accept|reject --note "..." [--evidence E#]');
  }
  if (!["accept", "reject"].includes(verdict)) {
    throw new Error("--verdict must be accept|reject");
  }
  if (c.builder && verifier === c.builder) {
    console.error("GUARD: the verifier must not be the builder of this work (P9).");
    process.exit(1);
  }
  c.verifier = verifier;
  c.stage = verdict === "accept" ? "accepted" : "verifying";
  c.evidence.push({ ts: new Date().toISOString(), verdict, verifier, note });
  writeCampaign(c);
  decide({
    action: "verify",
    actor: verifier,
    subject: c.requirementId,
    summary: `${verdict}: ${note}`,
    evidence: evId ? [evId] : []
  });
  console.log(`${verdict} recorded from ${verifier}`);
}

function cmdClose(argv) {
  const c = campaign();
  if (!c) {
    console.error("no active campaign");
    process.exit(1);
  }
  const outcome = arg("--outcome", argv);
  if (!CLOSED.includes(outcome)) {
    throw new Error("--outcome accepted|reverted|deferred|escalated");
  }
  const note = arg("--note", argv) || outcome;
  c.stage = outcome;
  c.outcome = note;
  writeCampaign(c);

  const store = readJson(STATE("requirements.json"), { requirements: [] });
  const r = store.requirements.find((x) => x.id === c.requirementId);
  if (r) {
    if (outcome === "accepted") {
      r.status = "verified";
      r.history.push({ date: new Date().toISOString(), action: "verified", note: `${c.id}: ${note}` });
    } else if (outcome === "reverted") {
      r.status = "accepted";
      r.attempts.push({ approach: c.id, outcome: `reverted: ${note}` });
    } else if (outcome === "deferred") {
      r.status = "deferred";
      r.attempts.push({ approach: c.id, outcome: `deferred: ${note}` });
    } else {
      r.attempts.push({ approach: c.id, outcome: `escalated: ${note}` });
    }
  }
  const errs = validateRequirements(store);
  if (errs.length) {
    console.error(errs.join("\n"));
    process.exit(1);
  }
  writeJson(STATE("requirements.json"), store);
  decide({
    action: "campaign-close",
    actor: arg("--actor", argv) || "director",
    subject: c.requirementId,
    summary: `${c.id} closed ${outcome}. ${note}`
  });
  console.log(`campaign ${c.id} closed: ${outcome}`);
}

function cmdEvidence(argv) {
  const sub = argv[0];
  if (sub !== "add") {
    throw new Error("evidence add --kind <k> --summary \"...\" [--path p] [--durable false]");
  }
  const kind = arg("--kind", argv);
  const summary = arg("--summary", argv);
  if (!kind || !summary) {
    throw new Error("evidence add needs --kind and --summary");
  }
  const rec = addEvidence({
    kind,
    path: arg("--path", argv),
    summary,
    durable: arg("--durable", argv) !== "false"
  });
  console.log(`${rec.id} recorded: ${rec.summary}`);
}

function cmdStatus() {
  checkStore();
  const all = requirements();
  const ranked = rank();
  const c = campaign();
  console.log("== Campaign ==");
  if (c && !CLOSED.includes(c.stage)) {
    console.log(`${c.id} · ${c.requirementId} · stage=${c.stage} · rounds=${c.rounds}/${c.budget.maxRounds}`);
    if (c.verifier) {
      console.log(`  last verify: ${c.verifier} → ${c.evidence[c.evidence.length - 1].verdict}`);
    }
  } else {
    console.log(c ? `last campaign ${c.id} closed ${c.stage}` : "none yet");
  }
  console.log("\n== Backlog (eligible, ranked) ==");
  ranked.forEach((r) => console.log(`  ${brief(r)}`));
  const eligibleIds = new Set(ranked.map((r) => r.id));
  const blocked = all.filter((r) => ["proposed", "accepted", "active"].includes(r.status) && !eligibleIds.has(r.id));
  if (blocked.length) {
    console.log("\n== Blocked (deps unmet or non-eligible status) ==");
    blocked.forEach((r) => console.log(`  ${brief(r)} deps=[${r.deps.join(",")}]`));
  }
  const done = all.filter((r) => r.status === "verified");
  console.log(`\n== Verified == \n  ${done.map((r) => r.id).join(", ") || "(none yet)"}`);
  const deferred = all.filter((r) => r.status === "deferred");
  if (deferred.length) {
    console.log("== Deferred ==");
    deferred.forEach((r) => console.log(`  ${brief(r)}`));
  }
}

function cmdReport() {
  checkStore();
  const all = requirements();
  const c = campaign();
  const dec = readDecisions();
  const ev = evidence();
  console.log("== Operational report ==");
  console.log(`requirements: ${all.length} total · ` + STATUSES.map((s) => `${s}:${all.filter((r) => r.status === s).length}`).join(" · "));
  console.log(`campaigns recorded: ${new Set(dec.filter((d) => d.action === "select").map((d) => d.subject)).size} selected · ${dec.filter((d) => d.action === "campaign-close").length} closed`);
  console.log(`decisions: ${dec.length} · evidence records: ${ev.length}`);
  if (c) {
    console.log(`current: ${c.id} · ${c.requirementId} · ${c.stage} · rounds ${c.rounds}/${c.budget.maxRounds}`);
  }
  const blockers = all.filter((r) => r.status === "deferred" || r.attempts.some((a) => String(a.outcome).includes("escalated")));
  if (blockers.length) {
    console.log("open deferrals/escalations:");
    blockers.forEach((r) => console.log(`  ${r.id}: ${r.title} — ${r.attempts.length} attempts`));
  }
}

function cmdResume() {
  const c = campaign();
  if (c && !CLOSED.includes(c.stage)) {
    const r = loadReq(c.requirementId);
    printBrief(r, c);
    console.log(`resume: node scripts/loop.mjs campaign note --stage <stage> --text "..." (rounds used: ${c.rounds})`);
  } else {
    console.log("no open campaign. resume with:");
    console.log("  node scripts/loop.mjs campaign select");
    console.log("  node scripts/loop.mjs status");
  }
}

const [, , cmd, ...rest] = process.argv;
const commands = {
  init: () => cmdInit(),
  status: () => cmdStatus(),
  "dry-run": () => cmdStatus(),
  report: () => cmdReport(),
  resume: () => cmdResume(),
  "check-store": () => {
    checkStore();
  },
  campaign: () => {
    const sub = rest[0];
    if (sub === "select") {
      return cmdSelect(rest);
    }
    if (sub === "note") {
      return cmdNote(rest);
    }
    if (sub === "verify") {
      return cmdVerify(rest);
    }
    if (sub === "close") {
      return cmdClose(rest);
    }
    if (sub === "next") {
      // close (if still open) then select the next-ranked requirement.
      const c = campaign();
      if (c && !CLOSED.includes(c.stage)) {
        return cmdClose(rest);
      }
      return cmdSelect(rest.filter((a) => a !== "next"));
    }
    throw new Error("campaign subcommand: select|note|verify|close|next");
  },
  evidence: () => cmdEvidence(rest)
};

if (!commands[cmd]) {
  console.error(`unknown command ${cmd}. See header of scripts/loop.mjs.`);
  process.exit(1);
}
commands[cmd]();