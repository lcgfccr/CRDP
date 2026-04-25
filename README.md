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
