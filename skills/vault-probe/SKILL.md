---
name: vault-probe
description: >
  Blind-spot detection for the current project's vault. Reads overview.md
  (the thesis) and enumerates pages/, then asks: "given this thesis, what
  important angles is the vault NOT covering?" Returns a ranked list of
  conceptual gaps the user did not articulate. Distinct from questions.md
  (known gaps) — probe surfaces UNKNOWN gaps via systematic angles:
  structural prerequisites, adjacent territory, failure modes, stakeholder
  perspectives, temporal/scale/economic axes, competing frameworks.
  Use when user says: /vault-probe, "what am I missing", "find blind spots",
  "what should the vault cover but doesn't", "probe for gaps",
  "critique the vault coverage". Flags: --web (validate gaps against public
  domain discourse via 1-2 WebSearches), --harsh (amplify adversarial
  scrutiny, surface uncomfortable gaps).
---

# vault-probe

Blind-spot detection. Scans vault coverage against thesis, returns ranked gaps the user did NOT articulate.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. `overview.md` must exist. `pages/` must have ≥ 5 entries — fewer than that and the probe has nothing to triangulate against. Warn and abort if thin.

## Inputs

- **Default**: `/vault-probe` — scans whole vault, no web validation.
- **`--web`**: opt-in 1-2 WebSearches per high-relevance blind spot to validate against what practitioners/researchers consider standard coverage.
- **`--harsh`**: amplify. Stronger adversarial scrutiny, surface uncomfortable gaps. About rigor, not cruelty — still constructive.

## Execution model

Runs in an isolated subagent. Main context resolves slug, parses flags, verifies precondition, then spawns the agent with a complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Verify `~/.claude/vault/projects/<slug>/overview.md` exists. If missing, abort: "No overview.md — run /vault-init or write a thesis first."
3. Count entries in `pages/`. If < 5, warn and abort: "Vault has <N> pages. Probe needs ≥ 5 to triangulate. Add more pages first (/vault-autoresearch, /vault-ingest)."
4. Parse flags: `--web` and `--harsh` (mutually compatible). Default mode if neither.
5. Check for existing `pages/probe-<YYYY-MM-DD>.md` for today. If present, ask user: "Probe for today exists at [[probe-<date>]]. Overwrite, v2 suffix, or cancel?" Wait for answer before spawning.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-probe for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Mode: <default | --web | --harsh | --web --harsh>
    Today's date: <YYYY-MM-DD>
    Existing probe decision (if re-run): <first-run | overwrite | v2>

    Follow the full procedure in the vault-probe skill. Return ONLY:
    - "Probed [[probe-<date>]]. N blind spots: X high / Y med / Z low. Top gap: '<title>'. Top 3 added to questions.md."
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Read the thesis

Read `overview.md` fully. Extract:
- What the project is about (1-2 sentences of thesis)
- What questions/claims the thesis commits to
- What scope it implicitly claims (domain, audience, temporal frame)

### 2. Enumerate coverage

List every file in `pages/`. For each, capture:
- Title (from frontmatter)
- Tags
- A 1-line summary (read `## Synthesis` / `## Summary` / first paragraph)

Build the coverage map: what topical territory does the vault occupy? Note clusters, density, and thin regions.

### 3. Identify blind spots

Work through these angles systematically. For each angle, ask: "given the thesis, what SHOULD exist in this dimension that doesn't?"

- **Structural prerequisites** — concepts the vault treats as given but never explains. Example: vault discusses JWT rotation but has no page on TLS handshake or cert transparency.
- **Adjacent territory** — domains the thesis implies but the vault ignores. Example: thesis is about auth, but no pages on session fixation, CSRF, OAuth scopes.
- **Failure modes** — the vault lists how things work but not how they fail.
- **Stakeholder perspectives** — whose view is absent? Implementers, auditors, attackers, regulators, end users.
- **Temporal axes** — historical evolution of the topic, or future trajectory.
- **Scale axes** — the vault covers one regime (e.g., microservices) but ignores others (monolith, serverless, embedded).
- **Economic/social axes** — cost, incentives, political/regulatory pressures.
- **Competing frameworks** — alternative approaches the vault doesn't compare against.

Blind spots must be **specific**. Forbidden: generic "could be more detail on X". Required: name the concrete missing concept.

Do NOT invent blind spots where coverage is genuinely adequate. "Vault covers this well" on an angle is a valid, important finding.

### 4. Rate each blind spot

For each identified gap:
- **Relevance to thesis**: High / Med / Low
- **Difficulty to fill**: hours of research (rough)
- **Payoff**: how much it would reshape the vault's understanding

### 5. Web validation (only if `--web`)

For each **high-relevance** blind spot, run 1-2 targeted WebSearches:
- `"<domain>" standard topics` / `"<thesis>" core concepts practitioners`
- `what do researchers working on <thesis> consider required reading`

Surface things the vault misses that the field treats as table-stakes. If web-search shows a gap is widely discussed and the vault is silent on it, boost its relevance to High.

Cap: 2 WebSearches per high-relevance gap. Don't exceed ~8 searches total.

### 6. Harsh mode (only if `--harsh`)

In addition to the standard angles, apply these:
- What assumptions is the vault making that the best minds in the field would question?
- Which pages confirm user biases rather than stress-test them?
- Is the vault optimizing for breadth over depth, or vice versa, to its detriment?

Surface uncomfortable gaps. Still constructive — no cruelty, no vague criticism. Each harsh finding must name the specific assumption or bias and why it matters.

### 7. Write the probe page

Write to `pages/probe-<YYYY-MM-DD>.md` (or overwrite / v2 per pre-spawn decision):

```markdown
---
title: Probe — <date>
created: <ISO-8601 date>
source: vault-probe
mode: <default | --web | --harsh | --web --harsh>
tags: [probe, blind-spots, meta]
---

# Probe — <date>

## Thesis covered

<1-2 sentence restatement of overview.md thesis + what the vault currently covers>

## High-relevance blind spots (top 3-5)

### 1. <blind spot title>
**What's missing:** <concrete description — name the specific concept>
**Why it matters for the thesis:** <reasoning>
**Difficulty:** <time estimate>
**Payoff:** <impact if filled>
**Next move:** `/vault-autoresearch "<suggested topic>"`

### 2. ...

## Medium-relevance

- <bullet list, one line each>

## Low-relevance (noted for completeness)

- <bullet list>

## Angle coverage matrix

| Angle | Status |
|-------|--------|
| Structural prerequisites | ✓ / ⚠ / ✗ |
| Adjacent territory | ... |
| Failure modes | ... |
| Stakeholder perspectives | ... |
| Temporal axes | ... |
| Scale axes | ... |
| Economic/social | ... |
| Competing frameworks | ... |
```

Legend: ✓ = adequate coverage, ⚠ = partial, ✗ = absent.

### 8. Append top 3 to questions.md

For each of the top 3 high-relevance blind spots, append to `questions.md`:
```
- [ ] <timestamp> — BLIND SPOT: <blind spot title> — from /vault-probe <date>
```
Dedupe against existing entries (case-insensitive substring match). If fewer than 3 high-relevance gaps exist, append whatever the top N are.

### 9. Log

Append to `log.md`:
```
- <timestamp> — PROBE — <N> blind spots (X high / Y med / Z low) — mode: <mode>
```

### 10. Return compact summary

```
Probed [[probe-<date>]]. N blind spots: X high / Y med / Z low. Top gap: '<title>'. Top 3 added to questions.md.
```

## Rules

- Minimum 5 pages in `pages/`. Fewer than that → warn and abort; probe has nothing to triangulate.
- Blind spots must be SPECIFIC. Name the concrete missing concept. Forbid generic "could be more detail on X".
- Don't invent gaps where coverage is genuinely adequate. "Vault covers this well" is a valid finding per angle.
- `--harsh` mode is about rigor, not cruelty. Findings stay constructive — each harsh gap names the specific assumption or bias.
- `--web` caps at 2 WebSearches per high-relevance gap (~8 total). Don't burn budget validating low-relevance gaps.
- Never overwrite an existing `probe-<date>.md` without explicit user OK (overwrite / v2 / cancel).
- Top 3 high-relevance gaps ALWAYS feed `questions.md` — the queue is the whole point of running this.
- Angle coverage matrix is mandatory. Even if a probe surfaces zero blind spots, the matrix shows which angles were checked.
