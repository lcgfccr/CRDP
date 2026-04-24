---
name: vault-hypothesize
description: >
  Forced hypothesis generation for the current project's vault. Reads pages
  (whole vault or filtered by tag/topic), distills what the vault collectively
  asserts, then produces 3-5 bold TESTABLE assertions that follow from the
  content but aren't stated anywhere. Hypotheses are assertions (not
  questions): each has a falsification path, reasoning grounded in specific
  [[pages]], a concrete test route, and stakes. Output goes to a dated
  hypotheses-<YYYY-MM-DD>.md page and feeds questions.md so /vault-autoresearch
  and /vault-challenge can pick them up. The vault generates its own research
  agenda instead of waiting for the user. Use when user says:
  /vault-hypothesize, "generate hypotheses", "what could be true based on what
  we know", "give me testable assertions", "what's worth exploring next",
  "/vault-hypothesize --tag X", "/vault-hypothesize --topic 'Y'".
---

# vault-hypothesize

Forced hypothesis generation. Vault asserts its own research agenda: 3-5 testable bold claims grounded in existing pages.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. Vault must hold ≥ 3 pages in `pages/` — below that, abort with "too sparse for useful hypothesis generation, ingest or research more first".

## Inputs

- **Scope** (default): `/vault-hypothesize` — whole vault.
- **Scope (tag)**: `/vault-hypothesize --tag <tag>` — only pages whose frontmatter `tags:` list contains `<tag>`.
- **Scope (topic)**: `/vault-hypothesize --topic "<theme>"` — only pages semantically related to the theme. Claude judges relatedness from page Summary/Key claims, NOT keyword match.
- **Count**: `--count N` — override default. Default 3-5, hard cap 7.

## Execution model

Runs in an isolated subagent. Main context resolves slug, parses flags, pre-checks page count, then spawns the agent with a complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse flags: `--tag <tag>`, `--topic "<theme>"`, `--count <N>`. Only one of `--tag` / `--topic` allowed per run — if both passed, abort with clear error.
3. Count pages in `~/.claude/vault/projects/<slug>/pages/` (exclude existing `hypotheses-*.md`). If < 3, abort: "Vault has <N> pages — too sparse for useful hypothesis generation. Ingest or research more first."
4. Clamp count: if `--count` > 7, clamp to 7 and warn. If absent, agent targets 3-5.
5. Check if `pages/hypotheses-<today>.md` exists. If yes, ask user: "A hypotheses file for today already exists. Overwrite, add as v2 alongside, or cancel?" Wait for answer before spawning.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-hypothesize for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Scope: <whole-vault | tag:<tag> | topic:"<theme>">
    Target count: <N> (cap 7)
    Mode: <first-run | overwrite | v2>

    Follow the full procedure in the vault-hypothesize skill. Return ONLY:
    - "Generated <N> hypotheses in [[hypotheses-<date>]]. Top: '<hypothesis 1 verbatim>'. All appended to questions.md — pick up via /vault-autoresearch to test."
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Enumerate in-scope pages

List `pages/*.md` under `projects/<slug>/pages/`. Exclude files matching `hypotheses-*.md` (prior runs — not input).

Apply scope filter:
- **whole-vault**: keep all.
- **tag:<tag>**: read frontmatter of each page; keep only those whose `tags:` list contains `<tag>` (exact match, case-insensitive).
- **topic:"<theme>"**: read frontmatter + `## Summary` / `## Synthesis` of each page; keep only those semantically related to the theme. Use Claude judgement — NOT keyword overlap. Drop pages that merely mention the theme in passing.

If filter yields < 3 pages, abort: "Scope matched <N> pages — need ≥ 3 for hypothesis generation. Widen the filter."

### 2. Distill the unified picture

For each in-scope page, read:
- Frontmatter (title, tags)
- `## Summary` / `## Synthesis` — coherent understanding
- `## Key facts` / `## Key claims` — cited findings
- `## Tensions` / `## Tensions & contradictions` — disagreements
- `## What's still unclear` / `## Open questions` — gaps

Ask: what does the vault collectively assert about this scope? Note convergences (multiple pages point same way), divergences (tensions between pages), and blind spots (topics adjacent to the scope that no page covers).

### 3. Generate hypotheses

Produce <count> hypotheses. Each MUST satisfy all four:

- **ASSERTION**, not a question. "X causes Y under conditions Z" — not "does X cause Y?". Assertions can be falsified; questions can't.
- **TESTABLE**: there exists a concrete evidence path (WebSearch query, experiment, dataset check) that would refute it if wrong. Name the evidence path.
- **NON-TRIVIAL**: the claim is not stated verbatim or near-verbatim in any existing page. Must extend beyond what's already written.
- **GROUNDED**: follows from specific pages' content. Ban generic assertions ("ML models will improve", "security matters") that don't require the vault at all.

Mark loosely-supported hypotheses with a `Speculative:` prefix on the assertion line so downstream skills treat them with lower confidence.

### 4. Write hypotheses page

Write to `pages/hypotheses-<YYYY-MM-DD>.md` (today's ISO date):

```markdown
---
title: Hypotheses — <YYYY-MM-DD>
created: <ISO-8601 date>
source: vault-hypothesize
scope: <whole-vault | tag:<tag> | topic:"<theme>">
tags: [hypotheses, speculation]
count: <N>
---

# Hypotheses — <YYYY-MM-DD>

Generated from <N-in-scope> pages. Scope: <scope description>.

## Hypothesis 1: **<one-line bold assertion>**

**Follows from:** <2-3 sentence reasoning. Cite specific [[page-slug]]s and name the convergence/divergence that led here.>

**Test:** <concrete path — `/vault-autoresearch "..."`, specific WebSearch query, or experiment description with observable outcome>

**Stakes:** Confirming unlocks <what becomes possible / what open questions close>. Refuting closes <what branch is pruned / what assumption must be revised>.

## Hypothesis 2: **...**

...
```

Mode handling:
- **first-run** / **overwrite**: write file at `pages/hypotheses-<YYYY-MM-DD>.md`.
- **v2**: write at `pages/hypotheses-<YYYY-MM-DD>-v2.md` (or v3, v4 as needed — never clobber).

### 5. Append each hypothesis to questions.md

For each hypothesis, append a line to `questions.md`:
```
- [ ] <timestamp> — HYPOTHESIS: <assertion verbatim> — from /vault-hypothesize <YYYY-MM-DD>
```

Dedupe against existing entries (case-insensitive substring). The `HYPOTHESIS:` prefix lets `/vault-autoresearch` recognize them as falsifiable targets rather than plain questions.

### 6. Update index.md

Add the new hypotheses page under a `## Hypotheses` section in `index.md` (create the section if missing):
```
## Hypotheses
- [[hypotheses-<YYYY-MM-DD>]] — <N> hypotheses — scope: <scope>
```

### 7. Log

Append to `log.md`:
```
- <timestamp> — HYPOTHESIZE — <N> hypotheses — scope: <scope description>
```

### 8. Return compact summary

```
Generated <N> hypotheses in [[hypotheses-<YYYY-MM-DD>]]. Top: '<hypothesis 1 verbatim>'. All appended to questions.md — pick up via /vault-autoresearch to test.
```

## Rules

- Hypotheses are ASSERTIONS, not questions. "X works by Y mechanism" — not "how does X work?". Falsifiability is the whole point.
- Every hypothesis grounded in specific [[pages]]. No generic claims that don't require the vault's content.
- Mark loosely-supported ones with `Speculative:` prefix so downstream skills weight them lower.
- Cap at 7 per run. More floods questions.md and dilutes signal.
- Never overwrite an existing `hypotheses-<YYYY-MM-DD>.md` without explicit OK — dated files are a record of idea evolution over time, not a running doc.
- If scope filter yields < 3 pages, abort — don't force hypotheses from a thin slice.
- Only one of `--tag` / `--topic` per run. Both = ambiguous scope, abort.
- `HYPOTHESIS:` prefix in questions.md is load-bearing — `/vault-autoresearch` uses it to recognize falsifiable targets.
