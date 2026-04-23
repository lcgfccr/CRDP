---
name: vault-lint
description: >
  Health check for the current project's vault subgraph. Detects orphan pages,
  dead wikilinks, missing index entries, duplicate titles, stale claims, and
  contradictions. Reports findings and proposes fixes — does NOT auto-fix.
  Use when user says: /vault-lint, "check the vault", "audit the knowledge base",
  "lint the wiki", "find gaps".
---

# vault-lint

Audit the current project's vault subgraph for rot. Report, don't auto-fix.

## Precondition

Project's knowledge base must exist at `~/.claude/vault/projects/<slug>/index.md`.

## Execution model

Runs in an isolated subagent — main conversation sees only the report summary.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Note `--deep` flag if present.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-lint for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Mode: <--deep | mechanical only>

    Follow the full procedure in the vault-lint skill. Return ONLY:
    - Summary table (check → result)
    - Soft issues (one line each, if any)
    - Suggested fixes (numbered list, not applied)
    - Confirm LINT-REPORT.md was written
  """
)
```

**After:** Echo the agent's output. Then ask the user which fixes (if any) to apply — apply only on explicit confirmation.

## Checks to run

### 1. Structural integrity (mechanical)

- **Orphans**: pages in `pages/` that are NOT referenced by `index.md` AND NOT wikilinked from any other page → candidates for removal or index-listing.
- **Missing index entries**: pages that exist but aren't listed in `index.md`'s `## Pages` section.
- **Ghost wikilinks**: `[[name]]` references pointing to pages that don't exist in `pages/` → either rename, create, or remove.
- **Duplicate titles**: two pages with the same `title:` frontmatter → pick one canonical, make the other a redirect or merge.
- **Broken external URLs**: (optional, costs WebFetch per URL) spot-check 5 randomly-sampled external links via WebFetch. Flag 4xx/5xx.
- **Oversized pages**: pages > 20 KB → candidates for splitting.
- **Timestamps**: pages where `ingested` or `created` frontmatter is missing.
- **Stale open questions**: parse `projects/<slug>/questions.md` for `- [ ] <timestamp> — <question>` lines. Flag any entries where the timestamp is more than **14 days** old — these are research items the user opened via `/vault-query` but never followed up on. Each is a candidate for `/vault-autoresearch` (which can pull the oldest from the queue with no args).

### 2. Semantic integrity (LLM-assisted)

- **Stale claims**: pages older than 6 months that make time-sensitive factual claims (version numbers, benchmarks, pricing). Flag for re-verification, don't delete.
- **Contradictions**: scan for pairs of pages where page A asserts X and page B asserts ¬X. Requires reading pages and reasoning about content. Limit scope to pages that touch overlapping topics (same tags or cross-linked).
- **Gaps**: open questions accumulated in log.md or in `Open / contradicts` sections of pages that have been unanswered for a long time → candidates for `/vault-autoresearch`.
- **Drift from overview.md**: does the current body of pages still reflect overview.md's thesis? If overview.md says "we are investigating X" but recent pages are all about Y, flag the overview as stale.

## Procedure

1. Determine slug, verify KB active.

2. **Mechanical checks first** (cheap, deterministic). Enumerate `pages/` directory, parse each file's frontmatter and wikilinks (regex `\[\[([^\]]+)\]\]`). Build sets:
   - `existing_pages` = basenames in pages/
   - `indexed_pages` = those listed in index.md
   - `referenced_pages` = union of wikilinks across all pages

   Compute:
   - orphans = existing_pages − indexed_pages − referenced_pages
   - ghost links = referenced_pages − existing_pages
   - missing from index = existing_pages − indexed_pages

   Also parse `questions.md` if present:
   - Lines matching `^- \[ \] <iso-timestamp> — ...` are OPEN questions.
   - Lines matching `^- \[x\] ...` are ANSWERED (skip).
   - Flag OPEN items where `now - timestamp > 14 days` as stale.

3. **Semantic checks** (expensive, LLM). Only run these if user asked for "deep lint" OR if mechanical checks passed cleanly OR at user's request. Default: offer to run these as a follow-up.

4. **Report**. Write findings to a new or appended `LINT-REPORT.md` at project root (not in pages/). Structure:

   ```markdown
   # Lint Report — <date>

   ## Summary

   <X orphans, Y ghost links, Z stale claims, etc.>

   ## Mechanical issues

   ### Orphans (N)
   - `<page.md>` — last touched <date>. No incoming wikilinks, not in index.

   ### Ghost links (N)
   - `[[name]]` referenced from `<source.md>` — no target exists.

   ### Missing from index (N)
   ...

   ## Semantic issues

   ### Potentially stale (N)
   - `<page.md>` (<tags>) — claims <X> as of <date>. Verify currency.

   ### Possible contradictions (N)
   - `<page-a.md>` asserts "<X>"; `<page-b.md>` asserts "<¬X>". Review.

   ### Stale open questions (N)
   - From `questions.md`: "<question>" — open since <date> (<N> days). Candidate for `/vault-autoresearch` (no-arg invocation picks oldest).
   - From `<page.md>` `Open questions` section: "<question>" — outstanding since <date>.

   ## Suggested next actions

   1. ...
   2. ...
   ```

5. **Append to log.md**:
   ```
   - <timestamp> — LINT — <summary-line> — see [[LINT-REPORT]]
   ```

6. **Prompt the user**: for each category of findings, ask if they want to auto-fix (e.g., add missing index entries mechanically), ignore, or defer to a human review.

## Rules

- Do NOT delete pages automatically, ever.
- Do NOT rewrite page content to resolve contradictions — flag them and let the user decide.
- Mechanical fixes (adding a page to index.md) are OK to auto-apply only after explicit user confirmation on this lint run.
- Lint is additive: always append to log.md, never rewrite history.
