---
title: vault-autoresearch --parallel mode design
created: 2026-04-23
status: research-only (no implementation)
inputs:
  - /Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md
  - /Users/lucafuccaro/.claude/skills/vault-synthesize/SKILL.md
  - https://github.com/nvk/llm-wiki (README.md, AGENTS.md)
---

# vault-autoresearch `--parallel` mode — design

Breadth-first scoping mode for entering a new domain. Complement, not replacement, of the depth-first 3-round loop.

---

## 1. Anchor: what exists today

### Current `/vault-autoresearch` (sequential, depth-first)

- File: `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md`
- 3-round loop: orient (L83-89) → deepen (L91-96) → synthesize (L98-152). Optional adversarial round 4 with `--challenge` (L154-180).
- Topic resolution: explicit arg, or priority pick from `questions.md` (L70-79).
- Output: single synthesis page at `pages/<topic-slug>.md` with sections Synthesis / Key facts / Tensions / What's still unclear / Related (L102-134).
- Dot-connecting at end of round 3: conflicts, unblocks, non-obvious cross-domain link (L182-187).
- Spawned in isolated subagent (L43-65). User confirms topic BEFORE spawn.
- Compounding moves: closes the queue line (L138-142), appends new gaps (L144), updates `index.md` + `log.md` (L146-151).

Strength: depth, dialectic refinement (round-2 looks for counterexamples to round-1, round-3 reconciles).
Weakness: narrow path. Round 1 picks ~5-10 URLs; if those URLs all share a frame (e.g. all from one community), rounds 2-3 deepen INSIDE that frame. Bad fit when user is new to the domain and doesn't know the frames yet.

### Current `/vault-synthesize` (cross-page recombination)

- File: `/Users/lucafuccaro/.claude/skills/vault-synthesize/SKILL.md`
- Takes 2-5 EXISTING pages, produces juxtaposition page (L60-138).
- 4-pass structure: shared concepts → tensions → gaps → non-obvious connections (L72-81).
- Output: `pages/<synthesis-slug>.md` with Premise / Shared concepts / Tensions / Non-obvious connections / What this unlocks / Open / Sources (L98-138).
- This is the TEMPLATE for the merge step in `--parallel` mode (see §6 below). The "non-obvious connections" pass (L81) is what `--parallel` needs at the merge stage to spot cross-angle tensions.

### nvk/llm-wiki `/wiki:research` (parallel, breadth-first)

- README confirms: 5-10 parallel agents, fixed personas — academic / technical / applied / news / contrarian (Standard); +historical / +adjacent-field / +data-stats (Deep, 8); +rabbit-hole + aggressive ingest (Retardmax, 10).
- Two decomposition pathways: TOPIC-BASED (5 perspectives fan out on the same topic) or QUESTION-BASED (decompose into 3-5 sub-questions, one agent per sub-question).
- `--plan` flag: decompose → confirm → dispatch (mirrors current vault-autoresearch's "confirm before spawn" — fits cleanly).
- `--min-time <dur>` flag: multi-round, each round drills gaps from prior iteration. Anti-confirmation: thesis mode emphasizes weaker side in later rounds.
- Output: synthesized wiki article. No formal "landscape" type — they fold breadth and depth into one document type.

Key takeaway for vault: nvk's PERSONA approach is the breadth lever. 5 personas guarantee 5 distinct frames, which is exactly what defends against the "round-1 URL-set frames the whole investigation" failure mode.

---

## 2. Use case — when parallel beats sequential

| Situation                                                  | Use     | Why                                                                   |
|------------------------------------------------------------|---------|-----------------------------------------------------------------------|
| Entering a brand-new domain, no existing pages             | **par** | Need to map the territory before deepening. Sequential picks one trail blindly. |
| Comparing competing frameworks (e.g. "X vs Y vs Z")        | **par** | Each framework deserves a parallel angle. Sequential biases to whichever framework appears in round-1 URLs. |
| Scoping the landscape of a tool/technology category         | **par** | Vendor sprawl. Sequential rounds-2+3 may never escape the round-1 vendor cluster. |
| Decision-making across stakeholder perspectives             | **par** | "What does the engineer / compliance / researcher each need from X?" — natural parallel decomposition. |
| Depth on a known sub-question, with framing already chosen | **seq** | Dialectic refinement (round-2 challenges round-1) is the value. Parallel would dilute. |
| Adversarial stress-test of a synthesis page                 | **seq** | Use `--challenge` (already exists). Parallel personas would just re-confirm. |
| Pulling from `questions.md` queue                           | **seq** | Queue items are already-scoped. They've passed through prior research. Depth is what's missing. |
| Topic where vault already has 3+ overlapping pages          | **seq** | Use `/vault-synthesize` to recombine existing pages. Parallel adds noise. |

Mental model: **parallel = mapmaker, sequential = explorer**. Map first, then explore. Currently `/vault-autoresearch` only ships the explorer. `--parallel` adds the mapmaker.

---

## 3. Sub-question decomposition

Two decomposition strategies, agent picks based on topic shape:

### 3a. Persona decomposition (lift from nvk; default for noun-shaped topics)

Topic is a domain/category/technology. Default 5 personas:

1. **Landscape** — existing solutions, taxonomy, who's playing in this space
2. **Mechanics** — domain primitives, core concepts, how it actually works
3. **Failure modes** — what goes wrong, regime changes, edge cases, post-mortems
4. **Stakeholder lens** — different actors and what each needs (engineer / researcher / operator / regulator)
5. **Adversarial** — critiques, dissent, "X is overhyped" / "Y doesn't work" — explicit anti-confirmation

Worked example: "agentic frameworks for quant trading" → exactly the sub-questions the user pre-listed:
- Landscape → LangChain / AutoGen / custom-built / Letta / etc.
- Mechanics → backtesting, signal generation, order routing, execution
- Failure modes → overfitting, regime change, latency, lookahead bias
- Stakeholder lens → quant researcher / infra engineer / compliance officer / PM
- Adversarial → "agentic frameworks for trading is a category error" / "just use SQL" / regulatory blockers

### 3b. Question decomposition (when topic is question-shaped)

Topic is a "what / why / how" question (e.g. "What makes a vault useful long-term?"). Decompose into 3-5 sub-questions:
- Operator framing: what does the user mean to learn?
- Each sub-question becomes a parallel angle.
- Less rigid than personas — agent has license to invent the angles.

This pathway mirrors nvk's "Question-Based" decomposition.

### Decomposition step lives in main context, BEFORE spawn

User confirms the decomposition before WebFetch budget is spent. Mirrors existing `--challenge` confirmation pattern. Critical because:
- Bad decomposition = N agents producing N redundant or N off-target findings
- User often spots overlap / missing angle in 5 seconds that would cost 5 agent-rounds to discover
- Aligns with nvk `--plan` flag pattern

---

## 4. Number of parallel agents

| N    | Coverage      | Cost (WebFetch) | When                                              |
|------|---------------|-----------------|---------------------------------------------------|
| 3    | Tight         | ~15-20 calls    | Narrow domain, well-bounded, low confidence in budget |
| **5** | **Default**   | **~25-40 calls** | **New domain, balanced scope. Match nvk Standard.** |
| 7    | Wide          | ~35-55 calls    | Cross-disciplinary, comparing 3+ frameworks       |
| 10   | Saturated     | ~50-80 calls    | Maximum scope. nvk "Retardmax". Likely overkill for vault use cases. |

Recommendation: default = **5**, configurable via `--parallel <N>` with N in [3, 7]. Cap at 7 for v1. Skip Retardmax — vault is opinionated/curated; saturation produces noise.

Rationale for 5: matches nvk default, matches the persona decomposition (5 personas), small enough that merge step doesn't drown.

---

## 5. Agent isolation & brief

Each parallel agent is its own subagent (Agent tool, `general-purpose` type — same as current autoresearch). Inputs:

- Main topic (verbatim, same string for all agents)
- Assigned sub-question / persona name + persona prompt
- Project slug (so agents write to same `raw/` folder)
- Forbidden URLs (de-dup: if agent N=1 fetched URL X, the merge step gets a single source-of-truth, but during fan-out we accept overlap — see §10)
- Caveman lite directive (consistent with main skill prompt convention, L41 of vault-autoresearch SKILL.md)

Each agent runs a mini 1-round loop:
1. WebSearch from its persona angle (5-7 URLs each)
2. WebFetch top 3-4 most relevant
3. Write findings to `raw/autoresearch-<topic-slug>-parallel-<persona>.md` with structured shape:
   - Persona / sub-question stated
   - 5-10 cited claims
   - 1-2 surprises (what was unexpected from this angle)
   - Open questions this angle exposes
   - URLs visited

Critical: agents do NOT write to `pages/`. Only the merge step does.

Critical: agents are **independent** — no inter-agent communication during fan-out. Spawning is concurrent (single message with N Agent calls). Sequential coordination defeats the purpose.

---

## 6. Merge step — landscape page

After all N agents return, main context spawns ONE more agent: the **synthesist**. This is where `/vault-synthesize`'s template gets repurposed.

Synthesist inputs:
- All N raw findings files (`raw/autoresearch-<topic-slug>-parallel-<persona>.md`)
- Main topic
- Project slug + existing pages list (for cross-linking)

Synthesist procedure:
1. Read all N raw files. (NOT the URLs again — agents already fetched.)
2. Apply 4-pass structure from `/vault-synthesize` SKILL.md L72-81:
   - Shared concepts across personas
   - Tensions (where personas disagree on the same fact)
   - Gaps (questions one persona raised, another touched but didn't resolve)
   - Non-obvious connections (the value-add — cross-persona structural links)
3. Write **landscape page** (distinct from synthesis page — see §7).
4. Cross-link to existing vault pages.
5. Append unresolved questions to `questions.md` (capped at 5, dedupe — same rules as existing autoresearch L144).
6. Update `index.md` and `log.md` with a `LANDSCAPE` entry.

Why a separate merge step rather than synthesist running inline in main context: same reason existing skill spawns subagents — isolation, dedicated brief, the synthesist's whole job is the 4-pass and shouldn't compete with main context's coordination work.

---

## 7. Output format — "landscape" page (new type)

Argument for distinct type vs reusing synthesis page:

**Reuse synthesis-page format**: pro = simpler, fewer page types in vault, lint stays simple. Con = synthesis-page assumes coherent unified understanding ("3-5 paragraphs: what we now know, coherent understanding" per L116). Landscape pages are explicitly NOT unified — they're a map of multiple co-existing positions. Forcing them into "Synthesis" prose lies about the epistemic state.

**Distinct landscape format**: pro = honest about what it is (a map, not a verdict). Pro = downstream `/vault-autoresearch` (sequential mode) can take the landscape's "Recommended depth follow-ups" and queue them. Con = one more type for `/vault-lint` to know about (small cost — just frontmatter `source: autoresearch-parallel` and `type: landscape`).

**Recommendation: distinct type.** The landscape's epistemic shape genuinely differs from the synthesis. Hiding the difference invites bad downstream behavior (e.g. `/vault-integrate` treating landscape claims as load-bearing facts when they're surveyed positions).

Proposed schema:

```markdown
---
title: <topic> landscape
created: <ISO-8601>
source: autoresearch-parallel
type: landscape
tags: [...]
parallel_agents: <N>
personas: [landscape, mechanics, failure-modes, stakeholders, adversarial]
---

# <topic> — landscape

## Map

<2-3 paragraph orientation: what is this domain, what's the shape of the territory, what are the major axes/dimensions players differ on>

## Per-angle findings

### Landscape (existing solutions)
- Key players, taxonomy, citations
- Surprises

### Mechanics (domain primitives)
...

### Failure modes
...

### Stakeholder lens
...

### Adversarial
...

## Cross-cutting tensions

<Where personas DISAGREE on the same fact, or optimize for different constraints. This is the cross-page-style juxtaposition lifted from /vault-synthesize.>

## Non-obvious connections

<The mapmaker's value-add: structural patterns across angles that no single persona surfaced. Same standard as /vault-synthesize SKILL.md L81 — name the mechanism, not the analogy.>

## Recommended depth follow-ups

- [ ] <sub-question> — feed to `/vault-autoresearch` (sequential)
- [ ] <sub-question> — feed to `/vault-autoresearch --challenge`
- ...

## Sources

- Per-persona raw files: [[raw/autoresearch-<topic>-parallel-landscape]], ...
- Existing pages cross-linked: [[...]]
```

---

## 8. Invocation

Proposed CLI surface:

```
/vault-autoresearch "topic" --parallel              # default N=5
/vault-autoresearch "topic" --parallel 7            # custom N
/vault-autoresearch "topic" --parallel --personas <a,b,c>   # override default personas (advanced)
/vault-autoresearch "topic" --parallel --question-mode      # force question-decomposition path
```

Not allowed:
- `--parallel --challenge` — challenge is depth-first by design. Combine via two runs.
- `--parallel --quick` / `--parallel --deep` — depth flags don't apply (agents run 1 round each by definition).
- `--parallel` with no topic and queue-pick — see §9.

---

## 9. Compatibility with priority queue (`questions.md`)

Existing priority queue is depth-first by purpose: each entry is a known gap that wants depth research. Parallel mode is for NEW domains, not testing-known-gaps. So:

**Default: queue does NOT invoke parallel.** `/vault-autoresearch` with no args still pulls priority pick → sequential. Matches existing behavior.

**Possible exception (defer to v2):** queue entry tagged `[scope]` or matching pattern "what is X" / "landscape of Y" could opt into parallel. Mechanism: queue line gets a `--parallel` hint, e.g.
```
- [ ] <ts> — Landscape of agentic trading frameworks — from QUERY "..." [scope]
```
At pick time, if the entry has `[scope]`, suggest parallel. Not core to v1.

**Hard rule: never silently switch modes.** If user passes `/vault-autoresearch --parallel` with no topic, fail loudly: "Parallel mode needs an explicit topic. Queue picks are depth-first." Don't auto-promote a queue entry.

---

## 10. Edge cases

| Case                                       | Handling |
|--------------------------------------------|----------|
| Topic too narrow (e.g. "JWT exp claim")    | Pre-decomposition check: if topic is < 5 words AND maps to a single primitive, suggest sequential and show why. User can override with `--parallel --force`. |
| Persona returns empty / sparse             | Synthesist marks angle "thin" in landscape page. Doesn't fail the run. Append a follow-up question to queue: "Why is `<persona>` angle sparse for `<topic>`?" |
| Two personas return contradictory facts    | Surface in "Cross-cutting tensions" section verbatim, with both citations. Don't reconcile in synthesist — that's depth work, kick to follow-up. |
| One agent fails (timeout, web error)       | Synthesist proceeds with N-1 angles. Landscape page frontmatter records `failed_personas: [name]`. Log entry notes degradation. Don't retry inline (cost). |
| All personas converge on same URLs         | Synthesist deduplicates citations but landscape STILL useful — convergence itself is signal ("the field has consensus"). Note convergence in Map section. |
| Topic already has a vault page              | Pre-spawn check: if `pages/<topic-slug>.md` exists, ask user — refresh as v2, or pick a different slug, or abort. Same as existing skill L195. |
| User aborts mid-fan-out                    | Spawned agents complete (can't kill child subagents reliably). Raw files land in `raw/`. No landscape page written. Append log entry "PARALLEL ABORTED, raw kept". |
| Concurrent /vault-autoresearch invocations | Out of scope. Existing skill doesn't handle concurrency either; leave as user discipline. |

---

## 11. Cost & confirmation

WebFetch budget per run, by N:
- N=3: ~15-20 fetches (3 agents × 4-6 fetches + maybe 1-2 in synthesist for verification)
- N=5: ~25-40 fetches (default)
- N=7: ~35-55 fetches

Comparison: standard 3-round sequential autoresearch is ~10-15 fetches. Parallel-5 is ~3x. Parallel-7 is ~5x.

**Confirmation step before spawn (REQUIRED for v1):**

```
Parallel autoresearch — topic: "<topic>"
Decomposition: 5 personas (landscape, mechanics, failure-modes, stakeholders, adversarial)
Estimated WebFetch budget: ~30 calls (vs ~12 for sequential)
Spawning 5 parallel agents + 1 merge agent.

Proceed? (yes / adjust personas / sequential instead / abort)
```

This confirmation is non-optional even if user says "just go" — because the cost delta is meaningful (3-5x). Same pattern would apply to `--challenge` if revisited.

---

## 12. Things deliberately NOT in v1

- **Multi-round parallel** (nvk's `--min-time`). Defer. Single round of N personas is the MVP.
- **Anti-confirmation rebalancing** (nvk's "emphasize weaker side in later rounds"). Defer with multi-round.
- **Custom persona libraries.** v1 ships the 5 default personas. v2 could allow user-defined persona files at `~/.claude/vault/personas/<name>.md`.
- **Auto-promotion of landscape → depth research.** Landscape's "Recommended depth follow-ups" go to `questions.md`, user manually invokes sequential autoresearch. Auto-chaining defers to v2.
- **Inter-agent communication during fan-out.** Stays independent. Adding chatter complicates the model and slows it down.
- **Retardmax (10 agents).** Vault is curated; saturation = noise. Skip.

---

## 13. Recommendation: flag on autoresearch vs separate `/vault-landscape` skill

Both arguments:

### Argue for: separate `/vault-landscape` skill

- Different epistemic output (landscape ≠ synthesis page). Different output type wants its own skill.
- Different invocation contract (no queue picking, no `--challenge`, no `--quick/--deep`). Cleaner namespace.
- Discoverability: user types `/vault-` and TAB sees `landscape` as a distinct verb. "Map this domain" reads as a different intent than "research this topic".
- No risk of flag-combination confusion (`--parallel --challenge` = nonsense state).
- Better separation of concerns — the parallel runner has totally different machinery (fan-out spawn, persona briefs, merge agent) vs the sequential round loop. Bundling them into one SKILL.md fattens the file and risks one mode's edits breaking the other.

### Argue for: `--parallel` flag on `/vault-autoresearch`

- One mental entry point for "do research". User doesn't have to remember which verb.
- Shared infra: topic resolution, project precondition, log.md append, index update, frontmatter conventions, cross-linking. Avoid duplication.
- Consistent with how `--challenge` extends the same skill (L154-180) rather than living as `/vault-challenge` … wait, `/vault-challenge` actually IS a separate skill (per /vault-help registry). Precedent already exists for splitting depth-modifier modes off when the machinery diverges enough. That undercuts the "shared infra" argument.

### Pick

**Separate `/vault-landscape` skill.** Three deciding factors:

1. **Precedent**: `/vault-challenge` already exists as its own skill despite originally being a `--challenge` flag mode. The vault has shown that when machinery diverges, splitting wins. Parallel diverges MORE than challenge does (challenge is still single-agent, parallel is N+1 agents).
2. **Output type**: landscape page is a genuinely different artifact from synthesis page (§7). Different artifact → different skill.
3. **Invocation safety**: as a flag, `--parallel --challenge` and `--parallel --deep` and `--parallel` (queue-pick) all become invalid combinations the skill has to reject. As a separate skill, the surface area is just `/vault-landscape "topic" [-N <count>]`. Cleaner.

The existing `--challenge` flag should arguably also become a separate skill long-term to clean up vault-autoresearch SKILL.md, but that's out of scope for this design.

### v1 minimum viable spec

- Skill name: `/vault-landscape`
- Args: `"topic"` (required), `-N <3-7>` (optional, default 5), `--question-mode` (optional)
- Single-round, fixed 5-persona default
- Confirmation step before spawn (decomposition + cost)
- Spawns N parallel agents (single message, concurrent) + 1 merge agent (after all return)
- Output: `pages/<topic-slug>-landscape.md` with `type: landscape` frontmatter
- Cross-links existing pages, appends gaps to `questions.md` (cap 5)
- Log entry: `LANDSCAPE — [[<slug>-landscape]] — N personas — <takeaway>`
- Bypasses the queue. Topic must be explicit.

### Deferred

- Multi-round parallel (`--min-time`)
- Anti-confirmation rebalancing
- Custom persona files
- Queue auto-promotion via `[scope]` tag
- Retardmax mode

---

## 14. Open questions for follow-up

- Should landscape pages count toward `/vault-probe` blind-spot detection? (They explicitly map territory — probe might double-count.)
- Should `/vault-synthesize` accept landscape pages as inputs? (Yes, probably — they're rich. But the merge math is different — synthesis assumes coherent inputs, landscape inputs are themselves multi-frame.)
- What happens when two landscape pages overlap? Lint should flag. New rule for `/vault-lint`.
- Cost-benefit instrumentation: should we log per-run WebFetch counts to validate the 3-5x estimate empirically?

These belong in v2 scope.
