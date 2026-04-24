---
name: vault-challenge
description: >
  Adversarial falsification for a synthesis page. Takes an existing page,
  pulls its main claims from ## Synthesis and ## Key facts, then actively
  searches for counter-evidence, limitations, failure cases, and dissent.
  Classifies each claim as HELD UP / WEAKENED / UNFALSIFIED and appends
  an ## Adversarial challenge section to the same page. Fills the Popper
  gap — /vault-autoresearch confirms-then-synthesizes, this one stress-tests.
  Use when user says: /vault-challenge, /vault-challenge [[page-slug]],
  "challenge this page", "stress-test this research", "find counter-evidence
  to X", "falsify Y", "try to disprove this".
---

# vault-challenge

Adversarial falsification. Points Popper at a synthesis page and sees what survives.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. Target page must exist at `pages/<page-slug>.md`.

## Inputs

- **Page** (explicit): `/vault-challenge [[page-slug]]` or `/vault-challenge page-slug` — wikilink or bare slug, both accepted.

## Execution model

Runs in an isolated subagent. Confirmation for re-challenge happens BEFORE spawning so the agent gets a complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`.
2. Parse argument: strip `[[` / `]]` wrappers, extract bare `<page-slug>`. Abort if no argument.
3. Verify `~/.claude/vault/projects/<slug>/pages/<page-slug>.md` exists. If not, abort with clear error.
4. Read the page's frontmatter. If `challenged:` field already present, ask user: "Page was challenged on <date>. Overwrite existing ## Adversarial challenge section, add as v2 alongside, or cancel?" Wait for answer before spawning.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-challenge for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Target page: pages/<page-slug>.md
    Mode: <first-run | overwrite | v2>

    Follow the full procedure in the vault-challenge skill. Return ONLY:
    - "Challenged [[<page-slug>]]. N claims: X held / Y weakened / Z unfalsified. See ## Adversarial challenge section."
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Read the target page

Read `pages/<page-slug>.md`. Extract main claims from:
- `## Synthesis` — distill the 3-5 core load-bearing claims, not every sentence.
- `## Key facts` — each bulleted fact is a candidate claim.

Merge and dedupe. Cap at **5 claims** — pick the most load-bearing ones (those the page's thesis rests on, not minor incidentals).

### 2. Adversarial search per claim

For each of the (up to 5) claims, run targeted counter-evidence searches. Use variations like:
- `"<claim>" limitations`
- `"<claim>" criticism`
- `"<claim>" failure cases`
- `against "<claim>"`
- `"<claim>" does not work when`
- `"<claim>" counterexample`
- Primary-source searches for known dissenting authors/camps in the domain

Also WebSearch for review papers, postmortems, and benchmark failures that might contradict the claim.

### 3. Fetch top counter-sources

For each claim, `WebFetch` the top 2-3 results that look like genuine counter-evidence (not mere restatements of the original claim). Extract:
- What the counter-source actually says
- Whether it contradicts the claim directly, qualifies its scope, or is orthogonal
- Source credibility signal (primary research, practitioner postmortem, opinion, etc.)

### 4. Classify each claim

For each claim, assign one of three labels:

- **HELD UP** — adversarial search returned nothing substantive; counter-sources either don't exist or don't contradict. Claim is robust under pressure.
- **WEAKENED** — genuine counter-evidence found; claim survives only with qualification (scope limit, edge case, context-dependent). Note exactly what changes.
- **UNFALSIFIED** — no empirical tests either way. No one has seriously tried to disprove it. Claim survives by absence of challenge but should carry lower confidence.

Do NOT manufacture doubt where there is none. HELD UP is a valid, important outcome — many well-sourced claims genuinely hold up.

### 5. Append ## Adversarial challenge section

Append to the SAME page (never create a new page). Structure:

```markdown
## Adversarial challenge

Challenged: <ISO-8601 date>

### Claims that held up
- <claim> — searched for counter-evidence, found none substantive. Checked: [source-a](url), [source-b](url).

### Claims weakened
- <claim> — counter-evidence: <finding> ([source](url)). Original claim needs qualification: <what specifically changes>.

### Claims unfalsified
- <claim> — no empirical tests found. Claim survives by absence of challenge; treat with lower confidence.
```

If re-challenge mode = **v2**, append as `## Adversarial challenge (v2)` below the existing section. If mode = **overwrite**, replace the existing `## Adversarial challenge` section in place.

### 6. Update frontmatter

Add `challenged: <ISO-8601 date>` field to the page's frontmatter. If field already exists (overwrite mode), update the date.

### 7. Log

Append to `log.md`:
```
- <timestamp> — CHALLENGE — [[<page-slug>]] — N claims: X held / Y weakened / Z unfalsified
```

### 8. Queue reconciliation work for weakened claims

For each claim classified as WEAKENED, append a new `- [ ]` line to `questions.md`:
```
- [ ] <timestamp> — Reconcile weakened claim: <claim text> — from CHALLENGE of [[<page-slug>]]
```
This becomes a future research item for `/vault-autoresearch` to pick up.

### 9. Return compact summary

```
Challenged [[<page-slug>]]. N claims: X held / Y weakened / Z unfalsified. See ## Adversarial challenge section.
```

## Rules

- NEVER delete or modify original content. Only append the new section + add/update the `challenged:` frontmatter field.
- Cite every counter-evidence claim with a URL. No unsourced doubt.
- Don't manufacture doubt — HELD UP is a legitimate outcome, not a failure of the challenge.
- Cap at 5 claims per run. More can be done in a follow-up invocation on the same page.
- If a claim is too vague to falsify ("this is important"), skip it and note "claim too vague to test" rather than force a classification.
- Re-challenge allowed but must be explicit (overwrite / v2) — never silently clobber a prior challenge.
- WEAKENED claims always produce a `questions.md` entry — the reconciliation work is the whole point.
