---
name: vault-output
description: >
  Produce consumer-grade artifacts from existing vault pages. Pure synthesis —
  no WebSearch, no WebFetch. Only skill that emits artifacts intended to leave
  the vault: shareable docs, study material, briefings. Five formats: report,
  study-guide, comparison, timeline, glossary. Style modifiers tune length, not
  structure. Outputs land in projects/<slug>/outputs/, never in pages/. Every
  non-trivial claim cites its source page via wikilink to mitigate hallucination.
  Use when user says: /vault-output, "generate report from vault",
  "create comparison", "build study guide", "make timeline",
  "produce glossary", "/vault-output report --topic X",
  "/vault-output comparison --pages [[a]] [[b]]".
---

# vault-output

Take vault pages, ship an artifact. Pure vault → external. No web fetches.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. At least 1 page must exist at `pages/*.md` (more for some formats — see edge cases).

## Inputs

### Format (positional, required)

One of: `report | study-guide | comparison | timeline | glossary`. If missing or unknown, abort with the allowed list.

### Scope flags (one of)

- `--topic "<theme>"` — semantic match across pages (Claude judgement).
- `--tag <tag>` — frontmatter tag filter.
- `--pages [[a]] [[b]] [[c]]` — explicit page list.
- (none) — whole vault. Allowed for `glossary` and `timeline`. Disallowed for `comparison`. Allowed-with-warning for `report` and `study-guide`.

`--topic` xor `--tag` — passing both aborts. `--pages` is mutually exclusive with both.

### Style flags

- `--style brief|standard|detailed` (default: standard). Tunes section length, NOT structure. Brief = 1-page total. Standard = 2-3 pages. Detailed = no cap, full evidence per finding.
- `--title "<custom>"` — override auto-generated title.
- `--dimensions "a,b,c"` — comparison only. Pre-specify matrix dimensions; otherwise agent infers from shared section headings.
- `--rough` — skip the polish pass; ship comprehensive draft. Fast iteration mode.

### Examples

```
/vault-output report --topic "JWT key rotation"
/vault-output study-guide --tag jwt --style detailed
/vault-output comparison --pages [[jwt-refresh-tokens]] [[jwt-signing-key-rotation-cadence]]
/vault-output timeline --tag jwt
/vault-output glossary --tag jwt
/vault-output report --topic "auth" --rough
```

## Execution model

Runs in an isolated subagent. Main context resolves slug, parses args, runs pre-checks, spawns the agent with a complete brief, echoes compact result.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse positional `<format>`. If missing or not in {report, study-guide, comparison, timeline, glossary}, abort with usage string.
3. Parse scope flag (`--topic` / `--tag` / `--pages` / none). Reject conflicts (both `--topic` and `--tag` → abort; `--pages` with either → abort).
4. Parse `--style` (default standard), `--title`, `--dimensions`, `--rough`.
5. Resolve scope to a concrete page set:
   - `--pages`: strip `[[]]`, verify each exists at `pages/<slug>.md`, abort listing missing.
   - `--tag`: enumerate `pages/*.md` (exclude derived: `hypotheses-*`, `analogies-*`, `probe-*`, existing outputs), filter by frontmatter tag.
   - `--topic`: enumerate same, defer semantic filter to agent.
   - none: enumerate all (with derived excluded).
6. Edge-case checks (see Rules + Edge cases). Abort or warn as specified.
7. Mkdir `outputs/` if not present.
8. Compute output filename: `<format>-<slug-derivation>-<YYYY-MM-DD>.md`. Slug derivation = slugified `--title` if passed, else slugified topic / tag / page-list-stem.
9. If output file already exists, ask user: overwrite, v2 suffix, or rename. Never silent overwrite.
10. Spawn agent.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-output for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Format: <report | study-guide | comparison | timeline | glossary>
    Scope: <pages: [...] | tag: <tag> | topic: "<theme>" | whole-vault>
    Resolved input pages (if --pages or --tag pre-filtered): [<slug-a>, <slug-b>, ...]
    Style: <brief | standard | detailed>
    Custom title (if passed): "<title>" or none
    Rough mode: <true | false>
    Dimensions (comparison only, if passed): "<a,b,c>" or none
    Output path: outputs/<filename>.md
    Mode: <first-run | overwrite | v2>

    Follow the full procedure in the vault-output skill. Return ONLY:
    - Output path written
    - One-sentence description of artifact contents
    - N input pages used
    - Any flags raised (e.g., timeline with no dates, comparison with high overlap, glossary empty)
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Resolve final input page set

If scope = `--topic`, apply semantic filter now (agent already reading content). If scope = whole-vault, enumerate `pages/*.md` excluding derived (`hypotheses-*`, `analogies-*`, `probe-*`, existing outputs). For `--pages` and `--tag`, set is already concrete from main-context pre-check.

Cap: 20 pages max. If `--style detailed` with > 20 pages, abort and tell user to narrow scope OR drop to standard.

### 2. Read each input page fully

Frontmatter, `## Summary` / `## Synthesis`, `## Key facts` / `## Key claims`, `## Tensions`, `## Open questions`, body. If a page cannot be read, abort and name it.

### 3. Apply format-specific extraction

- **report**: pull findings from Key facts across pages, tensions from Tensions sections, recommendations distilled from synthesis.
- **study-guide**: pull definitions from page intros / bold terms, synthesize Q&A from open questions + their cross-page answers, pitfalls from Tensions / "Common pitfalls".
- **comparison**: identify shared dimensions (sections appearing in 2+ pages, OR `--dimensions` override), fill matrix.
- **timeline**: extract dated claims (`(YYYY)`, `since YYYY-MM`, year mentions, ISO dates). Sort. Group by era if span > 5 years.
- **glossary**: extract bold terms, defined terms, key concepts. Dedupe; flag conflicts where the same term gets different definitions.

### 4. Apply style modifier

Brief = 1-page total, terse bullets. Standard = 2-3 pages, full sections. Detailed = no cap, full evidence per finding, multi-quote support.

`--rough` skips the final polish pass. Ship the comprehensive first draft as-is.

### 5. Fill format template

#### report

```markdown
---
title: <report title>
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
- **<finding 2>** — <evidence, cite [[page-slug]]>

## Tensions / open questions
<unresolved disagreements across the input pages, gaps that remain.>

## Recommendations
<actionable bullets. Concrete only — no platitudes.>

## Sources
- [[page-slug-1]] — <one-line on what it contributed>
- [[page-slug-2]] — <one-line on what it contributed>
```

#### study-guide

```markdown
---
title: <study guide title>
created: <ISO date>
source: vault-output
format: study-guide
style: <brief|standard|detailed>
inputs: [<page-slug-1>, ...]
---

# Study guide: <topic>

## Overview
<3-5 sentence orientation.>

## Key concepts
- **<term>** — <definition pulled from pages, [[page-slug]]>
- ...

## Core questions
**Q: <question>**
A: <answer with [[page-slug]] citations>

**Q: <next question>**
A: <answer with [[page-slug]] citations>

## Common pitfalls
<misconceptions or failure modes the pages flag, [[page-slug]] cites>

## Further reading
- [[page-slug]] — <what to look for there>
```

#### comparison

```markdown
---
title: <comparison title>
created: <ISO date>
source: vault-output
format: comparison
style: <brief|standard|detailed>
inputs: [page-a, page-b, ...]
---

# Comparison: <A> vs <B> [vs <C>]

## At a glance

| Dimension       | <A>          | <B>          | <C>          |
|-----------------|--------------|--------------|--------------|
| <dimension 1>   | ...          | ...          | ...          |
| <dimension 2>   | ...          | ...          | ...          |

## Where they agree
<bullets of shared properties, with [[page]] cites.>

## Where they differ
<each substantive difference, naming which page each side comes from via [[page]].>

## When to pick which
- Pick <A> when <condition>
- Pick <B> when <condition>

## Sources
- [[page-a]]
- [[page-b]]
```

#### timeline

```markdown
---
title: <timeline title>
created: <ISO date>
source: vault-output
format: timeline
style: <brief|standard|detailed>
dated_claims: <N>
inputs: [<page-slug-1>, ...]
---

# Timeline: <topic>

<one-paragraph framing.>

## <YYYY> or <era>
- **<event>** — <description, [[page-slug]]>

## <YYYY> or <era>
- **<event>** — <description, [[page-slug]]>

## Key transitions
<2-3 paragraphs naming the inflection points and what changed.>

## Open dating questions
<events the vault places imprecisely or contradicts on. List them.>
```

#### glossary

```markdown
---
title: <glossary title>
created: <ISO date>
source: vault-output
format: glossary
style: <brief|standard|detailed>
inputs: [<page-slug-1>, ...]
---

# Glossary: <scope>

## A
- **Term** — definition. From [[page-slug]].

## B
- ...
```

Alphabetical. Each term cites the page where it is defined. If multiple pages define the same term differently, list both definitions and flag it as a tension inline.

### 6. Per-finding citation rule (hallucination mitigation)

Every non-trivial claim in the output must trace to at least one input page wikilink. Findings, key concepts, comparison cells, timeline events, glossary entries — all require `[[page-slug]]` cite. If a claim cannot be traced, drop it. Do not fabricate. If a section comes up empty (e.g., glossary scope yields zero terms), say so honestly — `## Notes — no terms extracted, glossary empty` — and surface in the compact result.

### 7. Write to outputs/

Ensure the directory exists first — run `mkdir -p ~/.claude/vault/projects/<slug>/outputs` via Bash before writing. Some hooks block writes to non-existent directory paths; this guarantees the parent exists. Then write to `outputs/<filename>.md`. NOT `pages/`. NOT `index.md`.

### 8. Append to log.md

```
- <ISO timestamp> — OUTPUT — <format> — outputs/<filename>.md ← N pages — scope: <description>
```

### 9. Do NOT touch index.md, hot-cache, source pages

- `index.md`: outputs are exports, not vault knowledge. Do not auto-add.
- `.hot-cache.md`: outputs do not enter the cache. Cache loads at session start; outputs are not knowledge.
- Source pages: do NOT add back-links from `pages/<source>.md` to the output. Outputs are derivative; source pages stay canon. Cross-linking is one-way: outputs cite sources, sources do not cite outputs.
- `questions.md`: outputs are read-only on the vault. They do NOT append new gaps. If new gaps surface during writing, mention them in the compact result for the user to decide whether to `/vault-query` and let `questions.md` fill normally.

### 10. Return compact summary

```
Output: outputs/<filename>.md
Format: <format>, style: <style>
Inputs: <N> pages — <comma-list of slugs>
Description: <one sentence on what the artifact contains>
Flags: <e.g., "timeline ran with only 2 dated claims" | "comparison overlap high" | "none">
```

## Edge cases

| Case | Handling |
|---|---|
| Empty vault (0 pages) | Abort: "vault-output needs at least 1 page. Run `/vault-ingest` or `/vault-autoresearch` first." |
| Single page in scope | `report`/`study-guide`/`glossary`: allowed, but warn "single page — consider `/vault-query` for Q&A or just read the page." `comparison`: hard abort, "needs at least 2 pages." `timeline`: allowed only if page has at least 3 dated claims, else warn. |
| Scope yields 0 pages | Abort with the concrete filter that filtered to 0: "tag `<tag>` matched 0 pages — drop tag or pick another." |
| Comparison input pages near-identical (same tag set, similar title stems) | Warn: "input pages overlap heavily — comparison will be thin. Proceed? (yes / pick different pages)" |
| Timeline input pages have no dates | Pre-check by grepping for date patterns (`\b(19|20)\d{2}\b`, ISO dates, `since YYYY-MM`). If < 3 dated claims across pool, warn before spawning: "no dates found — timeline will degrade to a chronologically-ambiguous list. Proceed or pick another format?" |
| Output file already exists | Ask: overwrite, v2 suffix, or rename. Never silent overwrite. |
| Format mismatch (e.g., glossary scope yielded zero terms) | Agent reports honestly in output (`## Notes — no terms extracted, glossary empty`) and in compact result. Do NOT fabricate. |
| `--pages` includes a derived page (`hypotheses-*`, `analogies-*`, `probe-*`) | Allow but warn: "input includes derived artifact `<slug>` — output may be circular." |
| Whole-vault scope on a 50+ page vault | Warn before spawning: "whole-vault `<format>` over N pages will be unfocused. Confirm or pass `--tag` / `--topic` to narrow." |
| `--style detailed` with > 20 pages | Abort: "detailed mode caps at 20 pages. Drop to `--style standard` or narrow scope." |

## Rules

- **Five formats only**: report, study-guide, comparison, timeline, glossary. Reject anything else.
- **No web**: vault-output is pure synthesis. No WebSearch, no WebFetch. Inputs are existing vault pages, period.
- **Outputs go to `outputs/`**, never `pages/`. Mkdir if missing.
- **Cite every non-trivial claim** with `[[page-slug]]`. Hallucination mitigation. Drop claims that cannot be traced.
- **Style tunes length, not structure.** Brief / standard / detailed never change the section list — only depth per section.
- **Comparison hard-requires at least 2 input pages.** No exceptions.
- **Timeline pre-checks date density.** If < 3 dated claims across pool, warn before spawning.
- **No back-links from source pages.** Cross-linking is one-way: outputs cite sources via wikilinks; source pages stay untouched.
- **No index.md updates, no hot-cache entry, no questions.md append.** Outputs are exports — they ship and leave. They do not compound the vault.
- **Log every output to log.md.** Format: `<ts> — OUTPUT — <format> — outputs/<filename>.md ← N pages — scope: <description>`.
- **Never silent-overwrite an existing output.** Ask: overwrite, v2 suffix, or rename.
- **Exclude derived artifacts from default scope**: `hypotheses-*`, `analogies-*`, `probe-*`, and existing outputs themselves. User can include explicitly via `--pages` (with warning).
- **`--rough` skips polish, not citations.** Even rough mode must trace every claim.
- **Single scope flag per run.** `--topic` xor `--tag`; `--pages` excludes both.
- **Cap input page reads at 20** (configurable later). Detailed mode + > 20 pages aborts.
- **Empty section is acceptable, fabrication is not.** If glossary finds zero terms, write `## Notes — empty` and say so in the compact result.
