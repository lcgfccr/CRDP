---
name: vault-autoresearch
description: >
  Autonomous multi-round research loop. Runs WebSearch → WebFetch → synthesize
  across 3 rounds, producing a wiki page in the current project's subgraph.
  Connects dots, surfaces contradictions, captures new gaps. If invoked without
  a topic, pulls the oldest unanswered entry from projects/<slug>/questions.md
  and researches that. Marks the question ANSWERED (with a link to the produced
  page) when done. Use when user says: /vault-autoresearch,
  "research this topic", "investigate X for me", "dig into Y",
  "auto-research <topic>", or just "/vault-autoresearch" with no arg to pull
  from the open-questions queue.
---

# vault-autoresearch

Multi-round autonomous investigation. Produces a durable wiki page and compounds the vault.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. If not, ask whether to `/vault-init` first, or run ephemerally without saving.

## Inputs

- **Topic** (explicit): `/vault-autoresearch "OAuth2 PKCE flow in mobile apps"` — investigate this.
- **Topic** (from queue): `/vault-autoresearch` with no args → read `projects/<slug>/questions.md`, pick the oldest unanswered entry (line starting `- [ ]`), and use its text as the topic.
- **Depth**: default 3 rounds. `--deep` → 5 rounds, `--quick` → 1 round.

## Execution model

Runs in an isolated subagent. Confirmation from the user happens BEFORE spawning so the agent gets a complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. If topic passed as argument, use it directly.
3. If no argument: read `~/.claude/vault/projects/<slug>/questions.md`, find the oldest `- [ ]` entry, show the user: "Queue has N open questions. Oldest: '<question>' — proceed? (yes / pick another / specify new topic)". Wait for confirmation here, before spawning.
4. Note depth: `--deep` (5 rounds), `--quick` (1 round), default 3.

**Spawn** (after topic is confirmed):
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-autoresearch for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Topic: "<confirmed topic>"
    Depth: <N> rounds
    Source: <answered-from-queue | topic-explicit>
    Queue entry timestamp (if from queue): <ts>
    Original queue line (verbatim, if from queue): <line>

    Follow the full procedure in the vault-autoresearch skill. Return ONLY:
    - Page path created
    - 3-sentence synthesis
    - Queue state (N open, N answered)
    - Any conflicts with existing pages (or "none")
    - Non-obvious cross-domain connection (1 sentence)
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Resolving the topic

1. If user passed a topic string, use it directly.
2. Otherwise, read `questions.md`:
   - Parse lines matching `^- \[ \] <timestamp> — <question> — from QUERY "<original>"`
   - Pick the **oldest** open entry by timestamp. Ties broken arbitrarily.
   - If the file is missing or empty, tell the user and abort gracefully — suggest they run `/vault-query` first to populate it or pass a topic explicitly.
3. Show the user the picked question + ask for one-line confirmation before spending WebFetch budget. (Skip confirmation only if user explicitly said "just go" / "don't ask".)

## Procedure

### Round 1 — orient

1. `WebSearch` the topic. Pull ~5-10 distinct URLs.
2. For each top result, `WebFetch` and extract key claims + source.
3. Write round-1 notes to `projects/<slug>/raw/autoresearch-<topic-slug>-r1.md`: key claims, disagreements, URLs.
4. Identify 3-5 **follow-up questions** the round-1 pass surfaced but didn't answer.

### Round 2 — deepen

1. Targeted WebSearch + WebFetch per follow-up question.
2. Look for counterexamples, primary sources, benchmarks, dissenting opinions.
3. Update notes page, grouped by follow-up question.
4. Explicitly flag contradictions between round 1 and round 2.

### Round 3 — synthesize

1. Ask: **what is the user likely trying to understand or decide?**
2. Write the synthesis at `projects/<slug>/pages/<topic-slug>.md`:

   ```markdown
   ---
   title: <topic>
   created: <ISO-8601 date>
   source: autoresearch
   tags: [...]
   rounds: 3
   answers: <question text from questions.md, if pulled from queue; else omit>
   ---

   # <topic>

   ## Synthesis

   <3-5 paragraphs: what we now know, coherent understanding>

   ## Key facts

   - <claim> ([source](url))
   - ...

   ## Tensions & contradictions

   <where sources disagree, and why it matters>

   ## What's still unclear

   <open questions — these get appended to questions.md as new `- [ ]` entries>

   ## Related

   <wikilinks to existing pages; flag candidates for new pages>
   ```

3. Cross-link to existing pages in `pages/` that touch this topic (both directions).

4. **Close the loop on `questions.md`**: if this research was pulled from the queue, find the exact matching `- [ ]` line and convert it to:
   ```
   - [x] <original-timestamp> — <question> — from QUERY "<original>" — ANSWERED <ts> by [[<topic-slug>]]
   ```
   Don't delete the entry — preserve the history.

5. **Append new gaps to `questions.md`**: for each item under "What's still unclear", append a new `- [ ]` line. Dedupe against existing entries (case-insensitive substring). Cap: 5 new entries per research run.

6. Update `index.md` with the new page. Revise `overview.md` only if synthesis meaningfully shifts the project's thesis.

7. Append to `log.md`:
   ```
   - <timestamp> — AUTORESEARCH — [[<topic-slug>]] — <N> sources — <1-line takeaway> — <answered-from-queue | topic-explicit>
   ```

## Connecting dots (the value-add)

At the end of round 3, explicitly ask:
1. **Does this conflict with any existing page?** If yes, flag it; suggest how to reconcile (don't auto-edit the contradicting page).
2. **Does this unlock something the user was stuck on?** Reference relevant past log entries or questions.md lines.
3. **What's the non-obvious connection?** One paragraph on a cross-domain link the sources don't make explicitly. This is where the LLM earns its keep vs pure retrieval.

## Rules

- Cite every non-trivial claim with a URL.
- Don't fabricate sources. If untraceable, say so.
- Intermediate round notes stay in `raw/`, only final synthesis goes to `pages/`.
- Huge topic → decompose, ask which sub-topic first.
- Never overwrite an existing synthesis page without explicit OK — ask: append, v2, or rename.
- When pulling from the queue, ALWAYS mark the question answered on completion — otherwise the queue grows stale and `/vault-lint` will flag it.
