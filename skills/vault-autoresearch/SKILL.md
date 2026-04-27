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
- **Topic** (from queue): `/vault-autoresearch` with no args → read `projects/<slug>/questions.md`, score open entries by leverage, pick highest. Use `--oldest` flag to restore FIFO (oldest `- [ ]` first).
- **Depth**: default 3 rounds. `--deep` → 5 rounds, `--quick` → 1 round.
- **Modifier**: `--challenge` → after synthesis page is written, run round 4 (adversarial falsification). Adds ~3-5 extra WebFetch calls.

## Execution model

Runs in an isolated subagent. Confirmation from the user happens BEFORE spawning so the agent gets a complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. If topic passed as argument, use it directly.
3. If no argument: read `~/.claude/vault/projects/<slug>/questions.md`. Default = priority-ranked pick (see "Resolving the topic" below for scoring). With `--oldest` flag, pick oldest `- [ ]` entry instead. Show user: "Queue has N open questions. Picked: '<question>' — leverage <score>, would unblock pages: [[a]], [[b]]. Proceed? (yes / pick another / specify new topic)". Wait for confirmation here, before spawning.
4. Note depth: `--deep` (5 rounds), `--quick` (1 round), default 3.
5. Note modifier: `--challenge` → adds adversarial round 4 after synthesis. Pass through to agent brief.

**Spawn** (after topic is confirmed):
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-autoresearch for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Topic: "<confirmed topic>"
    Depth: <N> rounds
    Challenge mode: <true | false>  # if true, run round 4 adversarial falsification after synthesis
    Source: <answered-from-queue | topic-explicit>
    Queue pick mode (if from queue): <priority | oldest>
    Leverage score (if priority): <N> — pages unblocked: [[...]]
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
   - Parse lines matching `^- \[ \] <timestamp> — <question> — from QUERY "<original>"`.
   - If the file is missing or empty, tell the user and abort gracefully — suggest they run `/vault-query` first to populate it or pass a topic explicitly.
3. Pick mode:
   - **Default (priority-ranked)**: compute leverage score per open question. Leverage = count of existing pages in `pages/` whose own open questions (unanswered items under "What's still unclear", unresolved "Tensions & contradictions", or explicit TODOs) would be resolved if this research answered it. Use Claude semantic judgement on page contents — NOT keyword overlap. Pick highest leverage. Ties broken by oldest timestamp.
   - **With `--oldest` flag**: restore FIFO. Pick oldest `- [ ]` entry by timestamp. Ties broken arbitrarily.
4. Show the user the pick: question text, leverage score (or "FIFO" if `--oldest`), and the list of pages that would benefit (wikilinked). Ask one-line confirmation before spending WebFetch budget. (Skip confirmation only if user explicitly said "just go" / "don't ask".)

## Procedure

### Round 1 — orient

0.5. **Read policy** (if present). Look for `~/.claude/vault/projects/<slug>/raw/policy-<topic-slug>.md`. Cache for all rounds.
   - **Missing exact slug** → scan all `raw/policy-*.md` files for topical overlap with current topic. Score each by: (a) topic-stem token overlap, (b) `topic_class` match against the current topic's likely class, (c) tag overlap if topic has implicit tags. If any candidate scores above threshold (e.g., ≥3 stem tokens shared OR `topic_class` match + ≥2 stem tokens), use it as **advisory** — read fields, apply softer (medium-confidence behavior regardless of policy's stated confidence). Tag page frontmatter `policy_status: advisory-from-<source-policy-slug>`. Surface in main-context confirmation: "No exact policy. Using [[<broader-policy>]] as advisory guidance — proceed?". Wait for user confirmation before spawning.
   - **No exact AND no overlap** → default-fallback policy (least-restrictive: blocklist-only, no class enforcement). Tag synthesis page frontmatter `policy_status: missing`. Never block research.
   - **Present** → parse frontmatter. Set WebSearch params by `confidence_in_assessment`:
     - `high` → pass `allowed_domains: <authoritative_domains>` to all WebSearch calls.
     - `medium` → pass `allowed_domains` on round 1 query 1 only; drop on backup queries (rerank-style).
     - `low` → no allowlist, only `blocked_domains: <blocklist_extra + global>`.
   - Append topic-class authority phrase to query: `technical-spec` → `"RFC" OR "specification"`; `academic` → `"peer-reviewed"`; `vendor-comparison` → `review OR benchmark`; `current-events` → `2026`; `foundational` → `"textbook" OR "introduction"`; `hyped-domain` → no append (allowlist does work).
   - **Escalation**: allowlist returns <3 results → drop most-restrictive query terms (1 retry) → try `dissent_likely_locations` as allowlist → fall back to blocklist-only with warning. Cap 2 retries. Log to frontmatter `policy_compliance.escalation: ["allowlist-thin"]`.
   - Tag synthesis page frontmatter `quality_policy: <topic-slug>`.

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

Adds ~1-2 WebFetch calls for a mandatory counter-evidence pass before writing. NOT optional. The `--challenge` flag still triggers the deeper Round 4.

1. Ask: **what is the user likely trying to understand or decide?**
2. **Counter-evidence pass (mandatory, policy-aware)** — before assembling `## Tensions & contradictions`, identify the 2-3 strongest claims the synthesis will rest on.
   - **If policy present**: read `dissent_classes_required`. Run ONE class-targeted `WebSearch` per required class:
     - `academic` → allowlist `arxiv.org, scholar.google.com, aclanthology.org`.
     - `regulatory` → allowlist `*.gov, eur-lex.europa.eu` + regulator domains.
     - `practitioner` → blocklist mode + `"<claim>" postmortem OR "in production" OR incident`.
     - `adversarial` → blocklist mode + `"<claim>" criticism OR "X is wrong" OR limitations`.
     - `industry-analyst` → allowlist `gartner.com, forrester.com`.
   - Class returns 0 results → append class to `dissent_classes_missing` in synthesis page frontmatter. Surface in `## Tensions & contradictions` as a quality signal ("counter-evidence thin in <class>"). Do NOT fail hard.
   - All required classes return 0 → annotate Tensions: "counter-evidence thin across all required classes; lower confidence."
   - **If `risk_flags` contains `hype-cycle`**: ALSO run an adversarial query irrespective of `dissent_classes_required`.
   - **Policy missing**: fall back to 1-2 generic searches: `"<claim> limitations"`, `"<claim> failure cases"`, `"against <claim>"`, `"<claim> does not"`.
   - `WebFetch` the most credible dissent per class. Use these results to populate the Tensions section ACTIVELY — do not rely only on what surfaced organically in rounds 1-2.
   - Frontmatter additions: `dissent_classes_required`, `dissent_classes_found`, `dissent_classes_missing`.
3. Write the synthesis at `projects/<slug>/pages/<topic-slug>.md`:

   ```markdown
   ---
   title: <topic>
   created: <ISO-8601 date>
   source: autoresearch
   tags: [...]
   rounds: 3
   verification: quick
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

### Round 4 — adversarial challenge (only if `--challenge`)

Run ONLY if caller passed `--challenge`. Executes AFTER round 3 synthesis page is written. Budget: ~3-5 extra WebFetch calls.

1. Extract the 3-5 strongest claims from the synthesis (the ones the page most relies on).
2. For each claim, `WebSearch` for counter-evidence: negation queries ("X does not", "X fails when", "why X is wrong"), critiques, failure case reports, known exceptions.
3. `WebFetch` the most credible dissenting primary sources. Prefer sources that tested the claim empirically.
4. Classify each claim into one bucket:
   - **Held up** — counter-search found no credible rebuttal; claim survives.
   - **Weakened** — credible counter-evidence exists; narrow scope, add caveat, or flag the conflict.
   - **Unfalsified** — no one has actually tested it. Popular assertion lacking empirical challenge. Flag as "untested consensus".
5. Append to the synthesis page (do NOT overwrite earlier sections):

   ```markdown
   ## Adversarial challenge

   ### Claims that held up
   - <claim> — searched for counter-evidence, none credible. ([counter-search](url))

   ### Claims weakened
   - <claim> — <how it was weakened> ([dissenting source](url))

   ### Claims unfalsified (no one has tested)
   - <claim> — widely repeated but no empirical challenge found.
   ```

6. Update page frontmatter: bump `rounds: 3` → `rounds: 4` and add `challenged: true`.
7. Log entry gains ` — challenged` suffix: `... — <answered-from-queue | topic-explicit> — challenged`.

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
