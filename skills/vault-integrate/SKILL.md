---
name: vault-integrate
description: >
  Fold autoresearch findings back into source pages. Reads a research page,
  identifies source pages with open questions it answers, proposes specific
  edits (diff-style), and applies them on explicit confirmation. Compounds
  the vault by closing the loop between research and the pages that raised
  the questions. Use when user says: /vault-integrate, "integrate these
  findings", "fold this research back", "update source pages with findings",
  "/vault-integrate [[page-slug]]".
---

# vault-integrate

Close the loop: fold research findings back into the pages that raised the questions.

## Purpose

Autoresearch produces a standalone page with answers. vault-integrate flows those answers back into the source pages — resolving open questions, enriching sections, and adding wikilinks. This is the compound step that makes the wiki grow smarter, not just bigger. Without it, knowledge accumulates in isolated research pages; with it, the core pages evolve as understanding deepens.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. Research page must exist at `pages/<research-slug>.md`.

## Execution model

Runs in an isolated subagent. Unlike other vault skills, confirmation happens MID-AGENT — the agent must show proposed changes before writing any file.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`.
2. Parse argument: extract `<research-slug>` from `[[slug]]` wikilink or bare slug.
3. Verify `pages/<research-slug>.md` exists. If not, abort with clear error.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-integrate for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Research page: pages/<research-slug>.md

    Follow the full procedure in the vault-integrate skill. CRITICAL: show proposed
    changes as a diff before writing any file. Get explicit confirmation before each write.
  """
)
```

**After:** Echo the agent's final integration summary verbatim.

## Procedure

### 1. Read the research page

Read `pages/<research-slug>.md`. Extract:
- `answers:` frontmatter field — the original question this research was commissioned to answer (if pulled from queue)
- `## Synthesis` — the coherent understanding paragraphs
- `## Key facts` — cited findings
- `## What's still unclear` — remaining open questions (do NOT integrate these back — they're new gaps)
- `## Related` — existing wikilinks to source pages

### 2. Identify source pages to enrich

Find pages whose open questions this research answers. Check in order:

**a. Queue match** — read `questions.md`. Find `[x] ANSWERED ... by [[<research-slug>]]` lines. The `from QUERY "<original>"` tag identifies the query session; cross-reference with pages that have matching open question text.

**b. Open questions in pages** — grep `pages/*.md` for `## Open questions` sections. For each question, apply semantic matching: does the research page answer it? Semantic, not keyword — "rotation frequency for signing keys?" is answered by a cadence research page even if the exact words differ.

**c. Related pages** — any page already wikilinked in the research page's `## Related` section that contains open questions the research resolves.

Cap: process at most 5 source pages per run.

### 3. Compute proposed changes per source page

For each source page, compute three changes:

**a. Resolve the open question** — find the exact question text in `## Open questions`. Strike through and link:
```
- ~~<original question text>~~ → see [[<research-slug>]]
```
If the section becomes empty after resolution, replace it with: `(resolved — see [[<research-slug>]])`

**b. Add finding summary** — identify the most relevant existing section in the source page. Append a 2-3 sentence blockquote distilling the key finding, with citation:
```
> **Updated:** <2-3 sentence finding summary>. See [[<research-slug>]].
```
The `> **Updated:**` blockquote is the canonical marker for integrated findings — consistent across all pages so `/vault-lint` can index them.

**c. Update Related section** — add `[[<research-slug>]] — <one-line description>` if not already present.

### 4. Show diff and confirm — BEFORE WRITING

For each source page, display proposed changes clearly before touching any file:

```
── <page-slug>.md ─────────────────────────────────────

RESOLVE in ## Open questions:
  before: - Rotation frequency for signing keys in practice (days vs weeks).
  after:  - ~~Rotation frequency for signing keys in practice (days vs weeks).~~ → see [[jwt-signing-key-rotation-cadence]]

APPEND to ## Details / Common pitfalls:
  > **Updated:** Quarterly (~90 days) is the production baseline; NIST floor is
  > annually. Phased JWKS rotation with `kid` header enables zero-downtime cutover.
  > See [[jwt-signing-key-rotation-cadence]].

ADD to ## Related:
  - [[jwt-signing-key-rotation-cadence]] — signing key rotation cadence and attack defenses.

Apply? (yes / skip / edit)
```

Wait for explicit response before proceeding. `edit` → ask what to change. `skip` → move to next page. `yes` → write.

### 5. Apply confirmed changes

Write each confirmed change with Edit tool. One file at a time. Verify each edit succeeded before moving to the next.

### 6. Update the research page

Add an `integrated:` frontmatter field listing all pages that were updated:
```yaml
integrated: [page-a, page-b]
```
This makes the integration auditable — `/vault-lint` can check for research pages that were never integrated.

### 7. Log

```
- <timestamp> — INTEGRATE — [[<research-slug>]] → <N> pages updated — <comma-separated slugs>
```

### 8. Return compact summary

```
Integrated [[<research-slug>]] into N pages:
- [[page-a]] — resolved "<question>", added finding to <section>
- [[page-b]] — ...

Research page marked integrated: [<slugs>].
```

## Rules

- NEVER write without showing the diff and getting explicit confirmation per page.
- NEVER overwrite existing content — only append (blockquotes) or strike-through. Original text is never deleted.
- `## What's still unclear` items from the research page are NEW gaps — append them to `questions.md`, do NOT integrate them back into source pages as answered.
- Semantic matching for questions — exact string match not required.
- Cap at 5 source pages per run. More can be done in a follow-up invocation.
- If a source page has no open questions the research answers, skip it — do not add gratuitous links.
- The `> **Updated:**` blockquote format is canonical — keep it consistent so future tools can parse it.
