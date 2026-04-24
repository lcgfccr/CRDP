---
name: vault-analogize
description: >
  Forced cross-domain analogy. Takes one source page and searches the rest of
  the vault for pages with structurally similar patterns in different domains.
  Distinct from /vault-synthesize (user picks pages to juxtapose) — analogize
  DISCOVERS which pages to juxtapose by pattern recognition. Extracts the
  abstract mechanism from the source, scores candidate pages for structural
  match (not topical similarity), picks top N analogs, and produces a dated
  analogies page mapping shared patterns, source/analog instantiations, and
  what each teaches the other. The value-add is concrete actionable lessons
  across domains — failure modes one side hasn't considered, defensive
  mechanisms the other is missing, mature → nascent transfer. Use when user
  says: /vault-analogize, /vault-analogize [[page]], "find analogs for X",
  "what resembles this pattern", "cross-domain analogy", "what else in the
  vault works like this", "analogize [[page]]".
---

# vault-analogize

Forced cross-domain analogy. Take one source page, discover structurally similar patterns elsewhere in the vault.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. Source page must exist at `pages/<source-slug>.md`. Vault must contain ≥ 5 pages total (source + ≥ 4 candidates).

## Inputs

- **Source page** (required): `/vault-analogize [[page]]` or `/vault-analogize page` — wikilink or bare slug.
- **Tag filter**: `--tag <tag>` — restrict candidate pool to pages carrying this tag.
- **Top N**: `--top N` — return top N analogs. Default 3, max 5.

## Execution model

Runs in an isolated subagent. Main context resolves slug, parses source + flags, verifies source exists, counts candidate pool, then spawns agent with complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse argument: strip `[[` / `]]` wrappers, extract bare `<source-slug>`. Abort if no source page argument.
3. Verify `~/.claude/vault/projects/<slug>/pages/<source-slug>.md` exists. If not, abort with clear error.
4. Parse flags: `--tag <tag>` (optional), `--top N` (optional, default 3, clamp to max 5).
5. Count candidate pool: enumerate `pages/*.md` excluding the source. If `--tag` passed, filter candidates by frontmatter tag. If pool < 4, abort: "vault-analogize needs ≥ 4 candidate pages besides the source. Current pool: N. Add more pages or drop --tag filter."

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-analogize for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Source page: pages/<source-slug>.md
    Tag filter (if passed): "<tag>" or none
    Top N: <N> (default 3, max 5)

    Follow the full procedure in the vault-analogize skill. Return ONLY:
    - "Analogs for [[<source-slug>]] in [[analogies-<source-slug>-<date>]]. Top: [[<analog-1>]] — shared pattern: <one phrase>. N analogs mapped. M rejected as non-structural."
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Read source page fully

Read `pages/<source-slug>.md`. Extract:
- Frontmatter (title, tags)
- `## Summary` / `## Synthesis` — the coherent thesis
- `## Key claims` / `## Key facts` — load-bearing claims
- `## Details` / body — the mechanism description
- `## Tensions` — disagreements flagged

### 2. Extract the STRUCTURAL PATTERN

Abstract away topical content. Name the mechanism in domain-neutral terms. Not "JWT access+refresh" — "short-lived credential paired with a long-lived revokable credential". Not "JWKS rotation" — "phased overlap cutover with stable identifier". Not "reuse-detection" — "canary token that, when triggered, revokes a whole family".

The structural pattern is the abstract mechanism the source instantiates. Strip vocabulary. Name the shape.

### 3. Enumerate candidate pool

List all `pages/*.md` excluding the source. If `--tag` passed, filter by frontmatter tag. For each candidate, read Summary + Key claims (not full body — that would be wasteful until a page scores high).

### 4. Score each candidate for STRUCTURAL MATCH

Criteria (NOT topical overlap):
- **High match**: same abstract mechanism operating in different domain.
- **High match**: same structural pattern, different vocabulary.
- **Low match — skip**: related concept, different mechanism.
- **Low match — skip**: same topic but pattern differs.

Two pages on "authentication" are trivially similar — topical overlap is NOT a structural match. Authentication handshake + cert pinning + canary tokens + TLS session resumption all share "establish trust via out-of-band verification" — THAT is a structural match worth surfacing.

For candidates that score high, read the full page body to confirm the pattern holds.

### 5. Pick top N analogs

Default 3, max 5. If fewer than 3 candidates score high, include only the ones that genuinely match — do not pad with weak analogs. Report honestly if the vault lacks strong analogs (see Rules).

### 6. Map each analog

For each (source + analog) pair, produce:
- **Shared structural pattern** — abstract, domain-neutral description
- **Source instantiation** — how source does it, in source's domain
- **Analog instantiation** — how analog does it, in analog's domain
- **What each teaches the other** — the value-add. Concrete, actionable lessons:
  - Does the analog have a failure mode the source hasn't considered?
  - Does the source have a defensive mechanism the analog is missing?
  - Is one mature and the other nascent? Mature → nascent lessons are especially valuable.

Forbid vague output like "both involve trust". Must be concrete and actionable.

### 7. Write analogies page

Write to `pages/analogies-<source-slug>-<YYYY-MM-DD>.md`:

```markdown
---
title: Analogies — <source> — <date>
created: <ISO-8601 date>
source: vault-analogize
source_page: <source-slug>
tags: [analogy, cross-domain]
analogs: [<analog-slug-1>, <analog-slug-2>, ...]
---

# Analogies for [[<source-slug>]]

## Abstract pattern

<2-3 sentences naming the structural pattern in domain-neutral terms>

## Analog 1: [[<analog-slug>]]

**Domain:** <brief>

**Shared structural pattern:** <description>

**Source instantiation:** <how [[source]] does it>

**Analog instantiation:** <how [[analog]] does it>

**What each teaches the other:**
- [[<source-slug>]] → [[<analog-slug>]]: <specific lesson>
- [[<analog-slug>]] → [[<source-slug>]]: <specific lesson>

## Analog 2: [[<analog-slug>]]

...

## Analogies considered and rejected

- [[<page-slug>]] — superficially similar (<reason>), but structurally different because <reason>
- ...

## Non-obvious insight

<one paragraph: what does seeing these patterns side-by-side unlock? Be specific.>
```

Check `pages/analogies-<source-slug>-<YYYY-MM-DD>.md` does NOT exist. If it does, ask the user: append, v2 suffix, or rename? Never silently overwrite.

### 8. Cross-link source and analogs

Append a `## Related` section line to EACH of: the source page, and every analog page (create section if missing):

```
- [[analogies-<source-slug>-<date>]] — structural analog via <one-line pattern name>
```

### 9. Append new research gaps to questions.md

For each lesson that suggests a research gap (e.g., "source is missing defensive mechanism X that analog uses"), append a new `- [ ]` line to `questions.md`:

```
- [ ] <timestamp> — ANALOG LESSON: <lesson> — from /vault-analogize [[<source-slug>]] × [[<analog-slug>]]
```

Dedupe against existing entries (case-insensitive substring). Cap: 5 new entries per run.

### 10. Append to log.md

```
- <timestamp> — ANALOGIZE — [[<source-slug>]] → N analogs — top: [[<analog-1>]]
```

### 11. Return compact summary

```
Analogs for [[<source-slug>]] in [[analogies-<source-slug>-<date>]]. Top: [[<analog-1>]] — shared pattern: <one phrase>. N analogs mapped. M rejected as non-structural.
```

## Rules

- Minimum candidate pool: ≥ 4 pages besides the source. Abort if fewer.
- Structural match is NOT topical similarity. Two pages on the same topic are trivially similar — that is not the target. Target: same abstract mechanism in different domains.
- "What each teaches the other" is the value-add. Forbid platitudes like "both involve trust" or "both use keys". Must be concrete and actionable — a specific failure mode, defensive mechanism, or transferable lesson.
- Be honest about rejected candidates. Documenting what is NOT a good analog is as valuable as what is. Always include the `## Analogies considered and rejected` section.
- If no high-quality analogs found (all candidates score low), report honestly: "no strong structural analogs in the current vault — may emerge as the vault grows, or source page may be genuinely novel." Still write the page with the rejected list and the honest verdict — this is a useful artifact.
- Never overwrite an existing analogies page without explicit user OK. Ask: append, v2, or rename.
- Cap at 5 analogs per run. Default 3. More than 5 dilutes — split into multiple runs.
- Cross-links go to BOTH source and each analog page's `## Related` section. The analogies page is the hub; source + analogs point to it.
- Do NOT modify the source page or analog pages beyond the `## Related` append. Never rewrite their content.
