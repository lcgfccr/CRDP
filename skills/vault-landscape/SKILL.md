---
name: vault-landscape
description: >
  Breadth-first parallel research for entering a new domain. Fans out N personas
  (default 5: landscape / mechanics / failure-modes / stakeholders / adversarial)
  as independent sub-agents, each running a single WebSearch + WebFetch round
  from its own angle, then merges via the /vault-synthesize 4-pass pattern
  (shared concepts → tensions → gaps → non-obvious connections). Output is a
  distinct landscape page (not a synthesis page) — a map of co-existing
  positions, not a unified verdict. Complement to /vault-autoresearch
  (depth-first explorer); landscape is the mapmaker. Bypasses the priority
  queue. Use when user says: /vault-landscape, /vault-landscape "topic",
  "scope a new domain", "landscape research on X", "what's the landscape
  of X", "breadth-first research", "map this domain", "parallel research".
---

# vault-landscape

Breadth-first parallel scoping. Main context fans out N persona agents in parallel, then spawns one merge agent to reconcile. Produces a landscape page that maps the territory before depth.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. If not, ask whether to `/vault-init` first, or run ephemerally without saving.

## Inputs

- **Topic** (required, explicit): `/vault-landscape "agentic frameworks for quant trading"`. No queue picking — landscape is for NEW domains, not testing known gaps.
- **N** (optional): `-N 3-7`, default 5. Caps at 7 for v1. N=3 tight, N=5 default (matches default persona count), N=7 wide for cross-disciplinary or 3+ framework comparisons.

Not allowed:
- `/vault-landscape` with no topic. Fail loudly: "Landscape mode needs an explicit topic. Use /vault-autoresearch for queue picks."
- `--challenge`, `--quick`, `--deep` flags. Depth modifiers don't apply — agents run 1 round each by definition. Run a separate `/vault-challenge` afterward if needed.

## Execution model

Flat architecture: main context does the orchestration directly. No orchestrator subagent. Main context spawns N persona agents in parallel (single message, N concurrent Agent calls), waits for all to complete, then spawns 1 merge agent. Nested Agent calls from inside a subagent do NOT fan out reliably — only main-context calls do. Persona agents write findings to raw files; the merge agent reads those files (input flows through filesystem, not through main context).

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Topic must be passed as argument. If absent, abort: "Landscape mode needs an explicit topic. Use /vault-autoresearch for queue picks."
3. Slug the topic: `<topic-slug>`. Check `pages/<topic-slug>-landscape.md` does NOT exist. If it does, ask user — refresh as v2, pick different slug, or abort. Never silently overwrite.
4. Pre-decomposition guardrail: if topic is < 5 words AND maps to a single primitive (e.g. "JWT exp claim"), suggest sequential `/vault-autoresearch` instead and show why. User can override by re-invoking with explicit confirmation.
5. Parse `-N <count>`. Default 5. Clamp to [3, 7]. Reject outside that range.
6. **MANDATORY cost confirmation step (non-optional, even if user said "just go"):**
   ```
   Landscape research — topic: "<topic>"
   Decomposition: <N> personas (landscape, mechanics, failure-modes, stakeholders, adversarial)
   Estimated WebFetch budget: ~<25-40> calls (vs ~12 for sequential autoresearch — 3-5x)
   Spawning <N> parallel agents + 1 merge agent.

   Proceed? (yes / adjust personas / sequential instead / abort)
   ```
   Wait for explicit confirmation. The 3-5x cost delta vs `/vault-autoresearch` justifies the gate.

**Fan-out (after confirmation, main context):**

Main context issues N parallel `Agent()` calls in a SINGLE message — one tool block, N entries. This is the only place parallel fan-out reliably triggers in Claude Code; nested calls from inside a subagent serialize. See persona brief in section 1 below.

After all N persona agents return, main context spawns ONE merge agent (separate message). Merge brief in section 2 below.

**After merge agent returns:** Echo the merge agent's compact result verbatim. Add nothing.

## Procedure

### 1. Fan out — N parallel persona agents (single message, concurrent)

Main context spawns N agents in ONE message (single tool block with N parallel Agent calls). Sequential coordination defeats the purpose. Nested calls from inside a subagent serialize — the parallel block MUST originate from main context. Each agent runs independently, no inter-agent communication during fan-out.

Default 5 personas:

1. **Landscape** — existing solutions, taxonomy, frameworks, players in the space, vendor map. Question: "Who is doing this and how do they categorize themselves?"
2. **Mechanics** — domain primitives, technical building blocks, core concepts, how it actually works under the hood. Question: "What are the foundational moving parts?"
3. **Failure modes** — where solutions break, anti-patterns, regime changes, edge cases, post-mortems, known limitations. Question: "When and how does this go wrong?"
4. **Stakeholders** — who uses this, what each actor needs (engineer / researcher / compliance / operator / regulator / PM / etc.). Question: "Whose needs does this serve, and how do they differ?"
5. **Adversarial** — explicit anti-confirmation. Critical takes, dissent, "X is overhyped", "Y is a category error", regulatory blockers, structural critiques. Question: "What does the contrarian view say?"

Each persona agent gets this brief (caveman lite throughout):

```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    You are the <PERSONA> agent in a parallel landscape research run.
    Topic: "<topic>"
    Project slug: <slug>
    Persona: <persona-name>
    Persona angle: <one-line persona prompt from list above>

    Single-round procedure:
    1. Defensively `mkdir -p ~/.claude/vault/projects/<slug>/raw` before writing.
    2. WebSearch from your persona angle. Pull 5-7 distinct URLs.
    3. WebFetch top 3-4 most relevant.
    4. Write findings to: ~/.claude/vault/projects/<slug>/raw/landscape-<topic-slug>-<persona>-<date>.md

    Required shape for the raw file:
    ---
    title: <topic> — <persona> angle
    persona: <persona-name>
    topic: <topic>
    created: <ISO-8601 date>
    ---

    # <topic> — <persona> angle

    ## Persona / sub-question
    <one paragraph: what angle this persona brings, what sub-question it answers>

    ## Cited claims (5-10)
    - <claim> ([source](url))
    - ...

    ## Surprises (1-2)
    <what was unexpected from this angle>

    ## Open questions this angle exposes
    - <question>
    - ...

    ## URLs visited
    - <url> — <one-line note on what it contributed>

    Rules:
    - Cite every non-trivial claim with a URL.
    - Don't fabricate sources.
    - You do NOT write to pages/. Only the merge agent does.
    - You do NOT communicate with other persona agents. Independent run.

    Return ONLY:
    - Path of raw file written
    - One-sentence summary of your angle's headline finding
    - Count of claims, surprises, open questions
  """
)
```

If user-confirmed override of personas (e.g. dropped "Adversarial", added "Historical"), use that list verbatim. Default order: landscape → mechanics → failure-modes → stakeholders → adversarial.

### 2. Merge — synthesist agent (4-pass /vault-synthesize pattern)

After ALL N persona agents return, main context spawns ONE merge agent. (If a persona agent failed/timed out, proceed with N-1 and record `failed_personas: [name]` in frontmatter. Don't retry inline — cost.)

Merge agent brief:

```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    You are the merge agent for vault-landscape.
    Topic: "<topic>"
    Project slug: <slug>
    Topic slug: <topic-slug>
    Raw input files (read all that exist; missing means that persona failed):
    - ~/.claude/vault/projects/<slug>/raw/landscape-<topic-slug>-landscape-<date>.md
    - ~/.claude/vault/projects/<slug>/raw/landscape-<topic-slug>-mechanics-<date>.md
    - ~/.claude/vault/projects/<slug>/raw/landscape-<topic-slug>-failure-modes-<date>.md
    - ~/.claude/vault/projects/<slug>/raw/landscape-<topic-slug>-stakeholders-<date>.md
    - ~/.claude/vault/projects/<slug>/raw/landscape-<topic-slug>-adversarial-<date>.md
    Existing pages list: <enumerate pages/ for cross-linking>

    Procedure:
    1. Defensive setup: `mkdir -p ~/.claude/vault/projects/<slug>/pages ~/.claude/vault/projects/<slug>/outputs ~/.claude/vault/projects/<slug>/raw` before any write. Landscape writes to pages/, but ensure all three exist to avoid permission gotchas downstream.
    2. Read all N raw files fully. Do NOT re-fetch URLs — agents already did that.
    3. Apply 4-pass /vault-synthesize structure (in order, each builds on the last):
       a. SHARED CONCEPTS — ideas appearing across 2+ personas. Cap 5 most prominent. Note which personas reference each and how their framings differ.
       b. TENSIONS — where personas disagree on the same fact, or optimize for different constraints. Often implicit: persona A assumes X, persona B assumes not-X. Surface verbatim with both citations. Don't reconcile — that's depth work, kicked to follow-ups.
       c. GAPS — questions one persona raised that another touched but didn't resolve. Cross-persona gaps only visible when read together.
       d. NON-OBVIOUS CONNECTIONS — structural / methodological / analogical links the personas do NOT make explicit. Value-add. One paragraph minimum. Be concrete: name the mechanism, not the analogy. "Both mention X" is not a connection — "the failure mode persona's regime-change pattern is structurally isomorphic to the stakeholder persona's compliance-trigger pattern, and both fail under the same latency assumption" IS a connection.
    4. Write landscape page to pages/<topic-slug>-landscape.md (see schema below).
    5. Cross-link to existing pages in pages/ that touch this topic.
    6. Append unresolved questions to questions.md as new `- [ ]` lines. Dedupe case-insensitive substring against existing entries. Cap 5 new entries per run.
    7. Update index.md — add a wikilink under the `## Landscapes` heading (create the heading if missing). MANDATORY: do not skip this step. Past bug: index update was missed in /vault-analogize; do not repeat here.
    8. Append to log.md:
       - <timestamp> — LANDSCAPE — [[<topic-slug>-landscape]] — <N> personas — <1-line takeaway>

    Edge cases:
    - Persona returned empty/sparse: mark angle "thin" in landscape page, append a follow-up question to queue ("Why is <persona> angle sparse for <topic>?").
    - All personas converge on same URLs: dedupe citations, but note convergence in Map section as a signal ("the field has consensus").
    - Two personas contradict: surface in Cross-cutting tensions verbatim with both citations. Don't reconcile.

    Return ONLY:
    - Page path created
    - 3-sentence map summary
    - Per-persona one-line headline (or "thin" / "failed")
    - The single most non-obvious connection (1 sentence)
    - Count of gaps appended to questions.md
  """
)
```

### 3. Landscape page schema

The landscape page is a DISTINCT artifact type from synthesis pages. Frontmatter `type: landscape` is the discriminator — `/vault-lint`, `/vault-integrate`, and other consumers use this to avoid treating surveyed positions as load-bearing facts.

Write to `projects/<slug>/pages/<topic-slug>-landscape.md`:

```markdown
---
title: <topic> landscape
created: <ISO-8601 date>
source: vault-landscape
type: landscape
tags: [landscape, ...extracted from per-persona findings]
parallel_agents: <N>
personas: [landscape, mechanics, failure-modes, stakeholders, adversarial]
failed_personas: [<name>]  # omit if none
---

# <topic> — landscape

## Map

<2-3 paragraph orientation: what is this domain, what's the shape of the territory, what major axes/dimensions players differ on. If personas converged on the same sources, note that as a consensus signal.>

## Per-angle findings

### Landscape (existing solutions)

- Key players, taxonomy, citations
- Surprises

### Mechanics (domain primitives)

- ...

### Failure modes

- ...

### Stakeholders

- Engineer needs / researcher needs / compliance needs / etc.
- ...

### Adversarial

- Critiques, dissent, regulatory or structural blockers
- ...

## Cross-cutting tensions

<Where personas DISAGREE on the same fact, or optimize for different constraints. Verbatim with both citations. Don't reconcile here — kick to follow-ups.>

## Non-obvious connections

<The mapmaker's value-add: structural patterns across angles that no single persona surfaced. Same standard as /vault-synthesize: name the mechanism, not the analogy. If speculative, mark with `> Speculative: ...`.>

## Recommended depth follow-ups

- [ ] <sub-question> — feed to /vault-autoresearch (sequential)
- [ ] <sub-question> — feed to /vault-autoresearch --challenge
- ...

## Sources

- Per-persona raw files:
  - [[raw/landscape-<topic-slug>-landscape-<date>]]
  - [[raw/landscape-<topic-slug>-mechanics-<date>]]
  - [[raw/landscape-<topic-slug>-failure-modes-<date>]]
  - [[raw/landscape-<topic-slug>-stakeholders-<date>]]
  - [[raw/landscape-<topic-slug>-adversarial-<date>]]
- Existing pages cross-linked: [[...]]
```

### 4. Compounding moves

- Cross-link existing vault pages that touch any persona's findings (both directions: landscape → existing, AND existing page's `## Related` gets a back-link).
- Append "Recommended depth follow-ups" items to `questions.md` as `- [ ]` entries (cap 5, dedupe).
- MANDATORY: update `index.md` under `## Landscapes` heading (create heading if missing). Index update is non-skippable — orphaned pages are the most common bug across vault skills.
- Append `log.md` entry: `- <timestamp> — LANDSCAPE — [[<topic-slug>-landscape]] — <N> personas — <1-line takeaway>`.

## Bypasses priority queue

`/vault-landscape` is for NEW domains, not for testing known gaps. The priority queue (`questions.md`) holds depth-research items — those go to `/vault-autoresearch`. Landscape mode requires an explicit topic and never auto-promotes a queue entry.

This matches `/vault-challenge` precedent: depth-modifier modes that diverge enough get their own skill rather than living as a flag on `/vault-autoresearch`.

## Rules

- Topic must be explicit. No queue picks. No silent mode-switching.
- MANDATORY cost confirmation before spawn. Non-optional even if user said "just go" — 3-5x cost delta justifies the gate.
- Persona agents run independently. No inter-agent communication during fan-out. Spawning is concurrent (single message with N Agent calls).
- Persona agents do NOT write to `pages/`. Only the merge agent writes the landscape page.
- Cite every non-trivial claim with a URL. Don't fabricate sources.
- Tensions surface verbatim with both citations. Merge agent does NOT reconcile contradictions — that's depth work, kicked to `/vault-autoresearch` follow-ups.
- "Non-obvious connections" must be concrete: name the mechanism, shared failure mode, or shared leverage point. No "they're both about X" platitudes.
- Speculative connections stay marked `> Speculative: ...`.
- Frontmatter `type: landscape` is mandatory — distinguishes from `synthesis` pages so downstream skills don't treat surveyed positions as load-bearing facts.
- Never overwrite an existing landscape page without explicit OK — ask: append, v2, or rename.
- If a persona agent fails, proceed with N-1 and record `failed_personas: [name]` in frontmatter. Don't retry inline.
- All persona overrides happen at confirmation step. Default 5 personas otherwise. Cap at N=7 for v1.
- Landscape page output goes to `pages/<topic-slug>-landscape.md` — the `-landscape` suffix prevents collision with sequential `/vault-autoresearch` outputs on the same topic.
- Flat architecture: main context spawns N persona agents in one parallel message, then 1 merge agent. No orchestrator subagent. Nested Agent calls inside a subagent serialize and break the parallel speedup — keep all spawns at main context.
- Persona agents write raw files to `raw/landscape-<topic-slug>-<persona>-<date>.md`. Merge agent reads those files (input via filesystem, not main-context message-passing).
- Merge agent runs `mkdir -p pages outputs raw` defensively before any write.
- Caveman lite throughout: persona briefs, merge brief.
