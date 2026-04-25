# /vault-output — Design Doc

Research only. No implementation. Target ship: v1.0.4 (minimum) → v1.0.5+ (deferred).

## 1. Goal & framing

`/vault-output` produces consumer-grade artifacts from existing vault pages. Pure synthesis — no WebSearch, no WebFetch. Reuses what is already in `pages/`. Different from existing skills:

| Existing skill | Direction | Output |
|---|---|---|
| `/vault-autoresearch` | external → vault | new research page (web sources) |
| `/vault-ingest` | external → vault | new wiki page (one source) |
| `/vault-synthesize` | vault → vault | new wiki page (cross-page connections) |
| `/vault-integrate` | vault → vault | edits source pages (folds research back) |
| **`/vault-output`** | **vault → external** | **artifact for human consumption** |

Position: this is the only skill that emits artifacts intended to leave the vault — shareable docs, study material, briefings. Other skills accumulate; this one ships.

Inspiration: nvk/llm-wiki `/wiki:output <type>` (verified via WebFetch of the repo README — supports `summary, report, study-guide, slides, timeline, glossary, comparison`, files outputs to `output/` subdirectory, `--retardmax` flag for rough-but-fast).

## 2. Output formats

### 2.1 Format taxonomy

llm-wiki ships seven types. Score each for v1 inclusion based on (a) value vs existing skills, (b) implementation complexity, (c) likely user demand.

| Format | Value | Complexity | v1? | Reasoning |
|---|---|---|---|---|
| **report** | high | low | YES | Executive summary + findings + recommendations. Universal. Trivial to template. |
| **study-guide** | high | medium | YES | Q&A flashcards + key terms + summary. Distinct from any existing skill. |
| **comparison** | high | medium | YES | Side-by-side matrix. Common ask. Needs ≥ 2 pages. |
| **timeline** | medium | medium | YES | Chronological narrative. Strong if pages have dates/events; weak if not. Include because it's cheap. |
| **glossary** | medium | low | YES | Term definitions extracted from pages. Trivial. Could become canonical reference. |
| summary | low | trivial | NO | Subsumed by `report --style brief`. Drop to avoid duplication. |
| slides | low | high | NO | Markdown → slide deck framework choice (Marp? reveal.js? PDF?) is its own rabbit hole. Defer to v1.0.5+. Could ship as Marp markdown later. |

**v1 set: report, study-guide, comparison, timeline, glossary.**

Drop `summary` (overlap with brief-style report). Defer `slides` (deck format is a separate concern).

### 2.2 Format specifications

Each format = a deterministic template the agent fills. Specs below.

#### report

```markdown
---
title: Report — <topic> — <date>
created: <ISO date>
source: vault-output
format: report
style: <brief|standard|detailed>
inputs: [<page-slug-1>, <page-slug-2>, ...]
---

# Report: <topic>

## Executive summary
<3-5 sentences. The headline finding. What a reader gets in 30s.>

## Background
<2-3 paragraphs: what the topic is, why it matters, scope of the report.>

## Findings
- **<finding 1>** — <evidence, cite [[page-slug]]>
- **<finding 2>** — ...

## Tensions / open questions
<unresolved disagreements across the input pages, gaps that remain.>

## Recommendations
<actionable bullet points. Ban platitudes — must be concrete.>

## Sources
- [[page-slug-1]] — <one-line on what it contributed>
- ...
```

Style modifiers (brief / standard / detailed) tune section length, NOT structure. Brief = 1-page total. Standard = 2-3 pages. Detailed = no cap, full evidence per finding.

#### study-guide

```markdown
---
title: Study guide — <topic> — <date>
format: study-guide
inputs: [...]
---

# Study guide: <topic>

## Overview
<3-5 sentence orientation.>

## Key concepts
- **<term>** — <definition pulled from pages>
- ...

## Core questions
**Q: <question>**
A: <answer with [[page-slug]] citations>

**Q: <next question>**
A: ...

## Common pitfalls
<misconceptions or failure modes the pages flag.>

## Further reading
- [[page-slug]] — <what to look for there>
```

Distinct from glossary because it has Q&A and pitfalls. Distinct from report because it is for learners, not decision-makers.

#### comparison

```markdown
---
title: Comparison — <items> — <date>
format: comparison
inputs: [page-a, page-b, ...]
---

# Comparison: <A> vs <B> [vs <C>]

## At a glance

| Dimension       | <A>          | <B>          | <C>          |
|-----------------|--------------|--------------|--------------|
| <dimension 1>   | ...          | ...          | ...          |
| <dimension 2>   | ...          | ...          | ...          |

## Where they agree
<bullets of shared properties.>

## Where they differ
<each substantive difference, with which page each side is from.>

## When to pick which
- Pick <A> when <condition>
- Pick <B> when <condition>

## Sources
- [[page-a]]
- [[page-b]]
```

Hard requires ≥ 2 input pages. Auto-suggests dimensions by pulling section headings shared across input pages; user can override via `--dimensions "perf,security,cost"`.

#### timeline

```markdown
---
title: Timeline — <topic> — <date>
format: timeline
inputs: [...]
---

# Timeline: <topic>

<one-paragraph framing.>

## <YYYY> or <era>
- **<event>** — <description, [[page-slug]]>

## <YYYY> or <era>
- ...

## Key transitions
<2-3 paragraphs naming the inflection points and what changed.>

## Open dating questions
<events the vault places imprecisely or contradicts on. List them.>
```

Weak if input pages lack dates. Skill must detect this in pre-check (see edge cases) and warn before producing.

#### glossary

```markdown
---
title: Glossary — <scope> — <date>
format: glossary
inputs: [...]
---

# Glossary: <scope>

## A
- **Term** — definition. From [[page-slug]].

## B
...
```

Alphabetical. Each term cites the page where it is defined. If multiple pages define the same term differently, list both definitions and flag it as a tension.

## 3. Invocation syntax

```
/vault-output <format> [scope-flags] [style-flags]
```

### 3.1 Format (positional, required)

`report | study-guide | comparison | timeline | glossary`

If omitted, abort with the list. (Mirrors llm-wiki's positional `<type>`.)

### 3.2 Scope flags (one of)

- `--topic "<theme>"` — semantic match across pages (Claude judgement). Like `/vault-hypothesize --topic`.
- `--tag <tag>` — frontmatter tag filter. Like `/vault-hypothesize --tag`.
- `--pages [[a]] [[b]] [[c]]` — explicit page list. Like `/vault-synthesize`.
- (none) — whole vault. Allowed for `glossary` and `timeline`. **Disallowed** for `comparison` (always needs ≥ 2 explicit or semantic match). Allowed-with-warning for `report` and `study-guide` (whole-vault report tends to be mush).

Only one scope flag per run. If both `--topic` and `--tag` passed, abort (mirrors hypothesize rule).

### 3.3 Style flags

- `--style brief|standard|detailed` (default: standard). Controls length, not structure.
- `--title "<custom>"` — override auto-generated title. (Mirrors synthesize.)
- `--dimensions "a,b,c"` — comparison-only. Pre-specify matrix dimensions; otherwise agent infers.
- `--rough` — analog of llm-wiki `--retardmax`. Skip the polish pass; ship comprehensive draft. Useful for fast iteration.

### 3.4 Examples

```
/vault-output report --topic "JWT key rotation"
/vault-output study-guide --tag jwt --style detailed
/vault-output comparison --pages [[jwt-refresh-tokens]] [[jwt-signing-key-rotation-cadence]]
/vault-output timeline --tag jwt
/vault-output glossary --tag jwt
/vault-output report --topic "auth" --rough
```

## 4. Output location

Two options. Argue both, then pick.

### Option A: dedicated `outputs/` directory

```
projects/<slug>/
├── pages/
├── raw/
└── outputs/        ← new
    ├── report-jwt-key-rotation-2026-04-23.md
    ├── study-guide-jwt-2026-04-23.md
    └── ...
```

**Pro:**
- Clear semantic separation: `pages/` = vault knowledge, `outputs/` = artifacts derived from it.
- Easy to gitignore / .obsidianignore if user wants Obsidian to skip them (most likely path).
- `/vault-lint` can ignore them by default — they are not vault content, they are exports.
- Mirrors llm-wiki's `output/` directory choice (verified in their architecture diagram).
- Easy to nuke and regenerate without losing knowledge.

**Con:**
- Adds a new top-level directory the SessionStart hook, lint, and other skills must learn about.
- Wikilinks `[[report-...]]` from inside outputs to `pages/` work fine in Obsidian (Obsidian resolves slugs across the vault), but pages → outputs links need the directory prefix or risk breaking.

### Option B: in `pages/` tagged `output`

```
projects/<slug>/pages/
├── jwt-introduction.md
├── jwt-refresh-tokens.md
├── report-jwt-key-rotation-2026-04-23.md  ← tag: [output, report]
└── ...
```

**Pro:**
- Zero new infra. Existing index, log, lint, hot-cache, hooks all just work.
- Outputs are already wiki pages, nothing special needed.
- Existing precedent: `hypotheses-<date>.md` and `analogies-<src>-<date>.md` already live in `pages/` as derived artifacts.

**Con:**
- Pollutes the page namespace. After 20 reports the `pages/` directory is mostly artifacts, not knowledge.
- Lint / hot-cache distillation has to filter them out everywhere.
- Conceptually wrong: outputs are ephemeral exports, not durable knowledge that should compound.

### Pick: Option A — dedicated `outputs/` directory.

Reasoning: outputs ARE conceptually different from pages. Pages compound (lint, integrate, hot-cache, hypothesize all build on them). Outputs ship and are forgotten or regenerated. Conflating the two muddles the model. The infra cost (one new dir, lint exclusion rule) is small. The precedent of `hypotheses-*.md` and `analogies-*.md` living in `pages/` is misleading — those ARE durable knowledge artifacts that feed back into the system (questions.md, /vault-challenge picks them up). Outputs do not feed back; they leave.

**Implementation note**: ensure `vault-init` is updated to mkdir `outputs/`. Existing projects without `outputs/` get it auto-created on first `/vault-output` run.

Add `outputs/` to the project's `.obsidianignore` line — same pattern as `raw/`. Outputs are exports, not graph content. (User can flip this off if they want them in Obsidian.)

## 5. Agent execution model

Matches the established pattern (synthesize, hypothesize, analogize). Main context resolves slug + parses args, spawns general-purpose Agent, echoes compact result.

### 5.1 Before spawning (main context)

1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse positional `<format>`. If missing or not in allowed set, abort with usage string.
3. Parse scope flag (`--topic` / `--tag` / `--pages` / none). Reject conflicts.
4. Parse `--style`, `--title`, `--dimensions`, `--rough`.
5. Resolve scope to a concrete page set:
   - `--pages`: strip `[[]]`, verify each exists at `pages/<slug>.md`, abort listing missing.
   - `--tag`: enumerate `pages/*.md` (exclude derived: `hypotheses-*`, `analogies-*`, `probe-*`), filter by frontmatter tag.
   - `--topic`: enumerate same, defer semantic filter to agent (cheaper, agent already reading content).
   - none: enumerate all (with derived excluded).
6. Edge-case checks (see §6 below). Abort or warn as specified.
7. Mkdir `outputs/` if not present. Compute output filename: `<format>-<slug>-<YYYY-MM-DD>.md` (slug from `--title` or auto-derived).
8. If output file already exists, ask user: overwrite, v2, rename. Never silent overwrite. (Same rule as synthesize/hypothesize.)
9. Spawn agent.

### 5.2 Spawn

```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-output for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Format: <report | study-guide | comparison | timeline | glossary>
    Scope: <pages: [...] | tag: <tag> | topic: "<theme>" | whole-vault>
    Style: <brief | standard | detailed>
    Custom title (if passed): "<title>" or none
    Rough mode: <true | false>
    Dimensions (comparison only, if passed): <"a,b,c"> or none
    Output path: outputs/<filename>.md
    Mode: <first-run | overwrite | v2>

    Follow the full procedure in the vault-output skill. Return ONLY:
    - Output path written
    - One-sentence description of artifact contents
    - N input pages used
    - Any flags raised (e.g., timeline with no dates, comparison with high overlap)
  """
)
```

### 5.3 After

Echo agent's compact result verbatim. Add nothing.

### 5.4 Agent procedure (high level)

1. Resolve final input page set (apply `--topic` semantic filter if present).
2. Read each input page fully — frontmatter, Summary, Key facts, Tensions, Open questions, body.
3. Apply format-specific extraction:
   - **report**: pull findings from Key facts across pages, tensions from Tensions sections, recommendations distilled.
   - **study-guide**: pull definitions from page intros, synthesize Q&A from open questions + their cross-page answers, pitfalls from Tensions / "Common pitfalls" sections.
   - **comparison**: identify shared dimensions (sections that appear in both pages, or `--dimensions` override), fill matrix.
   - **timeline**: extract dated claims (`(YYYY)`, `since YYYY-MM`, year mentions). Sort. Group by era if span > 5 years.
   - **glossary**: extract bold terms, defined terms, key concepts. Dedupe; flag conflicts.
4. Apply style modifier (brief / standard / detailed) — adjust section length budgets.
5. Write to `outputs/<filename>.md`.
6. Append to `log.md`: `<ts> — OUTPUT — <format> — outputs/<filename>.md ← N pages — scope: <description>`
7. **Do NOT** write to `index.md` by default — outputs are exports. (Open question: optional `--index` flag to opt in. Defer to v1.0.5+.)
8. Return compact summary.

## 6. Edge cases

| Case | Handling |
|---|---|
| Empty vault (0 pages) | Abort: "vault-output needs ≥ 1 page. Run `/vault-ingest` or `/vault-autoresearch` first." |
| Single page in scope | `report`/`study-guide`/`glossary`: allowed, but warn "single page — consider `/vault-query` for Q&A or just read the page." `comparison`: hard abort, "needs ≥ 2 pages." `timeline`: allowed only if page has ≥ 3 dated claims, otherwise warn. |
| Scope yields 0 pages | Abort with the concrete filter that filtered to 0: "tag `jwt` matched 0 pages — drop tag or pick another." |
| Comparison input pages near-identical | Warn: "input pages overlap heavily — comparison will be thin." Mirror synthesize's warning. |
| Timeline input pages have no dates | Detect during pre-check by grepping for date patterns. If < 3 dated claims across pool, warn before spawning: "no dates found — timeline will degrade to a chronologically-ambiguous list." Allow user to proceed or pick another format. |
| Output file already exists | Ask: overwrite, v2, rename. (Same as synthesize / hypothesize.) |
| Format mismatch (e.g., glossary scope yielded zero terms) | Agent reports honestly in output (`## Notes — no terms extracted, glossary empty`) and in compact result. Do NOT fabricate. |
| `--pages` includes a derived page (`hypotheses-*`, `analogies-*`) | Allow but warn: "input includes derived artifact `hypotheses-<date>` — output may be circular." |
| Whole-vault scope on a 50+ page vault | Warn before spawning: "whole-vault `<format>` over N pages will be unfocused. Confirm or pass `--tag` / `--topic` to narrow." |

## 7. Index / log integration

- **`index.md`**: do NOT auto-add output entries. Index is a catalog of vault knowledge; outputs are exports. Adding them clutters the index. (Compare: `analogies-*.md` and `hypotheses-*.md` ARE listed in index because they are durable derived knowledge. Outputs are not.)

  Defer: optional `--index` flag (v1.0.5+) for users who want outputs surfaced in their session-start context.

- **`log.md`**: yes, log every output. Format:
  ```
  - <ts> — OUTPUT — <format> — outputs/<filename>.md ← N pages — scope: <description>
  ```
  Lets `/vault-lint` and `gsd-progress`-style overviews see what was produced when.

- **`questions.md`**: outputs are read-only on the vault. They do NOT append new gaps. (If the agent identifies new gaps while writing, surface them in the compact result for the user to decide whether to `/vault-query` and let questions.md fill normally.)

- **Hot cache**: outputs do NOT enter `.hot-cache.md`. Cache is for vault knowledge that loads at session start; outputs are not knowledge.

- **Cross-linking**: outputs DO wikilink to source pages (`[[page-slug]]` references in Sources / Citations sections — Obsidian resolves these even from `outputs/`). Source pages do NOT get back-links to outputs — outputs are derivative, source pages are the canon.

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Hallucinated content** — agent fabricates findings not in source pages | high | Format templates demand citations per finding (`<finding> — [[page-slug]]`). Add a rule: every non-trivial claim in the output must trace to an input page wikilink. Agent prompt enforces it. Lint pass (deferred) could verify. |
| **Stale outputs** — source pages updated after output produced; output drifts out of sync | medium | Output frontmatter records `inputs: [<slug>, ...]` and `created: <date>`. `/vault-lint` (extension, deferred) flags outputs whose input pages have `mtime` newer than output's `created`. Quick win. |
| **Format drift** — different runs produce subtly different report structures | low | Templates in §2.2 are explicit. Agent prompt includes format spec verbatim. Style flags (`--style`) are the only sanctioned axis of variation. |
| **Comparison forced over near-identical pages** | medium | Pre-check detects high overlap (shared tag set + similar title stems), warns before spawning. (Mirrors synthesize's existing rule.) |
| **Timeline produces fake dates** when sources are date-poor | medium | Pre-check counts dated claims; if < 3, refuses or warns. Agent must not infer dates from context — only explicit claims. Frontmatter rule: timeline frontmatter includes `dated_claims: <N>` so user sees evidence density. |
| **Glossary conflicts** — same term defined inconsistently across pages | low | Glossary spec (§2.2) requires listing all definitions and flagging it as a tension. Failure mode is benign — surface, don't paper over. |
| **Outputs leak sensitive content** if the user shares the file externally | low → user-facing | Outputs are derived from vault, which is on user's own machine; not a tooling problem. But: add a one-line note in `vault-help` after this ships — outputs may include any content currently in `pages/`, treat them as you treat the vault itself. |
| **Output dir bloat** | low | Outputs live in their own dir, easy to nuke (`rm -rf outputs/`). Cheap to regenerate. Encourage users to delete stale ones. |
| **Subagent budget overrun on detailed mode + large scope** | medium | Cap input page reads at 20 in agent prompt (configurable via flag, deferred). If `--style detailed` with > 20 pages, force user to narrow scope OR drop to standard. |

## 9. Recommendation

### v1.0.4 — minimum viable ship

- **Formats**: report, study-guide, comparison, timeline, glossary (all five).
- **Invocation**: `/vault-output <format> [--topic|--tag|--pages] [--style] [--title] [--dimensions] [--rough]`.
- **Output location**: `projects/<slug>/outputs/<format>-<slug>-<date>.md`.
- **Execution model**: spawn-agent pattern matching synthesize / hypothesize.
- **Edge case handling**: §6 in full.
- **Logging**: log.md only; index.md NOT touched.
- **Cross-linking**: outputs cite source pages via wikilinks; source pages get no back-link.
- **`vault-init` update**: mkdir `outputs/` on init; add to `.obsidianignore`.
- **`vault-help` update**: new entry for `/vault-output` in the commands table.
- **Pages excluded from default scope**: `hypotheses-*`, `analogies-*`, `probe-*`, existing outputs themselves.

### v1.0.5+ — deferred

- **`slides` format** — once a deck format is picked (Marp markdown is the leading candidate; user can convert with `marp <file>.md` themselves).
- **`--index` flag** — surface outputs in index.md / hot-cache for users who want them session-loaded.
- **Lint integration** — `/vault-lint` flags outputs whose source pages are newer (drift detection).
- **`--from-output [[<output-slug>]]` regen** — regenerate an existing output with current source page state. One-shot drift fix.
- **Multi-format chain** — `/vault-output report,study-guide --topic X` produces both off the same scope read.
- **Audience-aware modifiers** — `--audience exec|engineer|learner` tunes vocabulary and depth without picking a different format.
- **Output → Obsidian Canvas export** — once a format is stable, generate `.canvas` files Obsidian can render visually.

### Why ship the five formats together (not just report)

All five share the same execution skeleton (resolve scope → read pages → apply template → write file). Marginal cost of adding format 2-5 once format 1 works is small — only the template differs. Shipping one format at a time means five PRs of integration work for no extra functionality. Better: ship all five, learn from real usage which formats users return to vs ignore, prune in v1.0.6 if needed.

### Open design question (for user before implementation)

- Should `--pages` accept ranges or globs (`pages/jwt-*`)? Probably yes for `glossary` and `timeline`, no for `comparison` (which is precise by nature). Defer decision until first user feedback.
- For `comparison` with ≥ 4 input pages, is matrix the right format or should it pivot to a "feature × source" grid with pages as columns? Defer until a real 4-page comparison request lands.

## 10. References

- `/Users/lucafuccaro/.claude/skills/vault-synthesize/SKILL.md:1-185` — closest analog (multi-page → new artifact), template for spawn-agent pattern, edge-case rules (overlap detection, max-5 inputs).
- `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md:1-197` — agent execution model reference (lines 31-66 spawn block).
- `/Users/lucafuccaro/.claude/skills/vault-integrate/SKILL.md:1-154` — IO complexity reference (mid-agent confirmation, diff-style output, edit safety rules).
- `/Users/lucafuccaro/.claude/skills/vault-hypothesize/SKILL.md:35-62` — flag-parsing pattern (`--tag`, `--topic`, `--count`), pre-spawn validation, `--tag` xor `--topic` rule.
- `/Users/lucafuccaro/.claude/skills/vault-analogize/SKILL.md:115-160` — output template patterns and dated-file naming convention.
- `/Users/lucafuccaro/.claude/skills/vault-init/SKILL.md:35-65` — directory scaffold patterns (where to add `outputs/`).
- `/Users/lucafuccaro/.claude/skills/vault-help/SKILL.md:22-65` — command registry to update with new entry.
- `/Users/lucafuccaro/.claude/vault/projects/vault-e2e-test/index.md` — concrete shape of an active vault for testing v1 (4 pages, 1 synthesis, 1 hypothesis page, 1 probe). Useful as the v1 smoke target.
- nvk/llm-wiki repo (verified via WebFetch) — source of format taxonomy, `--retardmax` flag, `output/` directory pattern.
