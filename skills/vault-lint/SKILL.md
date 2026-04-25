---
name: vault-lint
description: >
  Health check for the current project's vault subgraph. Detects orphan pages,
  dead wikilinks, missing index entries, duplicate titles, stale claims,
  contradictions, and (with --quality / --all) scores per-page health on six
  dimensions (cite-density, cite-diversity, never-challenged, freshness,
  inbound-links, open-question resolution) into GREEN/YELLOW/RED traffic lights
  with per-flagged-page next-move suggestions. Reports findings and proposes
  fixes — does NOT auto-fix. Use when user says: /vault-lint, /vault-lint --deep,
  /vault-lint --quality, /vault-lint --all, /vault-lint --page <slug>,
  "check the vault", "audit the knowledge base", "lint the wiki", "find gaps",
  "score vault quality".
---

# vault-lint

Audit the current project's vault subgraph for rot. Report, don't auto-fix.

## Precondition

Project's knowledge base must exist at `~/.claude/vault/projects/<slug>/index.md`.

## Inputs

- **Default**: `/vault-lint` → mechanical checks only.
- **`--deep`**: mechanical + semantic (LLM-assisted) checks.
- **`--quality`**: mechanical + per-page quality scoring (six dimensions, traffic-light grade).
- **`--all`**: mechanical + semantic + quality. Kitchen-sink.
- **`--page <slug>`**: restrict scoring to one page (mirrors single-article scan). D5 inbound-links is N/A in single-page mode — exclude from composite, re-weight the remaining dimensions.
- **`--verbose`**: full per-dimension breakdown, list GREEN pages explicitly. Default is collapsed.

Flag matrix:

| Invocation | Mechanical | Semantic | Quality |
|---|---|---|---|
| `/vault-lint` | yes | no | no |
| `/vault-lint --deep` | yes | yes | no |
| `/vault-lint --quality` | yes | no | yes |
| `/vault-lint --all` | yes | yes | yes |

Mechanical always runs — cheap, feeds the page list everything else needs.

## Execution model

Runs in an isolated subagent — main conversation sees only the report summary.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse flags: `--deep`, `--quality`, `--all`, `--page <slug>`, `--verbose`.
3. If `--page <slug>`, verify `pages/<slug>.md` exists. Abort if not.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-lint for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Mode: mechanical=<true>, semantic=<true|false>, quality=<true|false>
    Page filter (if any): <slug or "all">
    Verbose: <true|false>

    Follow the full procedure in the vault-lint skill (mechanical + semantic + quality lens as flagged). Return ONLY:
    - Summary table (check → result, plus quality grade tally if quality=true)
    - Soft issues + RED/YELLOW pages (one line each, with next-move)
    - Suggested fixes (numbered list, not applied)
    - Confirm LINT-REPORT.md was written
  """
)
```

**After:** Echo the agent's output. Then ask the user which fixes (if any) to apply — apply only on explicit confirmation. Quality dimension fixes are NEVER auto-applied — suggestions like "run /vault-challenge" cost web budget.

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

### 3. Quality (--quality flag)

Per-page health scoring on six dimensions. Composite score → traffic light. Always shown: traffic light + score + 1-2 weakest dimensions + next-move. Full dimension breakdown only with `--verbose`.

#### Six dimensions

**D1 — CITE-DENSITY**: ratio of cited claims to total claims in `## Synthesis` + `## Key facts`. Count `[label](url)` markdown links + bare `https?://` URLs in those sections. Count claim-bearing sentences (sentence-tokenize Synthesis; count Key-facts bullets directly). Ratio = sources / claims. Score: 1.0 if ratio ≥ 0.8; linear down to 0.0 at ratio = 0.

**D2 — CITE-DIVERSITY**: distinct registrable-domain count among citations. Score: 1 domain → 0.0, 2 → 0.5, ≥3 → 1.0. Catches confirmation cascades (7 citations all from one Substack ≠ 7 from 7 different places).

**D3 — NEVER-CHALLENGED**: presence of `challenged:` frontmatter field OR `## Adversarial challenge` section. Score: 1.0 if challenged within last 90 days, 0.5 if challenged ever, 0.0 if never. Direct counter to autoresearch's confirmation-bias risk.

**D4 — FRESHNESS** (volatility-scaled): time since `created` (or `ingested`, or file mtime if both missing), scaled by tag-implied volatility decay constant τ. Bucket by `tags:`:
- **HIGH** (τ = 90 days): `ai-tooling`, `llm`, `framework`, `pricing`, `benchmark`, `version`, `release`, `news`, `regulation`.
- **MEDIUM** (τ = 365 days, default): `engineering-practice`, `library`, `protocol`, `tool`, `methodology`. Also fallback when no tag matches.
- **LOW** (τ = 1825 days): `math`, `theory`, `fundamentals`, `history`, `physics`, `philosophy`, `proof`.
Score: `exp(-age_days / τ)`. A 2-year-old page on Anthropic pricing is dead; a 2-year-old page on B-trees is fine.

**D5 — INBOUND-LINKS**: distinct pages wikilinking TO this page (scan `pages/*.md` + `index.md` for `[[<this-page-slug>]]`). Score: 0 → 0.0, 1 → 0.4, 2-3 → 0.7, ≥4 → 1.0. Compounds the orphan check — `inbound = 1` is structurally lonely even if technically not an orphan.

**D6 — OPEN-Q-RESOLUTION**: of items raised in this page's `## What's still unclear` (or `## Open questions`), how many resolved? Signal sources, in priority order:
1. `integrated:` frontmatter on this page (if present).
2. `- [x] ... by [[<this-page>]]` lines in `questions.md`.
3. `INTEGRATE` entries in `log.md` referencing this page.

Score: `resolved / total`. If page raised no questions, score = neutral 0.7. If no signals available, fall back to 0.7 (degrade gracefully).

#### Composite score (default `synthesis` profile)

```
quality_score = 0.20 * D1_cite_density
              + 0.20 * D2_cite_diversity
              + 0.20 * D3_never_challenged
              + 0.15 * D4_freshness
              + 0.10 * D5_inbound_links
              + 0.15 * D6_openq_resolution
```

Range 0.0–1.0. Display ×100.

#### Traffic light grade

- **GREEN** ≥ 0.75 — healthy.
- **YELLOW** 0.50–0.74 — at least one weak dimension; flag.
- **RED** < 0.50 — fragile; flag with explicit suggestion.

Three buckets, not letter grades — actionable, not pseudo-precision.

#### `quality_profile:` frontmatter — meta-page profiles

Page can declare `quality_profile:` to select a different dimension subset + weights. When absent, infer from `source:` (`source: autoresearch` → synthesis; `source: probe` → probe, etc.) before falling back to default `synthesis`.

| Profile | D1 | D2 | D3 | D4 | D5 | D6 |
|---|---|---|---|---|---|---|
| synthesis (default) | 0.20 | 0.20 | 0.20 | 0.15 | 0.10 | 0.15 |
| reference | 0.30 | skip | 0.10 | 0.30 | 0.15 | 0.15 |
| probe | skip | skip | 0.10 | 0.30 | 0.20 | 0.40 |
| hypotheses | 0.15 | skip | 0.30 | 0.20 | 0.15 | 0.20 |
| analogies | skip | skip | 0.20 | 0.20 | 0.30 | 0.30 |
| juxtaposition | 0.10 | 0.10 | 0.20 | 0.15 | 0.25 | 0.20 |

`reference` exists for pages that legitimately cite one canonical source (paper summaries) — D2 single-source isn't a defect there.

#### Grace period — pages < 14 days old

If `now - created < 14 days`: SKIP D3 (never-challenged), D5 (inbound-links), D6 (openq-resolution) from composite. Re-weight remaining dimensions to sum to 1.0. Display "NEW (grace period)" instead of grade. Avoids penalizing fresh pages that haven't yet had time to be challenged, linked, or resolve their open questions.

#### Single-page mode (`--page <slug>`)

D5 inbound-links is N/A — exclude from composite, re-weight remaining 5 dimensions to sum to 1.0.

#### Per-flagged-page next-move (RED + YELLOW)

Pick dimension with LOWEST normalized score. Tiebreak by dimension order (D1 > D2 > ... > D6). Map:

| Weakest dim | Next move |
|---|---|
| D1 cite-density | "Ingest 2+ sources via `/vault-ingest <url>`" |
| D2 cite-diversity | "Find counter/alternative source from different publisher; `/vault-autoresearch` round 2" |
| D3 never-challenged | "Run `/vault-challenge [[<page>]]`" |
| D4 freshness | "Re-verify time-sensitive claims; `/vault-autoresearch '<topic> 2026'`" |
| D5 inbound-links | "Cross-link from `[[<topical-neighbor>]]` or merge into related page" |
| D6 openq-resolution | "Run `/vault-autoresearch` on open questions, then `/vault-integrate`" |

If 2+ dimensions below 0.3, append "(multiple weaknesses — consider full rewrite)".

#### Two-tier scan (performance)

**Tier 1 — metadata-fast (single sweep)**: parse frontmatter from every page, extract all wikilinks via `\[\[([^\]]+)\]\]`. Build graph once: `inbound_count[slug] = N`, `frontmatter[slug] = {...}`. Compute D2, D3, D4, D5 from this single pass.

**Tier 2 — content-deep**: compute D1 (sentence-tokenize Synthesis) and D6 (open-Q resolution match). Skip Tier 2 for pages already scoring GREEN > 0.85 from Tier 1.

For 50+ pages, runtime is dominated by file I/O — read pages in parallel via batched Read calls. No agent fan-out needed for v1.

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

3. **Semantic checks** (expensive, LLM). Only run if `--deep` or `--all` flag is set, OR if mechanical checks passed cleanly, OR at user's request. Default: offer to run these as a follow-up.

4. **Quality checks** (only if `--quality` or `--all`). Two-tier scan:
   - **Tier 1 metadata-fast**: single sweep over `pages/` to parse frontmatter + extract wikilinks. Build inbound-link graph. Compute D2, D3, D4, D5 for all pages.
   - **Tier 2 content-deep**: read page bodies (skip pages already GREEN > 0.85 from Tier 1). Compute D1 (sentence-tokenize Synthesis section, count cited claims) and D6 (parse open-questions section, match resolutions in `questions.md` / `log.md` / `integrated:` frontmatter).
   - For each page: select profile (`quality_profile:` frontmatter > `source:` inference > default `synthesis`). Apply grace-period skip if `now - created < 14 days`. Apply single-page re-weight if `--page` set. Compute composite. Assign GREEN/YELLOW/RED. Pick weakest dimension → next-move.

5. **Report**. Write findings to a new or appended `LINT-REPORT.md` at project root (not in pages/). Structure:

   ```markdown
   # Lint Report — <date>

   ## Summary

   <X orphans, Y ghost links, Z stale claims, AVG quality 0.68 (3 RED, 7 YELLOW, 12 GREEN)>

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

   ## Quality scores

   <only present when --quality or --all flag set>

   ### RED (N) — needs attention
   - `<page.md>` (score 0.42, profile: synthesis) — weak: D1 cite-density 0.2, D3 never-challenged.
     Next: run `/vault-challenge [[<page>]]` and ingest 2+ sources.

   ### YELLOW (N) — review when convenient
   - `<page.md>` (score 0.61, profile: synthesis) — weak: D5 inbound-links (orphan-adjacent).
     Next: cross-link from `[[<related-page>]]` if topical fit.

   ### NEW (N) — grace period (< 14 days old)
   - `<page.md>` (re-weighted score 0.71) — D3/D5/D6 skipped. Re-evaluate after 14 days.

   ### GREEN (N) — healthy
   <one-line summary, list collapsed unless --verbose>

   ## Suggested next actions

   1. ...
   2. ...
   ```

6. **Append to log.md**:
   ```
   - <timestamp> — LINT — <summary-line, includes quality tally if --quality> — see [[LINT-REPORT]]
   ```

7. **Prompt the user**: for each category of findings, ask if they want to auto-fix (e.g., add missing index entries mechanically), ignore, or defer to a human review. Quality next-moves are NEVER auto-applied — only surfaced as suggestions.

## Rules

- Do NOT delete pages automatically, ever.
- Do NOT rewrite page content to resolve contradictions — flag them and let the user decide.
- Mechanical fixes (adding a page to index.md) are OK to auto-apply only after explicit user confirmation on this lint run.
- Lint is additive: always append to log.md, never rewrite history.
- Quality scoring is REPORTING only. NEVER auto-run `/vault-challenge`, `/vault-autoresearch`, or `/vault-ingest` based on next-move suggestions — those cost web budget and require user OK.
- Quality dimension D6 OPEN-Q-RESOLUTION degrades gracefully: if no `integrated:` / `questions.md` / `log.md` signal is present, score = 0.7 neutral. Never crash on missing signals.
- Single composite output: extend `LINT-REPORT.md` with `## Quality scores`. Never create `QUALITY-REPORT.md` — single audit surface.
- Grace-period (`now - created < 14 days`) skips D3/D5/D6 — fresh pages are not yet scoreable on those.
- When `quality_profile:` frontmatter is missing, infer from `source:` (`source: autoresearch` → synthesis; `source: probe` → probe; etc.) before falling back to default `synthesis`.
