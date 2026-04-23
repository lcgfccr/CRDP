---
name: vault-help
description: >
  Reference for the Claude Knowledge Vault: every /vault-* command, the hooks
  that run automatically, the file layout, and when to use what. Use when user
  says: /vault-help, "what vault commands exist", "how does the vault work",
  "explain the vault", "show vault reference".
---

# vault-help

When invoked, print the full reference below, formatted for the terminal. Tailor it slightly: if the user asked about a specific command ("/vault-help save"), expand that command's section and collapse the rest.

---

# Claude Knowledge Vault — Reference

**What it is**: a per-project Obsidian-friendly knowledge base at `~/.claude/vault/projects/<project-slug>/`. Inspired by Karpathy's LLM Wiki pattern, adapted so every project you `cd` into gets its own isolated subgraph. The SessionStart hook auto-injects the active project's context; all writes go through explicit commands so the vault never pollutes itself.

---

## Commands

### `/vault-init`
Bootstrap a knowledge base for the current folder. Creates `projects/<slug>/` with `index.md`, `log.md`, `overview.md`, `pages/`, `raw/`. Asks one question: what is this project about. After this runs, every future Claude Code session in this folder auto-loads the project's context.
**Use when**: starting a new project you'll want to accumulate knowledge about.
**Don't use**: in folders where you don't need persistent context (ephemeral scripts, quick fixes).

### `/vault-save [title]`
Distill the **current conversation** into a wiki page in this project's subgraph. Writes a structured page (Summary / Context / Details / Open questions / Related), updates `index.md`, appends to `log.md`, scans for wikilink opportunities across existing pages.
**Use when**: a conversation produced a durable insight, a design decision, an explanation worth keeping.
**Don't use**: for trivial exchanges, or before the conversation has converged on something useful.

### `/vault-ingest <path-or-url>`
Read an external source (local file, URL, or pasted text) and synthesize a wiki page for it. Preserves exact claims, extracts tags, links to existing pages. Batch form: `/vault-ingest all of these: <list>` ingests each and writes a parent summary page.
**Use when**: you want to add a specific paper, article, docs page, or PDF into the vault.
**Don't use**: for low-value sources (marketing pages, social posts without substance).

### `/vault-query "<question>" [--web]`
Disciplined Q&A **against existing vault content only** by default. Grep index + pages, read relevant ones, synthesize a cited answer with confidence calibration, offer to promote the answer to a new page. `--web` adds a single web-search pass and keeps provenance separate.
**Use when**: you want to see what the vault already knows, or to convert a good answer into a permanent page.
**Differs from** `/vault-autoresearch`: query uses only what's in the vault; autoresearch goes to the web.

### `/vault-autoresearch <topic> [--deep]`
Autonomous multi-round research loop. Round 1: search + fetch, collect claims. Round 2: deepen on follow-up questions, surface contradictions. Round 3: synthesize into a new wiki page with a "connecting dots" paragraph that explicitly looks for non-obvious cross-links. Writes round notes to `raw/`, final page to `pages/`, updates index/log/overview. `--deep` → 5 rounds.
**Use when**: the vault doesn't cover something and you want a structured investigation that compounds back into the vault.
**Don't use**: for simple factual questions (just ask or `/vault-query`).

### `/vault-lint [--deep]`
Health check. Mechanical pass: orphans, ghost wikilinks, missing index entries, duplicate titles, oversized pages. `--deep` adds semantic passes: stale claims, contradictions across pages, drift from `overview.md`, unanswered open questions. Writes `LINT-REPORT.md` at project root; suggests fixes but **never auto-deletes pages**.
**Use when**: the vault has > 20 pages, or after a burst of ingests, or monthly.

### `/vault-update-hot-cache`
Distill the vault into a ≤ 2 KB `.hot-cache.md` that the SessionStart hook prefers over the full index+overview. The hot-cache includes the current thesis, top-loadbearing facts, active questions, last 10 log entries, and a top-15 page map.
**Use when**: the vault has grown past ~30 pages and session startup feels heavy; or after major ingest/autoresearch bursts.
**Automatically nudged**: the Stop hook suggests running this if ≥ 5 new log entries accumulated since the last hot-cache.

### `/vault-integrate [[research-slug]]`
Fold a research page's findings back into the source pages that raised the questions it answers. Shows a diff for each proposed change and waits for explicit confirmation before writing. Updates open questions (strike-through + link), appends `> **Updated:**` blockquote summaries to relevant sections, adds wikilinks bidirectionally. Marks the research page with an `integrated:` frontmatter field.
**Use when**: autoresearch answered a question that was open in one or more existing pages — close the loop and enrich the source pages.
**Workflow**: `/vault-autoresearch` → review the new page → `/vault-integrate [[page]]`.
**Don't use**: on a research page whose findings haven't been reviewed yet.

### `/vault-help`
This page.

---

## Hooks (automatic, no invocation needed)

| Hook | When it fires | What it does |
|---|---|---|
| SessionStart (`vault-session.js`) | Every new Claude Code session | If the current folder has a project KB, injects the project's `.hot-cache.md` (if present) or `index.md` + `overview.md` + last 5 log entries. Silent no-op otherwise. Bounded to a few KB. |
| PostToolUse on `WebFetch`/`WebSearch` (`vault-source-logger.js`) | Every web retrieval | If a project KB is active, appends one JSON line per URL/query to `projects/<slug>/raw/sources.jsonl`. Raw log only — does not generate pages. |
| Stop (`vault-session-end.js`) | End of session | Appends a `SESSION-END` log line noting entries accumulated since last hot-cache; if ≥ 5, recommends `/vault-update-hot-cache`. |

---

## File layout

```
~/.claude/vault/
├── VAULT.md                     # schema — read before modifying convention
├── shared/                      # cross-project pages (used rarely)
│   ├── index.md
│   ├── pages/
│   └── raw/
└── projects/
    └── <project-slug>/
        ├── index.md             # catalog: one line per page
        ├── overview.md          # evolving thesis
        ├── log.md               # append-only operations log
        ├── .hot-cache.md        # (optional) distilled ≤ 2KB summary
        ├── pages/               # wiki pages — [[wikilinked]]
        └── raw/
            ├── sources.jsonl    # auto-logged URLs/queries
            └── <source>.original.md  # snapshots of ingested URLs
```

---

## Project slug

Derived deterministically so the same folder always maps to the same subgraph:
1. `git rev-parse --show-toplevel` → basename (preferred)
2. Fallback: basename of cwd
3. Slugify: lowercase, non-alphanumeric → `-`, collapse repeats

Examples:
- `~/code/acme-api` (git root) → `acme-api`
- `~/Desktop/folder` (no git) → `folder`

---

## Conventions

- **Wikilinks**: `[[page-name]]` — Obsidian renders these as live links. Always cross-link new pages to existing ones.
- **Pages are durable; raw/ is disposable**: `/vault-ingest` puts a summary in `pages/` and a snapshot in `raw/`. The summary is load-bearing; the snapshot is a citable archive.
- **Never auto-overwrite**: every command asks before replacing existing content.
- **Every non-trivial claim gets a citation** (wikilink to a page, or external URL).

---

## Typical workflows

### Starting a new research project
```
/vault-init
# → one question, subgraph created
/vault-ingest https://arxiv.org/abs/2403.14403
/vault-ingest ~/Downloads/notes.md
/vault-autoresearch "PKCE flow security tradeoffs"
# browse vault in Obsidian: open -a Obsidian ~/.claude/vault
```

### During daily work
```
# Just work normally. Every WebFetch/WebSearch auto-logs to raw/sources.jsonl.
# When a conversation produces a real insight:
/vault-save webhook-idempotency-design
```

### Periodic maintenance
```
/vault-lint                    # mechanical health check
/vault-lint --deep             # semantic pass for contradictions / stale claims
/vault-update-hot-cache        # refresh the session warm-up cache
```

### Asking the vault a question
```
/vault-query "what tradeoffs did we settle on for retry policy?"
# → cited answer from vault pages; offered promotion to new page
```

---

## Settings and config

| Setting | Location | Purpose |
|---|---|---|
| Vault root | `~/.claude/vault/` | Fixed; change by editing hook sources. |
| SessionStart hook limits | `vault-session.js`: `MAX_INDEX_BYTES=8KB`, `MAX_OVERVIEW_BYTES=12KB`, `LOG_TAIL_LINES=5`, hot-cache ceiling 4 KB | Bound injection size. |
| Hot-cache staleness threshold | `vault-session-end.js`: `HOT_CACHE_STALE_THRESHOLD=5` log entries | When to nudge `/vault-update-hot-cache`. |
| Backup | `~/.claude/settings.json.pre-vault.bak` | Pre-vault settings snapshot. |

---

## Troubleshooting

- **SessionStart didn't inject anything**: either no KB for this folder (run `/vault-init`) or slug mismatch — check `ls ~/.claude/vault/projects/` against the expected slug.
- **WebFetch didn't log to sources.jsonl**: requires an active KB in the current folder. The hook silent-exits when no KB — this is by design.
- **Vault feels bloated at session start**: run `/vault-update-hot-cache`. If already present, the hook reads hot-cache first (bounded 4 KB).
- **Want to delete a project's KB**: `rm -rf ~/.claude/vault/projects/<slug>`. No references elsewhere.

---

## Related projects (inspirations)

- Karpathy's LLM Wiki pattern: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- `AgriciDaniel/claude-obsidian` — flat-vault alternative we chose not to use
- `safishamsi/graphify` — codebase → knowledge graph (topology-based, different paradigm)
