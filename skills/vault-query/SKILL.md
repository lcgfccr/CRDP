---
name: vault-query
description: >
  Q&A against the current project's vault. Default output is terse: a cited
  answer + one-line confidence + one actionable gap line (if any). Gaps are
  ALSO durably appended to projects/<slug>/questions.md as a research queue
  that /vault-autoresearch can consume. Pass --deep for the full structured
  audit with multi-bullet evidence, confidence reasoning, and all gaps.
  Uses ONLY existing vault content (no web) unless --web is passed.
  Use when user says: /vault-query, "ask the vault",
  "what does the vault say about X", "search my notes for Y".
---

# vault-query

Answer from the vault. Terse by default. Durably capture gaps so the vault compounds.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. If not active, explicitly say so; do not silently fall back to general knowledge.

## Defaults

- **Sources**: existing vault pages only. `--web` opts in to one additional WebSearch + WebFetch pass.
- **Output**: terse. Answer + inline wikilinks + one-line confidence + one-line gap-with-next-move.
- **Gap capture**: every NEW gap surfaced by a query is appended to `projects/<slug>/questions.md` (created on first use). This is the durable research queue — `/vault-autoresearch` pulls from it, `/vault-lint` flags unanswered entries that have been open a long time. Don't duplicate existing entries.
- **Promotion**: only offer when the synthesized answer adds non-trivial value beyond what's already in the cited pages (novel combination, resolved contradiction, new framing). Skip for direct lookups.
- **Logging**: log silently to `log.md`. Don't ask.

## Execution model

Runs in an isolated subagent — main conversation sees only the final answer.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse arguments: extract question text, `--deep` flag, `--web` flag. If question is missing or vague, ask ONE clarification here before spawning.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-query for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Question: "<question>"
    Flags: <--deep if set> <--web if set>

    Follow the full procedure in the vault-query skill. Return ONLY the final formatted
    answer (terse or --deep format). Do not narrate intermediate steps or tool calls.
  """
)
```

**After:** Echo the agent's output verbatim. Add nothing.

## Procedure

1. **Resolve slug** via `node ~/.claude/hooks/vault-slug.js --resolve`. Verify `index.md` exists.

2. **Parse question**. If vague, ask ONE clarification. Otherwise proceed.

3. **Locate candidate pages** (cap 8):
   - grep `index.md` for question terms
   - grep `pages/*.md` (filenames, tags, headings)
   - follow wikilinks outward one level from hits
   - trim by recency + link-count

4. **Read candidates**. Summary + Key claims sections first. Full body only if insufficient.

5. **Synthesize — terse format (default)**:

   ```
   <2-6 sentences answering directly. Use [[wikilinks]] inline as citations — not in a separate section.>

   **Confidence: High/Medium/Low.** <one short clause: what's solid, what's thin>

   **Gap:** <if meaningful: one line naming the missing piece and the exact command to fill it, e.g., "RFC 6749 uncovered — `/vault-autoresearch \"OAuth 2.0 refresh token spec\"`">
   ```

   Omit the Gap line if the vault covers the question fully. Do NOT include separate Evidence / multi-bullet Confidence / multi-line Gaps / Next-moves sections in the terse mode.

6. **Capture gaps to `questions.md`** (always, regardless of output mode):
   - Read `projects/<slug>/questions.md` (create if missing with header `# Open questions\n\nResearch queue for /vault-autoresearch. Unchecked boxes are open; checked are answered.\n`).
   - For each gap identified in this query, check if it's already listed (case-insensitive substring match against the question text, whether the existing line is `- [ ]` or `- [x]`). If not, append:
     ```
     - [ ] <ISO-8601 timestamp> — <gap stated as a researchable question> — from QUERY "<original question>"
     ```
   - Hard cap: add at most 3 new gaps per query to avoid flooding.
   - Format note: `- [ ]` / `- [x]` are standard markdown checkboxes — Obsidian renders them as clickable, and `/vault-autoresearch` parses them to pick the oldest unanswered entry when invoked with no argument.

7. **Synthesize — `--deep` format (when user passes `--deep` or asks for "full analysis")**:

   ```
   ## Answer
   <2-6 sentences with inline [[wikilinks]]>

   ## Evidence
   - From [[page-a]]: <exact claim> — <why it matters>
   - ...

   ## Confidence
   <High / Medium / Low>. <reasoning bullets>

   ## Gaps
   - <explicit open items — all of them, not just one>

   ## Next moves
   - `/vault-autoresearch "..."` — fill specific gap
   - `/vault-ingest <source>` — if user has one at hand
   ```

   `--deep` STILL appends to `questions.md` under the same rules — the durable queue is format-agnostic.

8. **Confidence calibration**:
   - High = ≥2 pages explicitly support the answer, no contradictions
   - Medium = 1 page, OR 2+ pages requiring interpretive synthesis
   - Low = no direct coverage; inferred from adjacent pages
   Never emit "High" from a single page.

9. **Promotion offer** — only when the answer is genuinely new synthesis (not a lookup):
   ```
   Promote to page? (say "save" or give a title)
   ```
   Skip entirely if answer just restates one page.

10. **Log silently** — append to `log.md`:
    ```
    - <timestamp> — QUERY — "<question>" — <N> pages — <High/Medium/Low> — <K> new gaps captured
    ```

11. **Empty-vault case**: say "vault doesn't cover this" and suggest `/vault-autoresearch` or `/vault-ingest`. Don't fabricate. Still append the question itself to `questions.md` as an open research item.

## `--web` mode

1. Do vault-only pass first (terse or deep per the other flag).
2. One WebSearch + top 2-3 WebFetches on the refined question.
3. Append a **From the web** subsection with URL citations.
4. Offer `/vault-ingest` for any web source worth keeping.
5. Any gaps the web results *still* leave open get captured to `questions.md` like vault-only gaps.

## Rules

- Citations mandatory. No claim without a `[[wikilink]]` or URL.
- No invented wikilinks. Missing pages = gap, not a link.
- Promotion always creates NEW or appends — never overwrite.
- Terse beats comprehensive for the chat output. Durable goes to files.
- `questions.md` is the research agenda. Treat it as a first-class vault artifact alongside index/log/overview.
