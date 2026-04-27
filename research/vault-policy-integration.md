---
title: /vault-policy downstream integration spec — 7-skill consumption design
created: 2026-04-23
scope: vault-autoresearch, vault-challenge, vault-ingest, vault-lint, vault-output, vault-synthesize, vault-landscape
status: research only
---

# /vault-policy Downstream Integration Spec

## Premise

`/vault-policy` runs pre-retrieval. Output: `raw/policy-<topic-slug>.md` frontmatter:

```yaml
topic_class: technical-spec | scientific | hype-prone | contested-policy | vendor-comparison | current-events | foundational | other
evidence_standard: rfc-or-equivalent | peer-reviewed | benchmark-numbers | postmortem | primary-doc | mixed
authoritative_domains: [...]
blocklist_extra: [...]
dissent_classes_required: [academic, regulatory, practitioner, adversarial]
volatility: high | medium | low
recency_weight: 0.0-1.0
risk_flags: [hype-cycle, vendor-bias, contested-consensus, paywalled, low-quality-pool]
source_pool_warning: "<one-sentence caveat or null>"
confidence_in_assessment: high | medium | low
dissent_likely_locations: [...]
dissent_pattern: "<short note on where pushback lives>"
```

Each section: WHERE read, WHAT changes, FAILURE handling, SKILL.md edit.

---

## 1. /vault-autoresearch — Round 1

**Where read.** New step **0.5** before current step 1 in `### Round 1 — orient`.

**Behavior changes.**

Query phrasing per topic_class:
- `technical-spec` → append ` "RFC" OR "specification"`
- `scientific` → append ` "peer-reviewed" OR "study"`
- `vendor-comparison` → append ` review OR benchmark`
- `current-events` → append ` 2026`
- `foundational` → append ` "textbook" OR "introduction"`
- `hype-prone` → no append (allowlist does the work)

WebSearch params (mode by confidence):
- `confidence == high` AND `len(authoritative_domains) >= 5` → pass `allowed_domains: <authoritative_domains>` only.
- `confidence == medium` → allowlist round 1 only; rounds 2-3 fall back to blocklist (let dissent in).
- `confidence == low` → skip allowlist. Pass `blocked_domains: <global + blocklist_extra>` only.

Tag union: if page already has tags, union policy.authoritative_domains with matching tag-allowlists. Dedupe.

**Escalation when allowlist <3 results:**
1. Drop most-restrictive query terms (one retry).
2. Try `dissent_likely_locations` as allowlist.
3. Fall back to blocklist-only. Log to frontmatter:
   ```yaml
   policy_compliance:
     mode_used: blocklist-fallback
     escalation: ["allowlist-thin"]
   ```
4. Cap retries at 2.

**Failure modes:**
- File missing → `policy_status: absent`, blocklist-only, no auto-trigger.
- Malformed → treat as missing, log error.
- Stale (>180d) → `policy_status: stale`, proceed with cached.

**SKILL.md edit (caveman lite).** Insert after `### Round 1 — orient`, before step 1:

```markdown
0.5 **Read policy** if present. Look for `raw/policy-<topic-slug>.md`. Parse frontmatter. Cache for all rounds.
    - Missing → `policy_status: absent`, blocklist-only mode. No auto-trigger.
    - Stale (>180d) → `policy_status: stale`, proceed.
```

Modify step 1:

```markdown
1. `WebSearch` topic.
   - Append topic_class authority phrase per class table.
   - Mode: `confidence == high` → `allowed_domains: <authoritative_domains>`; `medium` → allowlist round 1 only; `low` → `blocked_domains` only.
   - On <3 results: escalate (drop terms → dissent_locations as allowlist → blocklist fallback). Cap 2 retries.
```

Frontmatter additions (synthesis page):

```yaml
policy_status: applied | absent | stale | malformed
policy_slug: <topic-slug>
policy_compliance:
  mode_used: allowlist | mixed | blocklist | open-web
  escalation: [...]
  authoritative_hits: <N>
  non_authoritative_hits: <N>
```

---

## 2. /vault-autoresearch — Round 3 counter-evidence

**Where read.** Modify existing step 2 of `### Round 3 — synthesize` (the **Counter-evidence pass**).

**Behavior changes.** Replace generic dissent search with **class-targeted search** per `dissent_classes_required`. One WebSearch per required class:

| dissent class | targeting |
|---|---|
| `academic` | allowlist arxiv.org, scholar.google.com, aclanthology.org |
| `regulatory` | allowlist `*.gov`, eur-lex.europa.eu, regulator domains |
| `practitioner` | blocklist mode + `"<claim>" postmortem OR "in production"` |
| `adversarial` | blocklist mode + `"<claim>" criticism OR "X is wrong"` |
| `industry-analyst` | allowlist gartner.com, forrester.com |

Class returns 0 → append to `dissent_classes_missing` in frontmatter. Do not fail hard — quality signal, not error.

Frontmatter additions:

```yaml
dissent_classes_required: [academic, regulatory, practitioner]
dissent_classes_found: [academic, regulatory]
dissent_classes_missing: [practitioner]
```

`/vault-lint` D8 reads these for compliance.

**Failure modes:**
- Policy missing → fall back to current 1-2 generic searches.
- `dissent_classes_required: []` → skip class search, run 1-2 generic.
- All required classes return 0 → strong signal. Annotate Tensions section: "counter-evidence thin across all required classes; lower confidence."

**SKILL.md edit.** Replace Round 3 step 2:

```markdown
2. **Counter-evidence pass (mandatory, policy-aware).** Before assembling Tensions:
   - Identify 2-3 strongest claims.
   - If policy present: read `dissent_classes_required`.
   - Per required class, run ONE class-targeted WebSearch (academic → arxiv allowlist; regulatory → .gov; practitioner → postmortem queries; adversarial → criticism queries).
   - Class returns 0 → append to `dissent_classes_missing`. Do NOT fail.
   - WebFetch most credible dissent per class.
   - Use to populate Tensions actively.
   - Policy missing → fall back to 1-2 generic searches.
```

---

## 3. /vault-challenge

**Where read.** New step **2.5** between current step 2 and step 3.

**Behavior changes.** Read `evidence_standard`, `dissent_pattern`, `dissent_likely_locations`, `risk_flags` from `raw/policy-<page-slug>.md` or via page's `policy_slug` pointer.

Adversarial searches use `dissent_likely_locations` as allowlist.

risk_flags weighting:
- `hype-cycle` → lower bar for WEAKENED. Single peer-reviewed counter flips HELD UP → WEAKENED.
- `contested-consensus` → HELD UP requires 2+ independent supports beyond original page.
- `vendor-bias` → claim with vendor-only support auto-flags WEAKENED with `vendor-source-only support` note.
- `low-quality-pool` → relax HELD UP standard. Annotate caveat.

Classification calibrated to evidence_standard:
- `rfc-or-equivalent` → HELD UP requires citation to actual spec doc. Else UNFALSIFIED.
- `peer-reviewed` → HELD UP requires peer-reviewed support. Practitioner blogs alone → UNFALSIFIED.
- `benchmark-numbers` → HELD UP requires concrete numbers. Vibes → UNFALSIFIED.
- `postmortem` → HELD UP requires incident-report citation.
- `mixed` → existing rules.

**Failure modes:**
- No policy_slug pointer + no `raw/policy-<page-slug>.md` → generic adversarial search (current behavior). Annotate `policy: absent` in challenge section.
- Stale → annotate `policy: stale`.
- evidence_standard absent → use `mixed` default.

**SKILL.md edit.** Insert step 2.5:

```markdown
### 2.5 Read policy (if present)

Look for `raw/policy-<page-slug>.md` or read `policy_slug:` pointer from page frontmatter. Parse:
- `evidence_standard` → calibrates HELD UP / WEAKENED / UNFALSIFIED bar.
- `dissent_likely_locations` → allowlist for adversarial searches.
- `dissent_pattern` → primes query phrasing.
- `risk_flags` → weights challenge harshness.

Missing/stale → fall back to generic. Annotate challenge section.
```

Modify step 4:

```markdown
### 4. Classify each claim (policy-calibrated)

Bars by evidence_standard:
- `rfc-or-equivalent`: HELD UP needs primary spec doc.
- `peer-reviewed`: HELD UP needs peer-reviewed support.
- `benchmark-numbers`: HELD UP needs benchmark numbers.
- `postmortem`: HELD UP needs incident-report support.
- `mixed`/absent: existing rules.

risk_flags:
- `hype-cycle`: lower WEAKENED bar.
- `contested-consensus`: HELD UP needs 2+ independent supports.
- `vendor-bias`: vendor-only support auto-WEAKENED.
- `low-quality-pool`: relax HELD UP, caveat.
```

---

## 4. /vault-ingest

**Where read.** Topic isn't known until after step 3 (extract metadata). Insert step **3a.5** between step 3 and 3b.

**Behavior changes.**

Order:
1. Steps 1-3 unchanged (read, extract topic + tags).
2. New 3a.5: check `raw/policy-<derived-topic-slug>.md`. If absent, use tag-based defaults (any matching tag-allowlist).
3. Step 3b uses `dissent_pattern` for queries:
   - `academic critique typical` → `"<claim>" arxiv critique OR limitation`.
   - `regulatory backlash` → `"<claim>" regulator OR ban OR investigation`.
   - `vendor-vs-open-source split` → `"<claim>" open source critique`.
4. `dissent_likely_locations` as allowlist if confidence is high; else blocklist mode.
5. **Auto-tag source_class.** URL domain matches policy.authoritative_domains → `source_class: tier1`. Matches blocklist_extra → `source_class: blocklist-extra` AND warn user before completing.
6. **Inherit policy pointer.** Page frontmatter gets `quality_policy: <topic-slug>` (or `none`).

**Failure modes:**
- No policy + no tag match → generic queries (current). `quality_policy: none`.
- Source domain in blocklist_extra → halt, confirm with user.
- Domain authoritative for one topic, blocked for another → flag conflict, default to authoritative.

**SKILL.md edit.** Insert 3a.5:

```markdown
3a.5 **Resolve policy.** After step 3 derives topic + tags:
- Check `raw/policy-<topic-slug>.md`. If absent, union of matching tag-allowlists.
- Set `quality_policy: <topic-slug>` (or `none`) in page frontmatter.
- Auto-tag `source_class:` from URL domain match (`tier1` / `blocklist-extra` / `unknown`).
- Domain in blocklist_extra → halt, user-confirm.
```

Modify 3b:

```markdown
3b. **Contestation check (policy-aware).** 1 WebSearch keyed off `dissent_pattern`:
- `academic critique typical` → arxiv allowlist + critique queries.
- `regulatory backlash` → .gov allowlist + ban queries.
- `vendor-vs-open-source split` → blocklist + OSS critique queries.
- No policy → generic queries.
Use `dissent_likely_locations` as allowlist when confidence high. Annotate inline `(contested by [src](url))`.
```

Frontmatter additions:

```yaml
quality_policy: <topic-slug> | none
source_class: tier1 | tier2 | vendor | blocklist-extra | unknown
```

---

## 5. /vault-lint — D8 compliance dimension

**Where read.** Per-page during quality scoring. Read page's `quality_policy:` → load `raw/policy-<topic-slug>.md`.

**Behavior changes. New D8 — POLICY-COMPLIANCE:**

```
compliance_score =
    0.40 * authoritative_domain_hit_rate
  + 0.40 * dissent_class_coverage
  + 0.20 * evidence_standard_match
```

Where:
- **authoritative_domain_hit_rate**: cited domains in policy.authoritative_domains / total citations.
- **dissent_class_coverage**: `len(dissent_classes_found) / len(dissent_classes_required)`.
- **evidence_standard_match**: binary 1/0 — at least one citation matches standard (peer-reviewed → arxiv/journal/conf; benchmark-numbers → cite has number; etc). Heuristic, not LLM-grade.

Composite formula update:

```
quality_score = 0.18*D1 + 0.18*D2 + 0.18*D3 + 0.13*D4 + 0.08*D5 + 0.13*D6 + 0.12*D8
```

(D1-D6 weights drop to make room for D8 at 0.12.)

Pages with `quality_policy: none` → SKIP D8, re-weight remaining 6 dims (same pattern as grace-period skip).

Pages referencing missing policy file → flag RED `policy: missing` (distinct from `none`).

Report section (under `## Quality scores`):

```markdown
### Policy compliance (N pages)
- `<page.md>` (policy: <slug>) — 78%. Authoritative-hit 0.80, dissent-coverage 0.66, evidence-match 1.0.
- `<page.md>` (policy: <slug>) — 32%. Weak: dissent-coverage 0.0 (missing: practitioner, regulatory).
```

D8 < 0.5 + composite YELLOW → push to RED.
D8 < 0.5 + composite GREEN → demote to YELLOW with `next-move: re-research with policy-allowlist`.

**Failure modes:**
- Policy referenced but missing file → D8 = 0.0, RED. Suggest /vault-policy regenerate.
- No `quality_policy:` (legacy) → SKIP D8, no penalty. `D8: N/A`.
- Stale → score normally, append `policy: stale` warning.

**SKILL.md edit.** Add D8 to dimensions section. Update composite formula. Add next-move row:

| Weakest dim | Next move |
| D8 policy-compliance | "`/vault-autoresearch '<topic>' --use-policy`" |

Add report section `### Policy compliance (N pages, --quality only)`.

---

## 6. /vault-output — disclaimer injection

**Where read.** Step 2 (Read each input page). For each input, read `quality_policy:` → load policy file → capture `source_pool_warning`, `risk_flags`.

**Behavior changes.**

Aggregate warnings: any flag/warning held by >50% of inputs → top-level disclaimer.

Examples:
- 3/5 inputs `risk_flags: [hype-cycle]` → "Synthesized from hype-cycle-bounded sources; treat conclusions as time-sensitive."
- 4/5 inputs `source_pool_warning: "limited primary literature"` → "Limited primary literature across inputs."
- 5/5 inputs `risk_flags: [vendor-bias]` → "All inputs draw on vendor-published sources."

Inject as `## Source caveats` section after `## Executive summary` / `## Overview`, before `## Findings`:

```markdown
## Source caveats

> Synthesized from hype-cycle-bounded sources (3 of 5 input pages flag this).
> Limited primary literature on this topic (2 of 5 input pages flag this).
```

Per-input policy summary table near `## Sources`:

```markdown
## Source policy summary

| Input page | Policy | Compliance | Caveat |
|---|---|---|---|
| [[page-a]] | technical-spec | 88% | none |
| [[page-b]] | hype-prone | 45% | "limited primary lit" |
```

**Failure modes:**
- Input has no `quality_policy:` → row shows `none / N/A`. No disclaimer from this page.
- All inputs no policy → omit `## Source caveats`. Note in compact result `policy: none of N inputs declared`.
- Mixed policies → aggregate per-policy. Only flags passing >50% threshold fire.

**SKILL.md edit.** Modify step 2:

```markdown
### 2. Read each input page fully

Frontmatter, sections, body. Also: `quality_policy:` pointer; load `raw/policy-<topic-slug>.md` if exists. Capture `source_pool_warning`, `risk_flags`. Aggregate.
```

Insert step 3a:

```markdown
### 3a. Aggregate policy caveats

For each input's policy: capture `source_pool_warning`, `risk_flags`. Tally.
- Flag/warning held by >50% inputs → top-level disclaimer in `## Source caveats`.
- Per-page compliance + caveats → `## Source policy summary` table near sources.
```

Add `## Source caveats` and `## Source policy summary` to all 5 templates (report, study-guide, comparison, timeline, glossary). Skip if no inputs declared policies.

Frontmatter:

```yaml
policy_aggregate:
  inputs_with_policy: 4
  inputs_without_policy: 1
  majority_flags: [hype-cycle]
  majority_warnings: [...]
```

---

## 7. /vault-synthesize + /vault-landscape

Shared problem: synthesizing across pages with different policies.

**Two options.**

**X. Inherit most cautious.**
- Pick strictest evidence_standard (rfc > peer-reviewed > benchmark-numbers > postmortem > mixed).
- Union dissent_classes_required, blocklist_extras, risk_flags.
- MIN of confidence_in_assessment.
- Save as `raw/policy-<synthesis-slug>-derived.md`.
- Pros: cheap, conservative. Cons: derived may not match synthesis topic.

**Y. Run fresh /vault-policy on synthesis topic.**
- Treat synthesis as new topic.
- New policy file.
- Pros: precise. Cons: extra LLM call. Risk of drift from input policies.

**Hybrid recommendation.**
- /vault-synthesize: tag-overlap >70% across inputs → X. Else Y.
- /vault-landscape: ALWAYS Y. Landscape is for new domains; existing per-page policies don't apply. Run /vault-policy on landscape topic before fan-out, pass policy to all 5 personas.

Detection: `set(input.tags)` overlap ratio.

**Landscape specifics.**

Add new step to `Before spawning`:
- Step 7: After cost confirmation, before fan-out, check `raw/policy-<topic-slug>-landscape.md`. If absent, run /vault-policy. Block. Pass policy fields into each persona brief.
- Adversarial persona reads `dissent_likely_locations` as primary search domains.
- Merge agent inherits policy → landscape page frontmatter.

**Failure modes:**
- All inputs `quality_policy: none` → synthesis inherits none. No enforcement.
- Conflicting policies → log conflict in raw notes. Default to OR-aggregate of restrictions.
- Landscape policy gen fails → proceed without, annotate `policy_status: skipped (gen-failed)`.

**SKILL.md edit — /vault-synthesize.** Add at start:

```markdown
### 0.5 Resolve policy (multi-input convergence)

Read each input's `quality_policy:`.
- Tag-overlap >70% → derive most-cautious. Save `raw/policy-<synthesis-slug>-derived.md`.
- Tag-overlap ≤70% → run /vault-policy on synthesis topic. Save `raw/policy-<synthesis-slug>.md`.
- All inputs `none` → synthesis inherits none.

Set synthesis page `quality_policy:` accordingly.
```

**SKILL.md edit — /vault-landscape.** Insert in `Before spawning`:

```markdown
7. **Generate landscape policy.** Run /vault-policy on `<topic>` if `raw/policy-<topic-slug>-landscape.md` absent. Block. Pass policy into each persona brief.
```

Modify persona brief template:

```markdown
Policy context (read before searching):
- authoritative_domains: <list>
- blocklist_extra: <list>
- topic_class, evidence_standard
- For your persona: focus dissent class <persona-specific>
```

Adversarial persona uses dissent_likely_locations as primary search domains.

---

## 8. Default-fallback (policy missing)

Legacy pages and first runs:

**Default-fallback policy:**
```yaml
topic_class: other
evidence_standard: mixed
authoritative_domains: []
blocklist_extra: []
dissent_classes_required: [adversarial]
volatility: medium
recency_weight: 0.5
risk_flags: []
source_pool_warning: null
confidence_in_assessment: low
dissent_likely_locations: []
dissent_pattern: generic
```

Effect: matches CURRENT pre-policy state. No allowlist. Blocklist via global config. Generic counter-evidence.

Pages tagged `quality_policy: default-fallback` — /vault-lint flags as candidates for "run /vault-policy and re-research."

**Auto-trigger? Opt-in via flag, not always-on.**

- Always-on adds 1-2 LLM calls per autoresearch. Wasteful for triage runs.
- `--use-policy` flag → run /vault-policy first if absent, then proceed.
- First-time prompt: "Generate quality policy first? (yes / no / always-yes / always-no)". Save to `~/.claude/vault/config/preferences.json`.
- `--no-policy` flag → force default-fallback even if always-yes.

Insert into /vault-autoresearch `Before spawning` before step 4:

```markdown
3.5. **Policy resolution.**
- `raw/policy-<topic-slug>.md` exists → use it.
- Else: check user pref in `~/.claude/vault/config/preferences.json`.
  - `policy_default: always-yes` → run /vault-policy, block.
  - `policy_default: always-no` → default-fallback, annotate.
  - `policy_default: prompt` → ask inline, save pref if user picks always-X.
- `--use-policy` overrides to yes; `--no-policy` to no.
```

Same logic for ingest, challenge, synthesize, landscape.

---

## 9. Staleness handling

**Time-based.** Policy `created:` ISO date. Stale thresholds by volatility:
- `high` (AI/ML, news) → 90d.
- `medium` (default) → 180d.
- `low` (math, theory) → 730d.

**Drift-based:**
- >30% pages on policy's topic added since policy.created → outdated authorities.
- known authoritative_domain 404s.
- aggregated lint signal: >50% pages with this policy fall YELLOW/RED on D8.

**Auto-suggest in /vault-lint, never auto-run.**

Lint report addition:

```markdown
### Stale policies (N)
- `policy-jwt-rotation` — created 2025-09-12 (>180d). Volatility medium. 8 pages reference.
  Suggested: `/vault-policy "<topic>" --refresh`
- `policy-llm-eval-2025` — created 2025-08-01 (>90d, high volatility). 12 pages reference.
```

`--refresh` flag on /vault-policy:
- New version. Same path. Bump `version: N+1`.
- Move old to `raw/policy-<topic-slug>.v<N>.md`.
- Existing pages keep working; D8 uses new rules at next lint.

`--policy-audit` flag on /vault-lint scans:
- Per policy: % new pages since policy.created. >30% → drift candidate.
- Avg D8 across referencing pages. <0.5 → drift.

**SKILL.md edit — /vault-lint.** Add to semantic checks:

```markdown
### Policy staleness (--quality or --all)

For each `raw/policy-*.md`:
- age = now - policy.created.
- volatility threshold: high=90d, medium=180d, low=730d.
- Stale → flag in `## Stale policies`.
- Drift signals: % new pages since created, avg D8 across referrers.

Suggest `/vault-policy '<topic>' --refresh`. Never auto-run.
```

---

## 10. Override mechanisms

**`--ignore-policy` flag.** All consumers. Skips enforcement. Annotate `policy_status: ignored-by-user`. /vault-lint surfaces in `## Policy-ignored runs (N)`.

**Dissent override — three modes:**

- **Strict:** policy is gate. Sources outside allowlist filtered at WebSearch.
- **Soft (default):** policy is prior. Round 1 allowlist; round 3 counter-evidence opens to blocklist mode. Strong counter from non-authoritative source can survive — tagged `source_class: tier2`, claim annotated `(challenged by tier2 source)`.
- **Permissive:** allowlist boosts ranking, doesn't filter. Source class recorded for downstream lint.

**Recommendation: SOFT default.** Matches agentic-self-rag.md anti-pattern advice: policy as prior, not hard filter. Counter-evidence pass breaks it when mainstream sources are wrong.

`--strict-policy` flag for high-stakes runs.

Mechanism:
- /vault-autoresearch round 1: allowlist mode.
- Round 2: allowlist if `--strict-policy`, else mixed.
- Round 3 counter-evidence: ALWAYS blocklist mode for adversarial searches.
- Outside-allowlist counter-evidence → tier2 tag, not silently dropped.
- /vault-challenge: adversarial searches always blocklist mode. WEAKENED label assignable regardless of dissent source's tier; section notes tier explicitly.

**SKILL.md edit — /vault-autoresearch Rules:**

```markdown
- Policy is PRIOR, not hard filter (soft default). Round 1 enforces allowlist; round 3 counter-evidence opens to blocklist mode for dissent. `--strict-policy` enforces allowlist all rounds.
- `--ignore-policy` skips entirely. Annotates frontmatter.
```

`--strict-policy` and `--ignore-policy` mutually exclusive — CLI parser rejects both.

---

## Integration order

Producers (write `quality_policy:`, `source_class:`) ship before consumers (read those fields).

**Phase 1 — Producers:**
1. Build /vault-policy (prerequisite, separate work).
2. Wire /vault-autoresearch round 1 + round 3 (sections 1, 2). Pages now produce policy fields.
3. Wire /vault-ingest (section 4). Ingested pages produce fields.

**Phase 2 — Consumers:**
4. Wire /vault-lint D8 (section 5). Reads what Phase 1 wrote.
5. Wire /vault-output (section 6).

**Phase 3 — Adversarial + multi-policy:**
6. Wire /vault-challenge (section 3).
7. Wire /vault-synthesize + /vault-landscape (section 7).

**Phase 4 — Maintenance:**
8. Default-fallback (section 8).
9. Staleness auto-suggest (section 9).
10. Override flags (section 10).

### Conflicts

- **`source_class:` naming.** Used here AND proposed in `agentic-self-rag.md`. Align: `tier1 | tier2 | vendor | blocklist-extra | unknown`.
- **D8 weight rebalance.** Adding D8 at 0.12 forces D1-D6 weights down. Pages re-scored after rollout see slight composite shifts even if content unchanged. Document in /vault-lint changelog.
- **`policy_status:` vs `policy_compliance:`.** Two adjacent fields. `policy_status` = enum (applied/absent/stale/malformed/ignored). `policy_compliance` = nested object (mode_used, escalation, hits). Both — answer different questions.
- **Auto-trigger preference.** Section 8 opt-in via pref. Risk: users forget, accumulate `default-fallback` pages. /vault-lint must surface clearly to nudge.
- **Landscape always Y, synthesize hybrid.** OK — landscape semantically IS new-domain.
- **`--strict-policy` vs `--ignore-policy`.** Mutually exclusive. CLI rejects both.

### Single coordinated edit checklist

| Skill | Edits |
|---|---|
| vault-autoresearch | New step 0.5 (read policy), modify step 1 (WebSearch params), modify Round 3 step 2 (class-targeted dissent), frontmatter additions |
| vault-challenge | New step 2.5 (read policy), modify step 4 (calibrate to evidence_standard, risk_flags weighting) |
| vault-ingest | New step 3a.5 (resolve policy, auto-tag source_class), modify 3b (dissent_pattern queries), frontmatter |
| vault-lint | New D8 dimension, composite formula update, new report sections (Policy compliance, Stale policies, Policy-ignored), next-move row |
| vault-output | Modify step 2 (capture policies), new step 3a (aggregate), `## Source caveats` and `## Source policy summary` in all 5 templates |
| vault-synthesize | New step 0.5 (multi-policy convergence: derive vs run fresh), frontmatter quality_policy |
| vault-landscape | New `Before spawning` step 7 (run /vault-policy on landscape topic), persona brief addition, merge agent inherits policy |

All edits caveman lite. All consumers add `--ignore-policy` and `--strict-policy` flags.

End.
