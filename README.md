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
| `/vault-autoresearch <topic>` | 3-round autonomous web research loop → new wiki page |
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

## Credits

- **[Caveman](https://github.com/JuliusBrussee/caveman)** — Julius Brussee — token compression for Claude Code
- **[GSD](https://github.com/gsd-build/get-shit-done)** — gsd-build — structured development workflow
- **Knowledge Vault concept** — inspired by [Andrej Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
