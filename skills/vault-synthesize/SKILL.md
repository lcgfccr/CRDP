---
name: vault-synthesize
description: >
  Forced cross-domain juxtaposition. Takes 2+ existing pages (usually from
  different topics/domains) and produces a new synthesis page exploring
  non-obvious connections — shared concepts, tensions, gaps, and the
  structural/analogical links the original pages never make explicit.
  Innovation through recombination: the step most AI research tools skip.
  Use when user says: /vault-synthesize, "synthesize across pages",
  "find connections between X and Y", "cross-domain analysis of A and B",
  "/vault-synthesize [[page-a]] [[page-b]]".
---

# vault-synthesize

Juxtapose 2+ vault pages. Produce a synthesis page with the non-obvious connections nobody wrote yet.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. At least 2 input pages must exist at `pages/<slug>.md`.

## Execution model

Runs in an isolated subagent. Main context resolves slug, parses inputs, verifies pages exist, then spawns the agent with a complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse arguments: extract page slugs from `[[slug]]` wikilinks or bare slugs. Multiple inputs supported.
3. Capture `--title "<custom title>"` flag if present.
4. Verify every input page exists at `pages/<input-slug>.md`. If any missing, abort with clear error listing the missing slugs.
5. Guard rails:
   - If fewer than 2 distinct input pages, abort: "vault-synthesize needs at least 2 pages. For one page, use /vault-query or /vault-autoresearch."
   - If more than 5 input pages, abort: "Cap is 5 pages per run. More than that produces mush — split into multiple syntheses."
   - If input pages look near-identical (same title stem or same tag set), warn the user: "These pages overlap heavily — synthesis will be low-value. Proceed? (yes / pick different pages)"

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-synthesize for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Input pages: [<input-slug-a>, <input-slug-b>, ...]
    Custom title (if passed): "<title>" or none

    Follow the full procedure in the vault-synthesize skill. Return ONLY:
    - Synthesis page slug created
    - One-sentence summary of the key non-obvious connection
    - Confirmation that input pages were cross-linked
    - Any new gaps appended to questions.md (N gaps, or "none")
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Read all input pages fully

For each input slug, read `pages/<input-slug>.md`. Extract:
- Frontmatter (title, tags)
- `## Summary` / `## Synthesis` — the coherent understanding
- `## Key facts` / `## Key claims` — cited findings
- `## Tensions` / `## Tensions & contradictions` — disagreements flagged by the page
- `## Open questions` / `## What's still unclear` — gaps the page raised

If any page cannot be read, abort and tell the user which page is missing.

### 2. Identify cross-page structure

Work through these four passes in order — each builds on the last:

**a. SHARED CONCEPTS** — ideas that appear across 2+ pages. Cap: 5 most prominent. For each, note which pages reference it and how their framings differ.

**b. TENSIONS** — where pages disagree, or optimize for different constraints. This is often where pages contradict implicitly: page A assumes X, page B assumes not-X, neither page says so.

**c. GAPS** — questions raised in one page that another page touches but doesn't resolve. Cross-page gaps are different from single-page open questions — they only appear once you read the pages together.

**d. NON-OBVIOUS CONNECTIONS** — structural, methodological, or analogical links the original pages do NOT make explicitly. **This is the value-add.** One paragraph minimum. Be concrete: name the mechanism, not just the analogy. "Both use X" is not a connection — "the retry-with-jitter pattern from page A is structurally isomorphic to the congestion-control approach in page B, and the same failure mode (thundering herd) applies to both" is a connection.

### 3. Optionally validate non-obvious connections

If a non-obvious connection feels speculative, run 1-2 targeted WebSearches to check. Do NOT fabricate corroboration. If the connection is speculative and stays speculative, mark it as such in the synthesis page (`> Speculative: ...`).

### 4. Resolve synthesis slug and title

- If `--title "<custom>"` was passed, use that title. Slugify for filename.
- Otherwise: generate a concise descriptive slug (3-5 words) capturing the juxtaposition. Example: inputs `jwt-signing-key-rotation` + `certificate-transparency-logs` → slug `key-rotation-vs-transparency-logs`.

Check `pages/<synthesis-slug>.md` does NOT exist. If it does, ask the user: append, v2 suffix, or rename? Never silently overwrite.

### 5. Write synthesis page

Write to `pages/<synthesis-slug>.md`:

```markdown
---
title: <synthesis title>
created: <ISO-8601 date>
source: vault-synthesize
tags: [synthesis, cross-domain, ...extracted from input page tags]
inputs: [<input-slug-a>, <input-slug-b>, ...]
---

# <synthesis title>

## Premise

<1-2 sentences: why juxtapose these pages? What question does the juxtaposition serve?>

## Shared concepts

- **<concept>** — appears in [[page-a]], [[page-b]]. <one line on how framings differ>
- ...

## Tensions

<where pages disagree, and what the disagreement reveals about the domain. Name the constraint each page optimizes for.>

## Non-obvious connections

<The value-add paragraph. Structural/methodological/analogical links the pages don't make explicit. Be specific: name the mechanism, identify the shared failure mode or shared leverage point. If speculative, mark with `> Speculative: ...`.>

## What this unlocks

<What new questions or approaches this synthesis makes possible. Usually 2-4 bullet points.>

## Open

<Gaps that remain after synthesis. These become questions.md entries.>

## Sources

- [[<input-slug-a>]] — <one-line: what it contributes to the synthesis>
- [[<input-slug-b>]] — <one-line: what it contributes>
- ...
```

### 6. Cross-link input pages

For each input page, append to its `## Related` section (create the section if missing):
```
- [[<synthesis-slug>]] — synthesis with [[<other-input-a>]], [[<other-input-b>]]
```
Each input page gets a line listing the OTHER input pages, not itself.

### 7. Update index.md

Add the new synthesis page to `index.md` under an appropriate heading (e.g., `## Syntheses` — create if missing).

### 8. Append to log.md

```
- <timestamp> — SYNTHESIZE — [[<synthesis-slug>]] ← [[<input-a>]] + [[<input-b>]] + ...
```

### 9. Append new gaps to questions.md

For each item under `## Open` in the synthesis page, append a new `- [ ]` line to `questions.md`:
```
- [ ] <timestamp> — <gap question> — from SYNTHESIZE "<synthesis-slug>"
```
Dedupe against existing entries (case-insensitive substring match). Cap: 5 new entries per run.

### 10. Return compact summary

```
Synthesized [[<synthesis-slug>]] from N pages.
Key non-obvious connection: <one sentence>.
Cross-linked to: [[<input-a>]], [[<input-b>]], ...
New gaps appended to questions.md: <N> (or "none").
```

## Rules

- Minimum 2 input pages. If only 1, abort and tell user to use `/vault-query` or `/vault-autoresearch`.
- Cap at 5 input pages per run. More than that produces mush.
- "Non-obvious connections" section must be explicit and concrete. No "these are related because they're both about X" platitudes — the whole point is that the connection is NOT obvious. Name the mechanism, shared failure mode, or shared leverage point.
- Don't fabricate corroboration. Speculative connections stay marked speculative.
- Never overwrite an existing synthesis page without explicit user OK.
- If input pages are near-identical (same topic/tag set), warn the user before proceeding — the synthesis will be low-value.
- `## Open` items from the synthesis are NEW gaps specific to the juxtaposition — append to `questions.md`, do not touch the input pages' own open-questions sections.
- Cross-links go one-way: input pages point to the synthesis via their `## Related` section. The synthesis points back via its `## Sources` section. No double-entry bookkeeping.
