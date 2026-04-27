---
name: vault-policy
description: >
  Topic-aware source policy generator. Before research fires, runs a 7-question
  reasoning chain over a topic (CLASSIFY → EVIDENCE STANDARD → AUTHORITATIVE
  DOMAINS → DISSENT → VOLATILITY+RECENCY → RISK FLAGS → CLAUDE BIAS CHECK) and
  emits a structured policy file at projects/<slug>/raw/policy-<topic-slug>.md
  that downstream skills (autoresearch, challenge, lint) consume to steer
  WebSearch allowlists, blocklists, recency windows, dissent targeting, and
  bias compensation. Mechanical confidence calibration; honest-refuse path
  when domains can't be named. Use when user says: /vault-policy,
  /vault-policy "topic", "generate a source policy for X", "what sources
  should we trust on Y", "scope quality for Z", "/vault-policy --review",
  "policy-check this topic before research".
---

# vault-policy

Topic-aware source policy. Reasons about the topic, emits a structured policy file downstream skills consume. Quality of the entire research pipeline rides on this single prompt.

Two failure modes the skill is designed against:
- **Critique theater** — generic "good sources matter" without per-topic substance.
- **Sycophantic confidence** — confident-looking policy on a topic Claude has thin training on.

The 7-question chain + mechanical confidence triggers + honest-refuse path defend both.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. If not, ask whether to `/vault-init` first, or run ephemerally without saving (no file write, just echo policy YAML).

## Inputs

- **Topic** (explicit, required for first run): `/vault-policy "JWT signing key rotation cadence"` — generate policy for this topic.
- **Refresh**: `/vault-policy "<topic>" --refresh` — regenerate existing policy. Old policy preserved as `policy-<topic-slug>.v<N>.yaml` (mirror /vault-challenge v2 pattern). Manual only — no auto-regen.
- **Auto**: `/vault-policy "<topic>" --auto` — skip the confirmation prompt. Use when chained from another skill (autoresearch can call `/vault-policy --auto` if no policy exists for its topic).
- **Review**: `/vault-policy --review <topic>` — show existing policy without regenerating. Read-only display.

Not allowed:
- `/vault-policy` with no topic and no `--review`. Fail loudly: "Policy mode needs an explicit topic."
- Auto re-policy on stale TTL — manual only. Surface stale policies in `/vault-lint` as a yellow flag, prompt user to regenerate. Auto-regen risks silent policy drift mid-research.

## Execution model

Runs in an isolated subagent. Main context resolves slug, parses topic, checks for collision with existing policy, then spawns the agent with a complete brief.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Topic must be passed as argument (or `--review <topic>`). If absent, abort.
3. Slug the topic: `<topic-slug>` (kebab-case).
4. Collision check:
   - `--review` mode: read existing `raw/policy-<topic-slug>.md`. If missing, abort: "No policy exists for '<topic>'. Run /vault-policy '<topic>' to generate one." If present, echo to user, return.
   - `--refresh` mode: existing policy must exist. Rename to `policy-<topic-slug>.v<N>.md` where N is `policy_version` from frontmatter. Proceed to regenerate.
   - Default mode: if `policy-<topic-slug>.md` already exists, ask user — refresh as v2, pick different slug, or abort. Never silently overwrite.
5. Confirmation prompt (skipped via `--auto`):
   ```
   Policy generation — topic: "<topic>"
   Slug: <topic-slug>
   Output: projects/<slug>/raw/policy-<topic-slug>.md
   No WebFetch calls. Pure reasoning over your priors.

   Proceed? (yes / refine topic / abort)
   ```
   Wait for explicit confirmation unless `--auto` set.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-policy for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Topic: "<confirmed topic>"
    Topic slug: <topic-slug>
    Mode: <first-run | refresh-from-v<N>>
    Output path: ~/.claude/vault/projects/<slug>/raw/policy-<topic-slug>.md

    Follow the full procedure in the vault-policy skill. Return ONLY:
    - Policy file path written
    - One-line topic class + evidence standard
    - Confidence level + 1-line trigger summary
    - Top risk flag (or "none")
    - Refuse path triggered? (yes/no — yes means no policy was written and user must clarify)
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Pre-decomposition guardrail

Before running the 7-question chain, ask once: "Is this topic decomposable? If yes, name 2-4 sub-topics."

- If topic is broad (e.g. "AI safety"), flag in `claude_bias_note`: "Topic is broad — sub-policies for [X], [Y], [Z] would be sharper." Don't force decomposition; user might want a coarse policy for orientation.
- If topic is single-keyword (e.g. just "JWT"), prompt user one clarifying question: "JWT is broad — narrow to: implementation, security, key rotation, validation, signing algorithms?" If user insists on bare topic, generate coarse policy with `confidence_in_assessment: medium` and flag breadth in bias note.

### 2. Run the 7-question chain (in order, each constrains the next)

Order is load-bearing. Late answers can't drift from early ones if the chain runs sequentially.

**Q1 CLASSIFY** — what kind of topic is this?
   - Why first: every downstream answer depends on topic class.
   - Pick from: `technical-spec | academic | hyped-domain | regulated | niche | contested | mixed`. If `mixed`, name primary + secondary (`topic_class_secondary`).
   - Probe: "Is this a technical spec / academic field / hyped emerging domain / regulated / niche practitioner / contested / hybrid?"

**Q2 EVIDENCE STANDARD** — what does "good evidence" look like for THIS class?
   - Why second: classification implies the standard. Forces concrete naming.
   - Pick from: `peer-reviewed | RFC-or-spec | regulatory-ruling | empirical-data | practitioner-consensus | mixed`.
   - Probe: "What kind of artifact would settle a dispute about this topic?" Be concrete: "RFC text" not "documentation".

**Q3 AUTHORITATIVE DOMAINS** — where do those artifacts live?
   - Why third: only after standard is named can the model name domain shapes that host them.
   - 3-7 concrete domain globs. If you can't name 3 concretely, the policy is too generic — go to honest-refuse path (see section 3 below).
   - Probe: "What domain shapes (globs OK) host the kind of evidence named in Q2?"

**Q4 DISSENT PATTERN** — where does dissent live, and in what source class?
   - Why fourth: dissent is structurally OFF the authoritative shard. Asking after Q3 forces the model to name the off-shard class explicitly.
   - 1-3 `dissent_classes_required` (free-form source classes) + 1-3 `dissent_likely_locations` (URL globs, forums, named authors).
   - Probe: "If the mainstream view is wrong about this topic, who would catch it first? In what kind of source?"

**Q5 VOLATILITY + RECENCY** — how fast does this change?
   - Why fifth: bundled because they trade off. High volatility → narrow recency window; low → broad.
   - `volatility: low | medium | high`. `recency_weight: low | medium | high`. They often but not always co-vary.
   - Probe: "Has the field's mainstream view shifted in the last 12 months? 5 years? Is the topic in active flux?"

**Q6 RISK PROFILE** — what specific failure modes threaten THIS topic?
   - Why sixth: now that class, standards, dissent are named, risk flags can be specific.
   - Controlled vocab (multiple OK, empty list valid for low-risk topics):
     - `citation-cascade-likely` — claims propagate without independent verification
     - `vendor-marketing-heavy` — vendor docs dominate organic search
     - `thin-primary-sources` — most discussion is secondary
     - `hype-cycle` — temporal compression of claims, low signal/noise
     - `regulatory-active` — rules changing now, freshness critical
     - `contested-consensus` — apparent consensus is itself disputed
     - `paywall-locked` — primary sources mostly behind paywalls
     - `non-english-dominant` — primary sources predominantly non-English
     - `survivor-bias-heavy` — failure cases under-reported
   - Topic-specific blocklist extras (`blocklist_extra`) live here too — domains beyond the global blocklist that this topic specifically should exclude. Empty list valid.
   - Probe: "What specific epistemic traps does this topic have? Cascade likely? Hype cycle? Thin primary sources? Active regulatory churn?"

**Q7 CLAUDE BIAS CHECK** — what bias should I expect to fight in MYSELF on this topic?
   - Why last: forces the model to name its own priors AFTER committing to a policy, so it can't retroactively shape the policy to its bias.
   - Mandatory `claude_bias_note` (1-3 sentences, specific). If the model can't articulate its bias, it must say so explicitly ("I have insufficient training-distribution introspection to name a specific bias here") — that statement itself triggers `confidence_in_assessment: low`.
   - Probe: "Given my training distribution, what would I likely overweight or underweight on this topic? Where might my prior diverge from a domain expert's?"

**No self-critique step after Q7.** Adding a "now critique your own answers" pass is the sycophancy paradox: model defends what it just emitted instead of revising. Mandatory reasoning trace below frontmatter is the inspectable record; downstream skills (`/vault-lint --quality`) can audit drift, not the policy generator itself.

### 3. Honest-refuse path

If at any point the model cannot name 1 authoritative domain concretely (Q3 fails) AND cannot name 1 dissent location (Q4 fails), DO NOT emit a confident-looking generic policy. Refuse:

- Write nothing to `raw/policy-<topic-slug>.md`.
- Return to user:
  ```
  REFUSED: Cannot generate policy for "<topic>".
  Reason: <one-line — e.g. "post-cutoff topic, no concrete domains nameable" or "topic ambiguous, both Q3 and Q4 produced vague answers">
  Suggestion: route to /vault-correct to refine the topic, or supply user-overrides:
    /vault-policy "<topic>" --topic-class <enum> --evidence-standard <enum>
  ```
- Better to admit thin knowledge than emit a confident generic policy. This is the explicit escape hatch.

If only one of Q3/Q4 fails (not both), proceed with `confidence_in_assessment: low` and a verbose `claude_bias_note` flagging the gap. Refuse only when both fail.

### 4. Mechanical confidence calibration

`confidence_in_assessment` is set mechanically by the answers, not by the model's self-report:

- **low**:
  - Q3 produced < 3 concrete domain globs, OR
  - Q4 produced "no specific dissent location" / vague entries, OR
  - Topic post-dates training cutoff in important ways (model self-reports), OR
  - Topic is contested at the meta-level (even topic class is disputed).
- **medium**:
  - Q3 produced 3-4 concrete domains, Q4 produced concrete dissent, but model self-reports thin practitioner knowledge OR survivor-bias makes ground truth opaque.
- **high**:
  - Q3 produced 5-7 concrete domains, AND
  - Q4 produced concrete named dissent locations, AND
  - `risk_flags` is empty or contains at most 1 mild flag, AND
  - Model self-reports confident training coverage.

Record `confidence_triggers` as a list (inspectable, not bool). Examples: "topic appears in <5% training", "highly recent post-cutoff topic", "well-defined RFC corpus exists", "I cannot name dissent locations concretely".

### 5. Write the policy file

Path: `~/.claude/vault/projects/<slug>/raw/policy-<topic-slug>.md`.

Defensively `mkdir -p ~/.claude/vault/projects/<slug>/raw` before writing.

```markdown
---
topic: <verbatim user input>
topic_class: <enum>
topic_class_secondary: <enum | null>
evidence_standard: <enum>
authoritative_domains:
  - <glob>
  - <glob>
  ...
blocklist_extra:
  - <domain glob>
  ...
dissent_classes_required:
  - <string>
  ...
dissent_likely_locations:
  - <string>
  ...
volatility: <low | medium | high>
recency_weight: <low | medium | high>
risk_flags:
  - <flag>
  ...
source_pool_warning: <string | null>
confidence_in_assessment: <high | medium | low>
claude_bias_note: <1-3 sentences, specific>
verbosity_default: <terse | full>
policy_schema_version: 1
created: <ISO-8601 date>
---

# Source policy: <topic>

## Summary

<3-5 sentence prose summary the user can read in 10 seconds. Plain voice.>

## Reasoning trace

### Q1 — CLASSIFY
<one paragraph: which class, why, what alternatives were considered>

### Q2 — EVIDENCE STANDARD
<one paragraph: which standard, why, what kind of artifact settles a dispute>

### Q3 — AUTHORITATIVE DOMAINS
<one paragraph: which globs, why each one, what they host>

### Q4 — DISSENT
<one paragraph: where dissent lives, in what source class, named locations>

### Q5 — VOLATILITY + RECENCY
<one paragraph: how fast it changes, what window matters>

### Q6 — RISK FLAGS
<one paragraph: which traps apply, why each, blocklist extras>

### Q7 — CLAUDE BIAS CHECK
<one paragraph: named priors, expected divergence from domain expert, what to fight>

## Honest limits

<mandatory section, 2-4 sentences>
- What this policy does NOT cover (scope edges).
- What Claude likely got wrong (training-distribution gaps).
- When to re-policy (volatility-derived TTL hint: low=24mo / med=12mo / high=6mo, but manual re-run only).
- Confidence: <high|medium|low>. <one-line reason matching confidence_triggers>.
```

**Schema field order is exact.** Downstream consumers parse positionally for some fields; reorder breaks them. The 13 frontmatter fields above match `vault-policy-prompt-design.md` v1 schema.

**verbosity_default rule** (set during generation, not at consume time):
- `confidence_in_assessment: low` → `full`
- `risk_flags` includes `regulatory-active` or `contested-consensus` → `full`
- `topic_class` in `[hyped-domain, contested]` → `full`
- otherwise → `terse`

User can override at consume time with `/vault-policy --review <topic> --full`.

### 6. Append to log.md

```
- <timestamp> — POLICY — [[policy-<topic-slug>]] — <topic_class>/<evidence_standard> — confidence:<level> — <risk_flags or "no-flags">
```

### 7. Update index.md under `## Policies` section

Mirror the Probes / Analogies / Hypotheses / Landscapes pattern.

```markdown
## Policies
- [[raw/policy-<topic-slug>]] — <topic_class>/<evidence_standard> — confidence:<level> — <YYYY-MM-DD>
```

Create the heading if missing. MANDATORY: do not skip this step. Past bug across vault skills: orphaned pages from missed index updates.

### 8. Return compact summary

```
Policy written: raw/policy-<topic-slug>.md
Class: <topic_class>/<evidence_standard>
Confidence: <level> (<one-line trigger>)
Risk flags: <flags or "none">
Refuse path triggered: <yes/no>
```

## Edge cases

### User overrides

User can pass overrides: `/vault-policy "X" --topic-class technical-spec --recency-weight high`.

Overrides applied AFTER the model's reasoning. Model still runs the 7-question chain; override patches the YAML at write time. Reasoning trace records both: "model output: hyped-domain; user override: technical-spec — see Q1 reasoning". Audit trail.

### Stale policies

Auto re-policy: NEVER. Manual only.

`/vault-lint` flags stale policies as yellow:
- `policy_schema_version: N` older than current major version → yellow.
- `created` older than volatility-derived TTL (low=24mo / med=12mo / high=6mo) → yellow.
- `topic_class: regulated` AND `recency_weight: high` AND `created` > 3mo → yellow (regulation churns fast).

User runs `/vault-policy "<topic>" --refresh` to regenerate. Old policy preserved as `policy-<topic-slug>.v<N>.md`.

### Post-cutoff novel topics

Q3 will mechanically fail (no concrete domains). Q4 likely fails (no concrete dissent). Both failing → honest-refuse path. Only one failing → proceed with `confidence_in_assessment: low` and verbose `claude_bias_note` flagging the gap.

### Empty risk_flags

Some topics genuinely have no risk flags. `risk_flags: []` is valid and is itself the schema-compliant signal of a low-risk topic. Do NOT force flags. `source_pool_warning: null` is also valid when nothing flag-worthy applies.

### Decomposable topics

Don't auto-decompose. Generate one policy. Flag in `claude_bias_note` if decomposition would help: "Topic is broad — sub-policies for [X], [Y], [Z] would be sharper." User decides whether to re-run on sub-topics.

## Rules

- Topic must be explicit. No queue picks. No silent mode-switching.
- 7-question chain runs in fixed order. Late drift catchable by re-reading reasoning trace.
- No self-critique step after Q7. Sycophancy paradox: model defends what it just emitted. Drift detection lives in downstream `/vault-lint` not here.
- Q3 must produce 3-7 concrete domain globs. Generic answers fail the schema.
- Q6 risk flags use controlled vocab only. Free-text invites "be careful" theater.
- Q7 forced — model can't skip the bias check. `claude_bias_note` is mandatory.
- Honest-refuse path: if both Q3 and Q4 fail, REFUSE rather than fake. Route user to `/vault-correct`.
- Confidence is mechanical, not self-reported. Q3 < 3 entries → low. 5-7 entries + clean risk_flags → high. Mid → medium.
- Reasoning trace below frontmatter is mandatory. One paragraph per question. The inspectable artifact for downstream lint.
- Honest-limits section is mandatory. Names what the policy does NOT cover.
- Manual re-policy only. Never auto-regen mid-research. Stale policies surface in `/vault-lint`, user decides when to refresh.
- Old policy versions preserved as `policy-<topic-slug>.v<N>.md` on `--refresh`. Never silently overwrite.
- Policy is a PRIOR, not a hard filter. The schema biases ranking and shapes queries; it does not gate truth. Counter-evidence pass in `/vault-challenge` can break the policy when mainstream sources are wrong.
- No WebSearch / WebFetch calls in this skill. Pure reasoning over Claude's priors. Cost: tokens only.
- Schema field order is exact. Downstream consumers parse positionally. 13 frontmatter fields per spec v1.
- Schema field is `policy_schema_version`, not `policy_version`. Bumps on schema breaking changes, not on `--refresh` regeneration.
- Index update under `## Policies` heading is non-skippable. Orphaned policy files break downstream consumers that enumerate via index.
