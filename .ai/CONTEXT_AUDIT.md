# Context-flow audit — 2026-09-10

## Conclusion

The 5.6M-token failure was not one giant Astra prompt and was not explicit planner → developer → tester transcript forwarding. `hc-agent` launches a fresh `codex exec` for every role and transfers only structured role JSON. The dominant multiplier was the growing transcript *inside* each Codex role: every model request replayed all earlier model messages, command outputs, source dumps, skill text, logs, and test output from that role.

The mandatory historical HANDOFF made that replay materially worse. Experiment A used an older 25,103-byte HANDOFF; every role's first command emitted 28,748 bytes for REQUIREMENTS + HANDOFF + ROUTING. The current HANDOFF had grown to 46,426 bytes, so a new campaign would have started worse.

## Actual startup path

`~/.hc-agent/bin/hc-agent` → `src/cli.js` → `runCampaign()` → `runIteration()` → `invokeRole()` → `src/adapters/codex.js` → a fresh `codex exec --json`.

- Planner received its role prompt plus a path index.
- Developer received the current planner JSON only.
- Tester received planner JSON plus developer JSON only.
- Visual received the planner objective, tester visual notes, and up to eight screenshot attachments.
- In-memory campaign `history` was used for loop detection and totals, not inserted into prompts.
- Event JSONL, full transcripts, source files, logs, and screenshots were not automatically forwarded across roles. Agents pulled many of them into their own active role transcript with tools.

Codex automatically applies AGENTS instructions. Claude applies CLAUDE; Cursor's 796-byte rule was `alwaysApply`. The `.agents/skills/` and `.claude/skills/` trees are each 31,387 bytes, but full skill bodies are loaded selectively, not wholesale. Experiment A nevertheless shows redundant selected-skill reads.

The isolated HoH Codex home declared no MCP servers. Headroom observed two Codex additional-tool definitions and saved about 344 tokens/request by compacting their schemas. Large plugin/app catalogs found in local caches are stored metadata; there is no evidence that they were injected wholesale into these HoH calls. The harness now consistently uses an isolated Codex home, disables nested agents and automatic project-doc injection, embeds the current compact project instructions itself, and caps individual tool output at 4,000 tokens.

## Before: measured provider usage

These are actual per-request token records from the Codex rollouts for `20260910-visual-exp-a`:

| Role invocation | Backend requests | First | Second | Last | Aggregate input | Cached input |
|---|---:|---:|---:|---:|---:|---:|
| Iteration 1 planner | 6 | 15,756 | 27,054 | 52,504 | 217,468 | 163,840 |
| Iteration 1 developer | 43 | 17,184 | 28,886 | 83,912 | 2,967,932 | 2,876,544 |
| Iteration 1 tester | 43 | 17,625 | 27,920 | 57,445 | 2,171,588 | 2,107,776 |
| Iteration 1 visual | 3 | 15,848 | 25,896 | 27,058 | 68,802 | 41,344 |
| Iteration 2 planner | 5 | 15,987 | 27,251 | 48,474 | 168,518 | 119,552 |

Iteration 1 totaled **5,425,790** input tokens. Through the successful iteration-2 planner call, the campaign totaled **5,594,308**, of which **5,309,056 (94.9%)** was reported as cached. Iteration-2 developer consumed another 167,761 input tokens before failing, but its role telemetry was not committed. Iteration-3 planner hit the Plus limit before usable usage was recorded.

High cache hit rates therefore did not solve the usage problem. They show stable-prefix reuse within a role, while Codex's aggregate `input_tokens` still includes every replay. Headroom B2 likewise measured 377,740 raw → 363,550 sent across 11 planner requests: only 14,190 tokens / 3.76% overall savings. One tool result compressed well, but later growing requests still reached 55,070 tokens.

## Bootstrap budget

Token estimates use the conservative local planning ratio of four UTF-8 bytes/token; provider totals above are actual.

| Source | Before bytes | After bytes | Loading policy after |
|---|---:|---:|---|
| AGENTS.md | 2,299 | 2,466 | Embedded once by HoH; normal agents read it automatically |
| STATE.json | 1,099 | 1,342 | Mandatory |
| REQUIREMENTS.md | 1,229 | 1,325 | Mandatory |
| ROUTING.md | 3,031 | 4,023 | Mandatory |
| HANDOFF.md | 46,426 | 944 | Retrieval-only |
| Archived HANDOFF | 0 | 46,426 | Retrieval-only under `.ai/history/` |

The Codex mandatory project bootstrap fell from **52,985 bytes / ~13,247 tokens** to **9,156 bytes / ~2,289 tokens**, an **82.7% reduction**. HoH's rendered embedded bootstrap, including headings, is 9,218 bytes / ~2,305 tokens. The full 46,426-byte journal remains byte-for-byte available in history.

Other discovered material is not mandatory HoH bootstrap: CLAUDE.md is 1,832 bytes and applies to Claude; the always-on Cursor rule is 796 bytes and applies to Cursor; each platform's project skill bodies total 31,387 bytes but are loaded selectively. All top-level `.ai` files total 24,027 bytes, of which only STATE/REQUIREMENTS/ROUTING (6,690 bytes) are embedded alongside AGENTS. The remaining audit, decision, README, and HANDOFF material is retrieval-only.

The residual Codex platform envelope is larger than project text: the live first-role inputs exceeded the four-bytes/token prompt estimates by roughly 11K–14K tokens. `codex debug prompt-input` attributes that envelope to system/safety/environment instructions, available-skill/app catalogs, structured-output scaffolding, and tool schemas. The isolated HoH home has no configured MCP servers. Headroom observed two additional Codex tool definitions and saved only about 344 tokens/request by compacting them.

The recorded Astra review predated the final host-skill suppression flag and its rollout contained a 5,191-byte available-skills catalog, although it still made zero tool calls. A subsequent local `codex debug prompt-input` check with the final Expert flags showed an empty available-skills catalog and no app instructions. Expert mode now disables shell, unified exec, web/image, apps/plugins, multi-agent, and host skill discovery. Permission/environment and recommended-plugin wrapper text remain part of the Codex platform envelope; they are not project history or an MCP server list.

## After: measured and bounded role context

Deterministic packet construction against the same iteration-1 structured artifacts produced:

| Role | Model | Prompt bytes | Estimated prompt tokens | Actual first backend input probe |
|---|---|---:|---:|---:|
| First planner | Luna | 18,006 | 4,502 | **18,259** |
| Subsequent planner | Luna | 27,331 | 6,833 | **20,243** |
| Developer | Terra | 16,539 | 4,135 | **16,594** |
| Tester | Luna | 17,773 | 4,444 | **17,204** |
| Harness-generated Expert packet + instructions | Astra | 11,648 | 2,912 | packet construction only |
| Architecture review packet + instructions | Astra | 4,362 | 1,091 | **12,011** |

All five role probes completed in one backend request with zero tool calls. The developer/tester probes measured the first inference only in read-only packet mode; normal implementation and verification necessarily add tool turns. The fresh Astra call used 1,100 output tokens and no cached input. Its packet itself was 3,876 bytes / ~969 tokens; the larger 12,011 provider input includes Codex system, safety, environment, structured-output, and the then-present host skill catalog/schema overhead.

The new role budgets are one backend response for Planner/Visual/Expert, at most 11 for Developer, and at most 7 for Tester; their corresponding completed-tool allowances are 0/0/0, 10, and 6. The adapter streams Codex JSONL and also watches the authoritative rollout. It terminates on an over-budget tool start, on a backend request beyond the request budget, or when the final allowed backend response attempts another tool continuation. Budget exhaustion stops the campaign rather than silently starting Tester or another iteration. Stored tool output is capped at 4K tokens and Developer/Tester active context compacts at 32K. Telemetry records aggregate input even when a terminated CLI omits its final stdout usage event.

The installed Codex 0.153.4 CLI does not expose a supported pre-dispatch request-count setting; its documented rollout budget is tracking-oriented and rejected the tested nested CLI override. The wrapper therefore enforces the boundary from completed rollout records. This cannot cancel a request already in flight, but it prevents tool-driven continuation past the allowance and catches excess provider requests as soon as their usage record is written. A live Luna guard probe requested two tools with a one-request/ten-tool configuration: it was terminated after exactly one backend request and recorded 13,113 input tokens, including 9,984 cached.

Using the old trace's first 11 Developer requests and first 7 Tester requests as a deliberately conservative target envelope (before taking credit for output caps or 32K compaction) gives:

- first planner 18,259; later planner 20,243
- developer maximum-envelope trace prefix 546,158
- tester maximum-envelope trace prefix 260,300
- visual first-request proxy 15,848
- first iteration **840,565**; later iteration **842,549**
- representative three-iteration campaign **2,525,663**, down **84.5%** from the linear old-trace projection of 16,277,370

This is a bounded projection, not fabricated post-change campaign telemetry: the first-inference values and guard behavior are live measurements, while Developer/Tester multi-turn values deliberately reuse the old trace prefixes. The real total should be lower when output caps and compaction engage, but only a representative live campaign can establish that. No game campaign was launched during this audit because it would perform unrelated source edits and timing-sensitive checks from `HEAD` while the user's checkout contains uncommitted game work.

## New context architecture

1. Mandatory startup: AGENTS/CLAUDE + STATE + REQUIREMENTS + ROUTING.
2. HANDOFF and `.ai/history/` are retrieval-only; historical journal content is never a startup dump.
3. Planner and visual critic receive complete bounded packets and have a hard zero-tool guard.
4. Developer receives the planner document and any latest expert decision; Tester receives only planner + developer structured reports.
5. An explicitly recommended, non-mechanical failure promotes the next planning pass to Sol/Senior. Only a repeated failure in the same affected subsystem after that Sol pass may create one Astra escalation; unrelated and mechanical failures do not accumulate toward Astra.
6. Astra runs from an external packet-only directory with no project docs, repository access, transcript, source dump, logs, screenshots, or usable shell/web/image/agent tools. Host skill discovery and app instructions are disabled. The packet has exactly nine required sections and a hard 10K-token limit.
7. Terra implements the Astra decision. Luna verifies it.

## Prompt caching

Stable system/tool prefixes and same-turn history cache well, as the 94.9% cached count proves. Cache reuse is defeated for newly appended tool output and dynamic role/task material. More importantly, caching does not prevent aggregate transcript replay from being counted. The design therefore reduces the material replayed and the number of turns instead of treating cache hit rate as the solution.
