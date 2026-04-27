# CRDP — Claude Research & Development Preset

A one-stop preset for Claude Code that gives you a complete, efficient environment for research and project development. Three best-in-class tools, one install.

**The idea:** research and build without friction. The vault keeps knowledge persistent and compounding (so you never re-explain context to Claude). GSD orchestrates development work with structured phases and plans. Caveman keeps token usage lean throughout.

---

## What's included

| Tool | Role | Source |
|------|------|--------|
| **Claude Knowledge Vault** | Per-project Obsidian knowledge base — persistent context, autonomous research, compound wiki loop | Proprietary (this repo) |
| **GSD** | Project orchestration — roadmaps, phases, plans, execution | [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) |
| **Caveman** | Token efficiency — lite compression mode, auto-enabled every session | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) |

---

## Install

```bash
git clone https://github.com/<your-username>/crdp.git
cd crdp
bash install.sh
```

Restart Claude Code. Everything is active on the next session.

---

## The research & development loop

```
Research phase                    Development phase
─────────────────                 ──────────────────
/vault-init                       /gsd-new-project
/vault-ingest <source>            /gsd-plan-phase
/vault-autoresearch <topic>       /gsd-execute-phase
/vault-integrate [[page]]         /gsd-ship
/vault-query "what do we know?"   /gsd-verify-work
/vault-lint                       /gsd-code-review
```

All sessions run in caveman lite — ~75% fewer tokens, same technical accuracy.

---

## Obsidian Knowledge Vault

Inspired by [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), extended with per-project isolation, autonomous research, and a compound enrichment loop.

- **Per-project isolation** — each folder gets its own subgraph at `~/.claude/vault/projects/<slug>/`, auto-injected on session start
- **Autonomous research** — 3-round web research loop producing durable wiki pages with cited sources
- **Compound loop** — `/vault-integrate` folds research findings back into the pages that raised the questions, enriching the knowledge base over time rather than just appending new pages
- **Research queue** — gaps captured as `- [ ]` items in `questions.md`, consumed by `/vault-autoresearch` (no-arg), flagged stale by `/vault-lint` after 14 days
- **Obsidian graph view** — open `~/.claude/vault` as an Obsidian vault; set graph filter to `path:pages` for a clean semantic view

### Commands

| Command | Description |
|---------|-------------|
| `/vault-init` | Bootstrap a knowledge base for the current folder |
| `/vault-save [title]` | Distill current conversation into a wiki page |
| `/vault-ingest <path-or-url>` | Synthesize an external source (URL, file, or paste) into a page |
| `/vault-query "<question>"` | Q&A against vault content; gaps queued for future research |
| `/vault-autoresearch <topic>` | 3-round autonomous web research loop → new wiki page. No-arg: pulls highest-leverage open question from queue (`--oldest` for FIFO). `--challenge` adds adversarial round 4 |
| `/vault-challenge [[page]]` | Adversarial falsification — searches for counter-evidence to the page's main claims, classifies HELD UP / WEAKENED / UNFALSIFIED, appends `## Adversarial challenge` section |
| `/vault-synthesize [[a]] [[b]] [...]` | Cross-domain juxtaposition — takes 2-5 user-picked pages, produces new synthesis page surfacing shared concepts, tensions, and non-obvious connections |
| `/vault-hypothesize [--tag X / --topic Y]` | Forced hypothesis generation — distills the vault and produces 3-5 testable bold assertions with reasoning, test paths, and stakes. Feeds questions.md as `HYPOTHESIS:` items |
| `/vault-probe [--web / --harsh]` | Blind-spot detection — scans the vault against its thesis, surfaces UNKNOWN gaps (structural prerequisites, missing stakeholders, adjacent territory, competing frameworks). Top 3 added to questions.md |
| `/vault-analogize [[page]]` | Forced cross-domain analogy — takes one page, discovers structurally similar patterns in other domains across the vault (synthesize = user picks; analogize = discovers). Maps what each teaches the other |
| `/vault-landscape "topic" [-N 3-7]` | Breadth-first parallel research for entering a new domain. Fans out N personas (default 5: landscape / mechanics / failure-modes / stakeholders / adversarial), each running independent web research, then merges into a landscape page. Complement to autoresearch (depth) — landscape is the mapmaker |
| `/vault-policy "<topic>"` | Topic-aware source policy generator. Runs a 7-question reasoning chain before research, emits structured policy file consumed by autoresearch / challenge / lint / output. Steers WebSearch allowlists, dissent targeting, and surfaces Claude's biases on the topic. Honest-refuse when domains can't be named |
| `/vault-correct [[page]] <verb>` | User-as-source-of-truth override channel. Verbs: OVERRIDE / ADD / RETIRE / CORRECT-POLICY with mandatory tier (CITED / PRACTITIONER / OPINION). Mechanical hallucination check + discrete-options refine path defends against sycophancy. Reversible via `--revoke` / `--supersede`. Corrections are testable claims, not gospel — flow through `/vault-challenge` like any other claim |
| `/vault-output <format>` | Produce consumer-grade artifacts from existing vault pages (pure synthesis, no web). Five formats: report, study-guide, comparison, timeline, glossary. Outputs land in `outputs/`, never `pages/` — ship-and-forget vs compounding knowledge |
| `/vault-lint --quality / --all` | Adds per-page quality scoring on 6 dimensions (cite-density, cite-diversity, never-challenged, freshness, inbound-links, open-q resolution) → GREEN / YELLOW / RED traffic light + per-page next-move suggestion |
| `/vault-integrate [[page]]` | Fold research findings back into source pages (diff + confirm) |
| `/vault-lint [--deep]` | Health check — orphans, ghost links, stale open questions |
| `/vault-update-hot-cache` | Distill vault to ≤2KB session context file |
| `/vault-help` | Full command reference |

### Automatic hooks (no action needed)

| Hook | Trigger | Action |
|------|---------|--------|
| `vault-session.js` | Session start | Injects active project's knowledge base into context |
| `vault-source-logger.js` | WebFetch / WebSearch | Logs every URL to `raw/sources.jsonl` |
| `vault-session-end.js` | Session end | Appends log entry, nudges hot-cache refresh if stale |

---

## Caveman

No commands needed. Once installed, caveman runs automatically every session.

CRDP configures it at `lite` level — drops filler words and hedging while keeping all technical content exact. Applies to Claude's main responses and all spawned agents. Saves ~75% of output tokens with no accuracy loss.

Settings applied by `install.sh`:
- `~/.config/caveman/config.json` → `{ "defaultMode": "lite" }`
- `CAVEMAN_DEFAULT_MODE=lite` env var in `~/.claude/settings.json`
- Caveman lite instruction appended to `~/.claude/CLAUDE.md`

To adjust the compression level after install, edit `~/.config/caveman/config.json`. See the [Caveman repo](https://github.com/JuliusBrussee/caveman) for available modes.

---

## GSD

CRDP installs GSD from the official repo without modifications. For the full command reference see the [official GSD repository](https://github.com/gsd-build/get-shit-done), or run `/gsd-help` inside Claude Code.

---

## Updating

```bash
cd crdp
git pull
bash install.sh   # idempotent — safe to re-run
```

Caveman and GSD update from their official repos independently. Re-running `install.sh` pulls their latest versions.

## Re-installing / Updating over an existing install

`install.sh` is safe to re-run. What it skips vs. overwrites:

| Item | Behaviour |
|------|-----------|
| Caveman (already installed) | Skipped — no changes |
| GSD (already installed) | Skipped — no changes |
| Vault skills (`~/.claude/skills/vault-*/`) | **Overwritten** with latest versions |
| Vault hooks (`~/.claude/hooks/vault-*.js`) | **Overwritten** with latest versions |
| `settings.json` hooks + env var | Skipped if already present — no duplicates added |
| `~/.claude/CLAUDE.md` caveman snippet | Skipped if already present |
| `~/.claude/vault/` data and pages | Never touched — your knowledge base is safe |

**Note:** if you have locally customised any vault skill (`SKILL.md` files), re-running `install.sh` will overwrite those customisations. Back them up first if needed.

---

## Changelog

### v1.0.8 — User-as-source-of-truth correction channel
Web sources are bounded. Some knowledge lives only in the user's lived experience, paid databases, post-cutoff developments, or domain expertise no public source captures. v1.0.8 adds the structural override path so the user can inject ground-truth without polluting the vault.

- **`/vault-correct`** — new skill. Verb-routed action dispatch (OVERRIDE / ADD / RETIRE / CORRECT-POLICY) with mandatory three-tier trust declaration (CITED / PRACTITIONER / OPINION). Every correction lands as an audit record at `corrections/<page>-<ts>-<id>.md`, indexed in target page frontmatter, rendered with tier label, logged. Reversible via `--revoke` and `--supersede` — history never silently deleted.
- **Sycophancy-resistant by construction.** Mechanical hallucination check runs contradiction detection across target page + 1-hop neighbors before any write. Conflicts surface with discrete options (apply / refine / defer / cancel) — NOT free-form "are you sure?" prompts (documented to degrade Claude accuracy 98% → 56%). Vendor-marketing URLs auto-demote CITED to PRACTITIONER. CITED corrections trigger source-URL WebFetch verification.
- **`/vault-challenge` corrections-aware**: OVERRIDE corrections substitute the claim AND test it (corrections are not gospel — entered into adversarial pipeline same as web claims). RETIRE skips with audit note. `--trust-corrections` flag for skip-without-test.
- **`/vault-lint` corrections-aware**: stale-correction detection (CITED 6mo, PRACTITIONER 12mo, OPINION never expires), correction-density alarms (per-page >5, per-vendor >3, per-tier OPINION >50%). D8 rationale-suppression for policy_overrides with non-empty rationale.
- **`/vault-integrate` corrections-aware**: conflict detection at diff stage; per-edit user decision required (apply-anyway / skip / mark-superseded / cancel). apply-anyway emits warning blockquote in target page. Push-on-correct annotates 1-hop downstream pages.
- **`/vault-output` corrections-aware**: every output template (report / study-guide / comparison / timeline / glossary) auto-injects `## Author notes` block with tier labels. CITED renders prominently; PRACTITIONER with caveat; OPINION explicitly framed (never substitutes Findings without `--allow-opinion-override`). >50% input-share threshold escalates to H1 callout.
- **`/vault-autoresearch` corrections-aware**: Round 1 step 0.6 reads cross-page corrections as starting context (always-on). Round 3 final step verifies synthesis against corrections — flags contradictions without auto-resolving. `--ignore-corrections` flag exists but warning still surfaces.
- **`/vault-policy` corrections-preserving**: `policy_overrides:` array survives `--refresh` regenerations verbatim. Conflicts between regenerated base fields and existing overrides surface at confirmation, never silent resolution.

Net effect: the user is now a first-class source of truth, but corrections are auditable, testable claims — not gospel laundered as research finding. The structural defenses prevent the discipline from depending on Claude's runtime judgment.

### v1.0.7 — Topic-aware quality policy
The vault now reasons about *what good sources mean for a specific topic* before researching, instead of inheriting whatever the search engine returns. Closes the "AI source quality is unchanged" gap from prior versions: web search bias is bounded by an explicit, auditable, per-topic policy.

- **`/vault-policy "<topic>"`** — new skill. Runs a 7-question reasoning chain (CLASSIFY → EVIDENCE STANDARD → AUTHORITATIVE DOMAINS → DISSENT → VOLATILITY+RECENCY → RISK FLAGS → CLAUDE BIAS CHECK) and emits a structured policy file at `projects/<slug>/raw/policy-<topic-slug>.md`. Mechanical confidence calibration (low if <3 domains named, high if 5-7 + clean risk flags). Honest-refuse path — when Claude can't name an authoritative domain, the skill REFUSES rather than fakes one. No self-critique step (sycophancy paradox). Manual re-policy only.
- **`/vault-autoresearch` policy-aware**: Round 1 step 0.5 reads the policy, passes `allowed_domains` / `blocked_domains` to WebSearch by confidence (high → allowlist; medium → allowlist round 1 only; low → blocklist only). Round 3 counter-evidence pass runs class-targeted searches per `dissent_classes_required` (academic → arxiv; regulatory → .gov; practitioner → postmortem queries). Topical-fallback when exact slug doesn't match: scans `policy-*.md` for stem/class overlap, uses best match as advisory.
- **`/vault-challenge` policy-aware**: step 2.5 calibrates WEAKENED threshold to `evidence_standard`. `risk_flags: [hype-cycle]` lowers the WEAKENED bar for vendor-marketing claims. Adversarial searches start from `dissent_likely_locations`.
- **`/vault-ingest` policy-aware**: step 3a.5 auto-classifies source URL's `source_class` (regulatory/academic/standards-body/practitioner/journalism/vendor/forum) and inherits `quality_policy:` pointer when matching topic.
- **`/vault-lint --quality` D8 dimension**: per-page policy compliance scoring. `D8 = 0.40 * authoritative_hit_rate + 0.40 * dissent_class_coverage + 0.20 * evidence_standard_match`. Composite weight 0.12. Pages <0.50 D8 demoted to RED. Adds stale-policy detection over `raw/policy-*.md` (TTL: low=24mo, medium=12mo, high=6mo).
- **`/vault-output` policy-aware**: every output template (report / study-guide / comparison / timeline / glossary) auto-injects `## Source caveats` from each input page's policy. >50% input share of `source_pool_warning` → escalated to prominent callout.
- **`/vault-synthesize` policy-aware**: multi-input convergence — same policy → inherit; different policies → user prompted (most-cautious / new-policy / proceed-anyway).
- **`/vault-landscape` policy-aware**: pre-spawn policy check; passes constraints (allowlist, blocklist, dissent classes) into each persona's WebSearch params.

Net effect: the path of least resistance now produces topic-calibrated research. Web search inherits an explicit per-topic policy. The vault is honest about what its sources are and aren't, end-to-end through to consumer-facing outputs.

### v1.0.6 — Force-bypass discipline (architectural primary + targeted in-flow + audit catch)
The verification gate from v1.0.5 had a single escape hatch (`--force "<reason>"`). Over time, that escape becomes muscle memory. v1.0.6 restructures the gate to eliminate the failure mode on the highest-risk paths.

- **`/vault-integrate` page-type routing (Section 0)** — the gate now routes on the source page's `source:` frontmatter:
  - `source: autoresearch` OR `source: vault-synthesize` → high-risk inferential. **`--force` is unconditionally rejected.** Must run `/vault-challenge` first. Eliminates the dangerous-path bypass entirely.
  - `source: conversation` (vault-save), `source: ingest`, or no `source:` field (legacy) → existing `--force "<reason>"` behavior preserved.
- **Section 0b — diff-show before force** — when `--force` IS accepted (on conversation/ingest/legacy paths), the agent surfaces any `## Adversarial challenge` content + inline `(contested by ...)` annotations and requires explicit `y` to continue. Silent-passes when there's nothing to surface. Breaks muscle memory by transparency, not punishment.
- **`vault-session-end.js` FORCE-NUDGE** — Stop hook scans the session window for `INTEGRATE-FORCE` entries without subsequent `CHALLENGE`. For each force-bypassed page that wasn't challenged this session, prepends `FORCE-NUDGE — force-bypassed [[page]] not challenged this session — consider /vault-challenge [[page]]` before the `SESSION-END` line. Cap: 3 nudges per session. Catches slip at moment of formation.

Net effect: adversarial bypass on inferential pages (autoresearch / synthesize) is impossible. Bypass on legitimate-feeling paths (conversation / ingest) shows what's being ignored at the moment of bypass and gets nudged at session end if not challenged.

### v1.0.5 — Critical thinking by default
Critical thinking is now structural, not optional. The vault refuses to compound un-verified content silently.

- **`verification:` frontmatter state machine** — every page now carries `verification: none | quick | full`. Lifecycle: drafts ship as `none`, page-creation skills set `quick`, `/vault-challenge` promotes to `full`.
- **`/vault-autoresearch`** — Round 3 now includes a mandatory counter-evidence pass (1-2 WebSearches for dissent on the synthesis's strongest claims) before writing. Populates `## Tensions & contradictions` actively. Sets `verification: quick`. Adds ~10% time per run. `--challenge` flag still triggers full Round 4.
- **`/vault-synthesize`** — pre-write adversarial sweep (1 WebSearch for "synthesis fails when..."). Sets `verification: quick`.
- **`/vault-ingest`** — contestation check (1 WebSearch for "<claim> contested / debunked / critique of"). Sources with credible counter-evidence get inline `(contested by [source])` annotations. Sets `verification: quick`.
- **`/vault-save`** — sets `verification: none` automatically. Conversation-saved pages are explicit drafts until promoted via `/vault-challenge` or `--force`-integrated.
- **`/vault-integrate` verification gate** — refuses to fold pages without `verification:` field (or with `verification: none`). Bypass: `--force "<one-line reason>"`, which logs `INTEGRATE-FORCE — [[page]] — <reason>` to `log.md` for audit. Gate is deterministic (decided in main context from frontmatter alone, no agent spawn) — cheap and fast.
- **`/vault-challenge` unchanged** — still the deep-dive / re-test / surgical falsification tool. Now sets `verification: full` + `challenged: <date>`.

Net effect: the path of least resistance now produces challenged content. Skip path requires conscious `--force` with reason. The skip is visible and audited.

### v1.0.4 — Output, breadth research, quality scoring
- **`/vault-output <format>`** — new skill. Produce consumer-grade artifacts from existing vault pages: report, study-guide, comparison, timeline, glossary. Pure synthesis — no web fetches. Outputs land in `outputs/`, never `pages/` — ship-and-forget vs compounding knowledge. Per-finding citation rule baked into every template to mitigate hallucination.
- **`/vault-landscape "topic" [-N 3-7]`** — new skill. Breadth-first parallel research for entering a new domain. Main context fans out N personas (default 5: landscape / mechanics / failure-modes / stakeholders / adversarial) as parallel agents in one message, then merges via the synthesize 4-pass pattern. Distinct from `/vault-autoresearch` (depth-first) — landscape is the mapmaker, autoresearch is the explorer. Bypasses priority queue. Mandatory cost confirmation before spawning (~3-5x WebFetch budget vs sequential).
- **`/vault-lint --quality`** — extended existing skill. Per-page quality scoring on 6 dimensions: cite-density, cite-diversity, never-challenged, freshness (volatility-scaled), inbound-links, open-question resolution rate. Composite score → GREEN / YELLOW / RED traffic light. Per-flagged-page next-move suggestion (e.g., D3 weak → run `/vault-challenge`). `quality_profile:` frontmatter convention for meta-pages (synthesis/probe/hypotheses/analogies). 14-day grace period for fresh pages.
- **Bug fixes**: `vault-analogize` now updates `index.md` under `## Analogies` section (was missed, caused orphans). `vault-output` and `vault-landscape` agents `mkdir -p` defensively before writing (avoids harness hook blocks on non-existent directories).

### v1.0.3 — Insight generation layer
- **`/vault-hypothesize`** — new skill. Forced hypothesis generation. Reads the vault (whole or filtered by tag/topic), distills what it collectively asserts, produces 3-5 testable bold claims that follow from the content but aren't stated anywhere. Each has a falsification path, reasoning grounded in specific pages, a concrete test route, and stakes. Output feeds `questions.md` as `HYPOTHESIS:` items so `/vault-autoresearch` picks them up as falsifiable targets. The vault generates its own research agenda.
- **`/vault-probe`** — new skill. Blind-spot detection. Scans the vault against its stated thesis, surfaces UNKNOWN gaps the user didn't articulate — structural prerequisites, adjacent territory, missing stakeholder perspectives, failure modes, scale axes, competing frameworks. Top 3 gaps added to `questions.md`. `--web` validates gaps against public domain discourse; `--harsh` amplifies adversarial scrutiny.
- **`/vault-analogize [[page]]`** — new skill. Forced cross-domain analogy. Takes one page, searches the vault for pages with structurally similar patterns in different domains (vs `/vault-synthesize` where the user picks pages). Maps shared abstract mechanism, how each side instantiates it, and what each teaches the other — failure modes one side missed, defensive mechanisms the other lacks, mature → nascent transfer. Honest about rejected candidates and sparse pools.

### v1.0.2 — Critical research upgrades
- **`/vault-challenge [[page]]`** — new skill. Adversarial falsification for any synthesis page. Searches for counter-evidence, classifies claims as HELD UP / WEAKENED / UNFALSIFIED, appends an `## Adversarial challenge` section. Auto-queues reconciliation items for weakened claims. Closes the Popper gap — the vault is no longer just a belief reinforcer.
- **`/vault-synthesize [[a]] [[b]] [...]`** — new skill. Cross-domain juxtaposition. Takes 2-5 pages (usually from different domains), produces a new synthesis page with shared concepts, tensions, non-obvious connections, and what they unlock. Innovation through forced recombination — the step most AI research tools skip.
- **Priority-ranked queue** — `/vault-autoresearch` (no-arg) now picks by leverage score (how many existing pages would be unblocked) instead of oldest-first. Use `--oldest` to restore FIFO. Directs research effort where it compounds most.
- **`/vault-autoresearch --challenge`** — optional flag. Runs adversarial round 4 immediately after synthesis. Makes research output falsifiable by default when you opt in.

### v1.0.0 — Initial release
- Per-project knowledge vault with Obsidian graph view integration
- Commands: `/vault-init`, `/vault-save`, `/vault-ingest`, `/vault-query`, `/vault-autoresearch`, `/vault-integrate`, `/vault-lint`, `/vault-update-hot-cache`, `/vault-help`
- Caveman installed at lite level, auto-enabled every session
- GSD installed from official repo
- Hooks: SessionStart (context injection), PostToolUse (source logging), Stop (session summary)
- Compound loop: `/vault-query` → `/vault-autoresearch` → `/vault-integrate`

---

## Credits

- **[Caveman](https://github.com/JuliusBrussee/caveman)** — Julius Brussee — token compression for Claude Code
- **[GSD](https://github.com/gsd-build/get-shit-done)** — gsd-build — structured development workflow
- **Knowledge Vault concept** — inspired by [Andrej Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
