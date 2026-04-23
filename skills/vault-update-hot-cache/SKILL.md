---
name: vault-update-hot-cache
description: >
  Distill the current project's vault subgraph into a compact hot-cache
  (.hot-cache.md) that the SessionStart hook prefers over the full index for
  faster, lower-token session warm-up. Run after significant ingests, saves,
  or when session-start injection feels stale. Use when user says:
  /vault-update-hot-cache, "refresh the hot cache", "update the cache",
  "recompress the vault context".
---

# vault-update-hot-cache

Maintain a distilled context summary that accelerates session injection and keeps tokens bounded as the vault grows.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`.

## Why this exists

`vault-session.js` (SessionStart hook) injects `index.md` + `overview.md` + last 5 log entries. As the vault grows past ~30-50 pages, those files bloat and the injection becomes wasteful. `.hot-cache.md` is a hand-curated (by Claude), semantically-organized digest that the SessionStart hook reads **instead** when present.

## What to include

Target total: **≤ 2 KB**. Budget tightly.

```markdown
---
updated: <ISO-8601>
pages_at_update: <N>
log_entries_at_update: <N>
---

# Hot cache — <project-slug>

## Thesis

<1-2 sentences — current best synthesis of what this project is about. Taken from overview.md but re-distilled.>

## What's known

- <top 5-7 most load-bearing facts or conclusions, each 1 line, wikilink to the source page>

## Active questions

- <top 3-5 open questions the vault is currently trying to answer>

## Recent moves (last 10 log entries, compressed)

- <timestamp> <OP> <target> — <1-line reason>

## Page map (top 15 by link-count)

- [[page-a]] — <one-line>
- [[page-b]] — <one-line>
...

## Pointers

- Full index: `index.md`
- Log: `log.md`
- Overview: `overview.md`
```

## Procedure

1. Determine slug, verify KB active.

2. Read `index.md`, `overview.md`, last 20 log entries, and — for top-15-by-link-count pages — the Summary section only (not the full body).

3. Compute link-counts: for each page, count incoming `[[wikilinks]]` from other pages.

4. Write the digest above. Hard ceiling: 2 KB. If over budget, trim "What's known" first, then "Page map", then "Recent moves". Preserve Thesis and Active questions.

5. Save to `projects/<slug>/.hot-cache.md`. The leading dot keeps it out of Obsidian's default browse view but Obsidian will still open it if requested.

6. Append to log.md:
   ```
   - <timestamp> — HOT-CACHE — refreshed (<N> pages, <M> log entries, cache size <K> bytes)
   ```

7. **Report to user** what changed from the previous cache:
   - Pages added since last update
   - New open questions
   - Contradictions surfaced (if any)
   - Bytes saved vs reading full index+overview

## Update cadence

- Manually after meaningful ingest bursts
- Stop hook (`vault-session-end.js`) nudges the user to run this when the log has grown by ≥ 5 entries since the last hot-cache update

## Rules

- Stay under 2 KB. If you need more, the vault has outgrown this pattern and should be split into sub-subgraphs.
- Never include full page bodies — only 1-line page summaries.
- Never include Thesis content that contradicts `overview.md` — either update overview first or reconcile before writing hot-cache.
