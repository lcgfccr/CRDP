# vault-lint `--quality` mode — design

Status: research-only. No implementation yet.

## 1. Context — what exists today

### 1.1 Current `vault-lint` (file: `/Users/lucafuccaro/.claude/skills/vault-lint/SKILL.md`)

Two check tiers, both STRUCTURAL:

- **Mechanical (cheap, deterministic)**, lines 50-59: orphans, missing index entries, ghost wikilinks, duplicate titles, broken external URLs (sampled), oversized pages, missing timestamps, stale `questions.md` entries (>14 days).
- **Semantic (LLM)**, lines 62-66, gated behind `--deep`: stale claims, contradictions, gaps, drift from `overview.md`.

Output: `LINT-REPORT.md` at project root (lines 89-125). Logs a one-liner to `log.md` (line 128). Never auto-fixes (line 137).

Execution: isolated subagent, brief at lines 28-44. Main thread echoes summary, asks before applying fixes.

### 1.2 Frontmatter fields available on pages

From `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md`, lines 102-110, a synthesis page has:

```
title, created, source, tags, rounds, answers
```

Plus `challenged: true` after a challenge run (line 179) — i.e. set by `--challenge` modifier in autoresearch OR by `/vault-challenge` standalone.

From `/Users/lucafuccaro/.claude/skills/vault-challenge/SKILL.md`, line 119: `challenged: <ISO-8601 date>` is added/updated on the page after a challenge.

There is no current `integrated:` field documented in vault-autoresearch or vault-challenge — but the user's task brief implies it exists or should exist, set by `/vault-integrate`. Treat as expected-or-infer: if absent, downgrade signal weight, do not crash.

### 1.3 Page sections that matter for quality

- `## Synthesis` (autoresearch line 114) — the load-bearing prose.
- `## Key facts` (line 118) — bullet list, each cited.
- `## Tensions & contradictions` (line 122) — internal disagreements surfaced.
- `## What's still unclear` (line 126) — open questions, also pushed to `questions.md`.
- `## Related` (line 130) — wikilink graph.
- `## Adversarial challenge` (challenge line 100, autoresearch line 167) — held / weakened / unfalsified buckets.

### 1.4 nvk/llm-wiki librarian — prior art

From the public docs (sources at end), the `/wiki:librarian` pattern:

- **Two-tier scan**: metadata-fast pass first, content-deep pass after. Checkpoint recovery between tiers.
- **Quality factors**: source diversity, content depth, cross-reference density, summary quality.
- **Staleness**: exponential decay scaled by article volatility (breaking-news topics decay faster than foundational ones).
- **Output**: machine-readable `.librarian/scan-results.json` + human-readable `REPORT.md`.
- **Invocations**: full scan / `--article <path>` single / `report` (display latest).

Lessons to steal:
1. **Two-tier** is the right shape — cheap metadata pass enumerates targets, expensive content pass scores.
2. **Volatility-scaled staleness** beats fixed-age cutoff. Tags can encode volatility class.
3. **Dual output** (JSON + Markdown) lets future tools consume scores without re-parsing.
4. **Single-page mode** (`--article`) is essential for fast iteration on one page.

Lessons to skip:
- Their "summary quality" is too LLM-judgment-soft for v1 — prefer structural signals first.

## 2. Quality dimensions to score

Six dimensions. All cheap to compute except CITE-DIVERSITY and OPEN-Q-RESOLUTION (require LLM judgment on a small slice). All have a fallback when frontmatter is missing.

### D1 — Citation density (CITE-DENSITY)

- **What**: ratio of cited claims to total claims in `## Synthesis` + `## Key facts`.
- **Method**: count `[label](url)` markdown links + bare `https?://` URLs in those sections. Count claim-bearing sentences (sentence-tokenize Synthesis; count Key-facts bullets directly). Ratio = sources / claims.
- **Score**: 1.0 if ratio ≥ 0.8; linear down to 0 at ratio = 0.
- **Why it matters**: a synthesis with 5 paragraphs and 1 link is weakly grounded.

### D2 — Citation diversity (CITE-DIVERSITY)

- **What**: distinct domain count among citations, AND distinct-author / distinct-publisher count when extractable.
- **Method**: regex extract domains from URLs; bucket by registrable domain (e.g. `arxiv.org`, `github.com`). Score:
  - `domains == 1` → 0.0 (single-source synthesis = brittle)
  - `domains == 2` → 0.5
  - `domains >= 3` → 1.0
- **Why it matters**: 7 citations all from one Substack ≠ 7 from 7 different places. Catches confirmation cascades.

### D3 — Confirmation-only flag (NEVER-CHALLENGED)

- **What**: has the page ever been adversarially tested?
- **Method**: presence of `challenged:` field in frontmatter (or `## Adversarial challenge` section).
- **Score**: 1.0 if challenged within last 90 days, 0.5 if challenged ever, 0.0 if never.
- **Why it matters**: Popper-shaped vault — pages that survived `/vault-challenge` are trustworthier than untested ones. Direct counter to the autoresearch confirmation-bias risk noted at challenge SKILL line 9.

### D4 — Age vs domain volatility (FRESHNESS)

- **What**: time since `created` (or `ingested`), scaled by tag-implied volatility.
- **Method**: classify the page's `tags:` into a volatility bucket:
  - **HIGH-volatility** (decay τ = 90 days): `ai-tooling`, `llm`, `framework`, `pricing`, `benchmark`, `version`, `release`, `news`, `regulation`.
  - **MEDIUM-volatility** (τ = 365 days): `engineering-practice`, `library`, `protocol`, `tool`, `methodology`.
  - **LOW-volatility** (τ = 1825 days): `math`, `theory`, `fundamentals`, `history`, `physics`, `philosophy`, `proof`.
  - **Default if no tag matches**: MEDIUM.
- **Score**: `exp(-age_days / τ)` (exponential decay, mirrors librarian).
- **Why it matters**: a 2-year-old page on Anthropic pricing is dead; a 2-year-old page on B-trees is fine.

### D5 — Graph integration (INBOUND-LINKS)

- **What**: how many other pages wikilink TO this page.
- **Method**: scan `pages/*.md` and `index.md` for `[[<this-page-slug>]]`. Count distinct sources.
- **Score**: capped log scale. `0 inbound` → 0.0, `1` → 0.4, `2-3` → 0.7, `4+` → 1.0.
- **Why it matters**: orphan-shaped pages are already caught by mechanical lint, but a page with `inbound = 1` is structurally lonely even if technically not an orphan. Compounds the existing orphan check.

### D6 — Open-questions resolution rate (OPEN-Q-RESOLUTION)

- **What**: of the items this page raised in its `## What's still unclear` section (or `## Open questions`), how many have been resolved by later integrations?
- **Method**:
  1. Parse the page's open-questions section.
  2. For each question, check `questions.md` for a matching `- [x]` line referencing this page (string match on the question text, or `from QUERY "<original>"` lineage if available).
  3. Also check if any later page's frontmatter has `integrated: [[<this-page-slug>]]` or if `log.md` has an `INTEGRATE` entry naming this page.
- **Score**: `resolved / total`. If page raised no questions, score = neutral 0.7 (don't penalize, don't reward).
- **Why it matters**: a page that raised 5 questions and resolved 0 has stagnated. A page that resolved 4/5 is compounding.
- **Edge**: requires integrated frontmatter or log entries that may not exist yet — degrade gracefully (treat unknown as 0.7 neutral).

### Dimensions explicitly NOT in v1

- **Summary robustness** (llm-wiki has it) — too soft, defer to v2.
- **Reading-level / clarity** — out of scope, this is a research vault not a publication.
- **Cross-reference correctness** (do wikilinks point to topically relevant pages?) — semantically expensive and overlaps with `vault-lint --deep` contradiction check.

## 3. Scoring — composite + grade

### 3.1 Per-page composite

Weighted sum, weights tuned by signal strength and cost:

```
quality_score = 0.20 * D1_cite_density
              + 0.20 * D2_cite_diversity
              + 0.20 * D3_never_challenged
              + 0.15 * D4_freshness
              + 0.10 * D5_inbound_links
              + 0.15 * D6_openq_resolution
```

Range: 0.0–1.0. Multiply by 100 for display.

### 3.2 Grade — traffic light, NOT letters or fine-grained 0-100

- **GREEN** ≥ 0.75 — page is healthy.
- **YELLOW** 0.50–0.74 — page has at least one weak dimension; flag.
- **RED** < 0.50 — page is fragile; flag with explicit suggestion.

Rationale for traffic-light over letter grades: actionable buckets, not pseudo-precision. Three states match the user's existing decision granularity (ignore / fix later / fix now).

### 3.3 Display

Always show:
1. Overall traffic light + composite score.
2. The 1–2 dimensions that pulled it down (the *reason* for the color).
3. The next-move suggestion (see §6).

Never show a 6-dimension breakdown by default — too noisy. Add `--verbose` flag for full per-dimension dump.

## 4. Output — extend existing `LINT-REPORT.md`

**Decision: single file, new section. Do NOT create `QUALITY-REPORT.md`.**

Rationale:
- `LINT-REPORT.md` is the existing user-facing artifact (vault-lint SKILL line 89). Splitting reports forces users to track two files.
- Quality dimensions are part of "vault health". Same audit, new lens.
- The mechanical/semantic split inside the report (line 98 / line 109) sets the precedent for adding a third lens.

### 4.1 Report structure with quality added

```markdown
# Lint Report — <date>

## Summary

<X orphans, Y ghost links, Z stale claims, AVG quality 0.68 (3 RED, 7 YELLOW, 12 GREEN)>

## Mechanical issues
... (existing)

## Semantic issues
... (existing)

## Quality scores

### RED (N) — needs attention
- `<page.md>` (score 0.42) — weak: D1 cite-density 0.2, D3 never-challenged.
  Next: run `/vault-challenge [[<page>]]` and ingest 2+ sources.

### YELLOW (N) — review when convenient
- `<page.md>` (score 0.61) — weak: D5 inbound-links (orphan-adjacent).
  Next: cross-link from `[[<related-page>]]` if topical fit.

### GREEN (N) — healthy
<one-line summary, list collapsed by default unless --verbose>

## Suggested next actions
... (existing, now incorporates quality)
```

### 4.2 Machine-readable sidecar (optional v2)

`.lint/quality-scores.json`:

```json
{
  "scanned_at": "2026-04-23T...",
  "pages": [
    {
      "slug": "oauth2-pkce",
      "score": 0.42,
      "grade": "RED",
      "dimensions": {
        "cite_density": 0.2,
        "cite_diversity": 0.5,
        "never_challenged": 0.0,
        "freshness": 0.8,
        "inbound_links": 0.4,
        "openq_resolution": 0.7
      },
      "next_move": "Run /vault-challenge then ingest 2+ sources"
    }
  ]
}
```

Defer to v2. v1 is markdown-only. Justification: keeps shipping surface small; nothing currently reads JSON output.

## 5. Invocation — flag matrix

Today: `/vault-lint` (mechanical) and `/vault-lint --deep` (mechanical + semantic).

Proposed flag matrix:

| Invocation | Mechanical | Semantic | Quality |
|---|---|---|---|
| `/vault-lint` | yes | no | no |
| `/vault-lint --deep` | yes | yes | no |
| `/vault-lint --quality` | yes | no | yes |
| `/vault-lint --all` | yes | yes | yes |

Rationale:
- `--quality` standalone is fast (mechanical pass already enumerates pages; quality reuses that pass).
- `--all` is the explicit kitchen-sink invocation.
- Mechanical always runs — it is cheap and feeds the page list everything else needs.
- `--deep` and `--quality` are orthogonal modifiers, composable with `--all` shorthand.

Additional flags:
- `--page <slug>` → quality scan for ONE page only (mirrors llm-wiki `--article <path>`). Skips graph-wide checks like D5 inbound-links — note that D5 is N/A for single-page mode and exclude from composite (re-weight remaining 5 dimensions).
- `--verbose` → full per-dimension breakdown, list GREEN pages, dump JSON sidecar.

Reject: `--report` (display-latest mode like llm-wiki). User can just `cat LINT-REPORT.md` — adds no value over reading the file.

## 6. Actionable output — one-line "next move"

Each flagged page (RED + YELLOW) MUST get one suggestion. Map weakest dimension → action:

| Weakest dimension | Next move |
|---|---|
| D1 cite-density low | "Ingest 2+ sources via `/vault-ingest <url>`" |
| D2 cite-diversity low (single domain) | "Find counter/alternative source from different publisher; `/vault-autoresearch` round 2" |
| D3 never-challenged | "Run `/vault-challenge [[<page>]]`" |
| D4 freshness low (stale) | "Re-verify time-sensitive claims; `/vault-autoresearch '<topic> 2026'`" |
| D5 inbound-links low | "Cross-link from `[[<topical-neighbor>]]` or merge into related page" |
| D6 openq-resolution low | "Run `/vault-autoresearch` to pick up open questions, then `/vault-integrate`" |

Pick the dimension with the LOWEST normalized score. Tiebreak by dimension order (D1 > D2 > ... > D6 — D1 is the most fundamental).

If 2+ dimensions are below 0.3, append "(multiple weaknesses — consider full rewrite)".

## 7. Agent execution model — match existing pattern

Follows the existing vault-lint subagent shape (SKILL lines 28-44). Modifications:

**Before spawning (main context):**
1. Resolve slug (existing).
2. Parse flags: `--quality`, `--deep`, `--all`, `--page <slug>`, `--verbose`.
3. If `--page <slug>`, verify the page exists.

**Spawn brief** — extend existing prompt:

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
    - Summary table (check → result, plus quality grade tally)
    - Soft issues + RED/YELLOW pages (one line each, with next-move)
    - Suggested fixes (numbered list, not applied)
    - Confirm LINT-REPORT.md was written
  """
)
```

**After:** unchanged — echo agent output, ask for fix confirmation. Quality dimension fixes are NEVER auto-applied (per existing rule, SKILL line 137) — this matters more here since suggestions like "run /vault-challenge" cost web budget.

## 8. Edge cases

### 8.1 Brand-new pages

A page created today has:
- D4 freshness = 1.0 (perfect).
- D3 never-challenged = 0.0 (correct — it hasn't been challenged yet).
- D5 inbound-links = 0.0 likely (just created, nothing links to it).
- D6 openq-resolution = neutral (just opened the questions, unfair to score).

Result: a fresh, well-cited page can land at ~0.55 = YELLOW, which is wrong noise.

**Fix**: grace period. If `now - created < 14 days`, skip D3 / D5 / D6 from composite, re-weight D1 + D2 + D4 to sum to 1.0. Display "NEW (grace period)" instead of grade.

### 8.2 Reference pages (legitimately one citation)

A page that just records a single canonical reference (e.g. a paper summary) has D1=high but D2=low by design.

**Fix**: page can declare `quality_profile: reference` in frontmatter. When set, skip D2 entirely from composite. Document this escape hatch in the SKILL. Cost: an additional frontmatter field — but cheap, opt-in.

### 8.3 Meta-pages — different criteria

The vault has structurally different page types (visible in available skills):
- **probe** pages (from `/vault-probe`) — gap inventories, no synthesis to ground.
- **hypotheses** pages (from `/vault-hypothesize`) — testable assertions, citations are a feature not a bug but density is naturally lower.
- **analogies** pages (from `/vault-analogize`) — cross-domain mappings; "claims" are structural pattern matches not factual assertions.
- **synthesize** pages (from `/vault-synthesize`) — juxtaposition, citations point inward to other pages, not outward to web sources.

**Fix**: `quality_profile` frontmatter field with values `synthesis` (default), `reference`, `probe`, `hypotheses`, `analogies`, `juxtaposition`. Each profile selects a different dimension subset + weighting:

| Profile | D1 | D2 | D3 | D4 | D5 | D6 |
|---|---|---|---|---|---|---|
| synthesis (default) | 0.20 | 0.20 | 0.20 | 0.15 | 0.10 | 0.15 |
| reference | 0.30 | skip | 0.10 | 0.30 | 0.15 | 0.15 |
| probe | skip | skip | 0.10 | 0.30 | 0.20 | 0.40 |
| hypotheses | 0.15 | skip | 0.30 | 0.20 | 0.15 | 0.20 |
| analogies | skip | skip | 0.20 | 0.20 | 0.30 | 0.30 |
| juxtaposition | 0.10 | 0.10 | 0.20 | 0.15 | 0.25 | 0.20 |

When profile field absent, infer from `source:` frontmatter (`source: autoresearch` → synthesis; `source: probe` → probe, etc.) before falling back to default.

### 8.4 `integrated:` frontmatter not yet present

The user's brief mentions `integrated:` but vault-autoresearch / vault-integrate skills don't currently document writing it.

**Fix**: D6 OPEN-Q-RESOLUTION uses three signal sources in priority order:
1. `integrated:` frontmatter on this page (if present).
2. `- [x] ... by [[<this-page>]]` lines in `questions.md`.
3. `INTEGRATE` entries in `log.md` referencing this page.

If none present, score = 0.7 neutral. Recommend the implementation pass also adds `integrated: <date>` to vault-integrate's writeback (separate skill change).

### 8.5 `tags:` missing or empty

D4 volatility classification falls through to MEDIUM (τ=365). Page still scored, just with default decay.

### 8.6 `created:` missing

Mechanical lint already flags this (SKILL line 58). For D4, fall back to `mtime` of the file. If still unknown, skip D4 from composite.

## 9. Performance — 50+ pages

### 9.1 Cost model per dimension

| Dim | Per-page cost | Notes |
|---|---|---|
| D1 cite-density | regex + sentence-tokenize | cheap, ~1ms each |
| D2 cite-diversity | URL parse | cheap |
| D3 never-challenged | frontmatter read | cheap |
| D4 freshness | date math + tag lookup | cheap |
| D5 inbound-links | full-vault grep ONCE for each page | naive O(N²); see optimization |
| D6 openq-resolution | section parse + questions.md lookup + maybe LLM-fuzzy match | mid; LLM only on ambiguity |

### 9.2 Optimization — single-pass graph build

Two-tier scan, librarian-style:

**Tier 1 — metadata-fast (single sweep over `pages/`)**:
- Parse frontmatter from every page.
- Extract all wikilinks via `\[\[([^\]]+)\]\]` regex per page.
- Build the graph once: `inbound_count[slug] = N`, `frontmatter[slug] = {...}`.
- Compute D2, D3, D4, D5 for all pages from this single pass.

**Tier 2 — content-deep (only for pages whose tier-1 score is borderline OR forced by `--verbose`)**:
- Compute D1 (sentence tokenization).
- Compute D6 (open-questions resolution match — may need fuzzy matching).
- Skip Tier 2 for pages already scoring GREEN > 0.85 from Tier 1.

This is how llm-wiki's two-tier pattern saves cost.

### 9.3 Parallelism

Page scoring is embarrassingly parallel after the graph is built (Tier 2 has no cross-page dependencies). For 50+ pages, the runtime is dominated by file I/O, not LLM calls — Claude can read pages in parallel via batched Read calls. No agent fan-out needed for v1; if vault crosses ~200 pages, consider sharding into 4 parallel sub-subagents over slug-prefix ranges.

### 9.4 Checkpoint recovery (defer to v2)

Librarian has it; vault-lint does not need it for v1 since 50-200 pages completes in seconds. Add only if scans regularly hit the agent step limit.

## 10. Recommendation — minimum viable v1

### Ship first (v1)

1. Six dimensions (D1-D6), all computed via the two-tier scan.
2. Composite score + traffic light (GREEN / YELLOW / RED).
3. Default `synthesis` profile + `quality_profile` frontmatter override (with the 6 documented profiles).
4. Extend `LINT-REPORT.md` with new `## Quality scores` section. No JSON sidecar yet.
5. Three flags: `--quality`, `--all`, `--page <slug>`.
6. Per-flagged-page next-move suggestion.
7. Grace period for pages < 14 days old.
8. Volatility tag-buckets (HIGH/MEDIUM/LOW) defined explicitly in the SKILL.

Implementation surface: ~80 new lines in `vault-lint/SKILL.md`, no new files.

### Defer to v2

1. JSON sidecar (`.lint/quality-scores.json`).
2. `--verbose` flag with full dimension breakdown.
3. Checkpoint recovery for very large vaults.
4. Subagent fan-out at >200 pages.
5. LLM-judged "summary robustness" dimension.
6. Auto-applying mechanical fixes from quality output (e.g. cross-linking suggestions). Today these stay confirmation-gated.
7. Update `vault-integrate` to write `integrated:` frontmatter (tracked separately, unblocks D6 from neutral fallback).

### Why this is the right v1 cut

- Six dimensions span structural + temporal + adversarial + graph + question-loop signals — broad enough to be useful, narrow enough to fit one report section.
- Reusing `LINT-REPORT.md` keeps the user's audit surface single-file.
- Profile escape hatch handles meta-pages (probe / hypotheses / analogies) without forking the skill.
- All scoring is deterministic except D6 fuzzy-match — no LLM-judgment-soft scores in the composite.
- Mirrors llm-wiki's two-tier shape — proven pattern, no novelty risk on the hot path.
- Caveman: ship six knobs and a traffic light; iterate from real scan output.

---

## Sources

- vault-lint SKILL: `/Users/lucafuccaro/.claude/skills/vault-lint/SKILL.md` (lines 50-66 check categories, 89-125 report format, 28-44 spawn brief, 137 no-auto-fix rule).
- vault-challenge SKILL: `/Users/lucafuccaro/.claude/skills/vault-challenge/SKILL.md` (line 119 `challenged:` frontmatter, line 100 section format).
- vault-autoresearch SKILL: `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md` (lines 102-110 frontmatter fields, 114-132 page structure, 167-179 challenge frontmatter).
- nvk/llm-wiki librarian command: [nvk/llm-wiki](https://github.com/nvk/llm-wiki), [llm-wiki.net](https://llm-wiki.net/) — two-tier scan, exponential-decay staleness scaled by volatility, source-diversity / depth / cross-ref / summary quality dimensions, dual JSON+Markdown output, `--article` single-page mode, checkpoint recovery.
