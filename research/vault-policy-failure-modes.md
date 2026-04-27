---
title: vault-policy failure modes, audit, override paths
created: 2026-04-23
scope: research-only design — when /vault-policy fails and what to do about it
angle: failure mode catalog + correction mechanisms
---

# /vault-policy failure modes, audit mechanisms, override paths

`/vault-policy` is itself a self-judgment by Claude before research runs. Per agentic-self-critique findings, naive self-judgment fails (Claude Sonnet 98.1% → 56.9% accuracy under critique loops; sycophancy at 58-62% baseline). Per agentic-self-rag, RA-RAG fails on consensus-error (most sources agree on wrong answer → reliability boosts wrong side). Per multi-agent exploration, MAD fails by sycophantic convergence. `/vault-policy` inherits these risks because it's a single-agent rubric generator running on Claude's own priors.

Note: `vault-correct` skill referenced below was proposed in earlier design discussion but does not exist at `~/.claude/skills/vault-correct/SKILL.md`. Treat it as a prospective skill in the proposals below.

---

## 1. Failure mode catalog

### F1. Out-of-distribution topic — guessing rubric

**Shape.** Topic outside Claude's training corpus reliably. Policy generator outputs confident-sounding ranking of "authoritative sources" but the ranking is interpolation from neighbor domains, not knowledge. E.g., topic = niche industrial-control protocol from a single vendor whose docs Claude has never seen — Claude defaults to "official spec, peer-reviewed, practitioner blog" but doesn't know which vendor sites count or which forums host the real expertise.

**Symptom.** Policy looks plausible but `site:` filters miss the actual authoritative sources. Round-1 search returns SEO content because real expertise lives on a Discord/Slack/private mailing list Claude can't enumerate.

**Detection signal.** Round-1 retrieval returns < 3 sources matching the policy's allowlist patterns. Or: retrieval evaluator (CRAG-style) scores all returned sources < threshold.

**Mitigation.** Confidence scoring on the policy. If Claude can't list 3 specific authoritative-domain examples (not categories), policy_confidence = low → relax allowlist + flag to user. Cost: trivial.

### F2. Hyped-domain prior bias

**Shape.** Topic in active hype cycle (e.g., "agentic frameworks 2026", "RAG 2025"). Claude's "authoritative" candidates are themselves hype-cycle artifacts: vendor blogs (Anthropic, OpenAI, LangChain), conference-circuit papers, twitter threads. Claude can't distinguish marketing from research because the corpus blends them and RLHF likely up-weighted vendor sources Claude was trained to cite.

**Symptom.** Policy lists Anthropic blog as authoritative for "agentic frameworks." Anthropic is a vendor in that market. Same pattern: OpenAI blog for AI safety, Pinecone blog for vector DBs.

**Detection signal.** Topic class matches `hyped-domain` pattern (LLM tooling, AI infrastructure, web3, crypto post-2020, vibes-tech). Allowlist contains > 50% commercial vendors in the space.

**Mitigation.** Meta-rule in /vault-policy: if topic_class ∈ hyped-domain set, MANDATORY adversarial dissent classes (academic critique, regulatory, postmortem, practitioner failure reports). And: explicitly DEMOTE vendor primary sources to "interested party" tier — they're allowed but flagged as conflicted. Cost: small (one extra reasoning step). Effectiveness: high — names the conflict instead of hiding it.

### F3. Politically/socially contested topic — RLHF bias surfaces

**Shape.** Topic where "authoritative" has political content (nutrition science, climate policy, gender medicine, drug policy). Claude's RLHF tunes "authoritative" toward platform-safe sources (gov agencies, mainstream journals) which are themselves contested. RA-RAG's consensus-error failure mode applies: Claude collapses to mainstream consensus and treats dissent as low-quality.

**Symptom.** Policy lists CDC/NIH/WHO as authoritative without acknowledging that the contested topic is precisely where these agencies are contested. Dissent gets blocklisted as "fringe."

**Detection signal.** Topic matches contested-topic patterns (health policy, climate, social science, drugs, nutrition, gender, geopolitics). Or: /vault-challenge run on resulting page surfaces > 50% claims weakened by readily-findable dissent — meaning policy filtered out dissent that mattered.

**Mitigation.** Topic-class flag for `contested`. Forces policy to:
- explicitly name multiple stakeholder positions (mainstream, critic, practitioner, regulator)
- include at least one source class from each named position
- mark "authoritative" as `mainstream-authoritative` rather than absolute
- pass dissent expectations forward to /vault-challenge as MANDATORY (not optional)

Cost: medium (longer reasoning). Effectiveness: high — surfaces RLHF bias rather than hiding it.

### F4. Interdisciplinary topic — single-class rubric misses dissent

**Shape.** Topic crosses domains (e.g., "AI ethics" = ML + philosophy + policy + law). Single ranked source-class list privileges one discipline. Dissent lives in adjacent disciplines the rubric didn't include.

**Symptom.** Policy ranks ML research papers top, philosophy journals not listed. Round-3 challenge misses well-developed philosophical critique because Claude wasn't pointed at it.

**Detection signal.** Topic title contains conjunction (X and Y, X for Y, applied X). Or: vault's existing pages on the topic span > 2 distinct page tags.

**Mitigation.** Multi-axis rubric: instead of one ranked list, emit per-discipline source classes with explicit "this class lives in this discipline." Forces Claude to enumerate disciplines first. Cost: medium. Effectiveness: medium-high.

### F5. Too-narrow topic — no general source pattern applies

**Shape.** Topic is a single startup, single product, single paper, single bug. No "source class" makes sense — there's just the primary thing and people talking about it. Policy outputs generic ranking that doesn't help.

**Symptom.** Policy says "primary documentation, then secondary commentary, then tertiary blogs" — true but useless when the topic has 1 primary doc and 30 blog posts of varying quality.

**Detection signal.** Topic matches narrow-entity pattern (single product/company/paper name + no broader domain framing).

**Mitigation.** Narrow-topic policy mode: skip class-ranking, emit a different rubric: "find the primary artifact, find the strongest critic, find the best independent benchmark, find the failure case." Falsifiability anchors instead of source classes. Cost: trivial (different prompt template). Effectiveness: high for this failure shape.

### F6. Too-broad topic — policy meaningless at altitude

**Shape.** Topic = "AI" or "machine learning" or "the economy." No coherent source policy exists at this altitude.

**Symptom.** Policy emits generic platitudes ("peer-reviewed papers, then practitioner sources") that any topic at this altitude would get. No discriminative power.

**Detection signal.** Topic word count < 3 AND no qualifier (no "for X", no "in 2026", no domain anchor). Or: scope check — Claude can list > 20 distinct subtopics it would cover.

**Mitigation.** Reject the topic at policy-generation time. Output: "Topic too broad for source policy. Decompose into N subtopics first; policy applies per subtopic." Forces user back to scope work. Cost: trivial. Effectiveness: high — refuses to fake a useful policy.

### F7. Self-critique paradox on the policy itself

**Shape.** Per agentic-self-critique, naive self-critique on high-confidence outputs degrades them. If /vault-policy includes "now critique your own draft policy" step without a rubric, Claude either (a) hallucinates flaws (over-correcting) or (b) sycophantically rubber-stamps (under-correcting). Snorkel finding: Claude Sonnet 98.1% → 56.9% under naive critique loops.

**Symptom.** Policy + self-critique converges on a worse policy than no self-critique. Or: critique is theater — recites generic concerns without substantively changing the policy.

**Detection signal.** Hard to detect from outputs alone. Indirect: A/B comparison of policies with/without self-critique step.

**Mitigation.** If a self-critique step is added, it MUST be rubric-grounded (per agentic-self-critique recommendation). Concrete rubric:
- "What's a contrarian view on the authoritative sources I just listed? Name one."
- "Who would disagree that these are the right standards of evidence for this topic? Name one camp."
- "What's the most likely Claude bias in this assessment? Be specific."

Each question forces a NAMED answer (not vague concern). If Claude can't name a specific contrarian/dissenter/bias, mark policy_confidence = low. Cost: 1 extra LLM call. Effectiveness: medium — depends on rubric quality.

**When critique step fires.** Difficulty-gated per Snorkel. Always-on critique on rock-solid topics degrades them. Recommendation: critique fires when Claude's initial confidence in policy is medium or low. Skip critique on high-confidence (well-established academic field with clear hierarchy). Cost gate prevents the paradox.

### F8. Sycophancy in policy generation

**Shape.** Per Sycophancy in LLMs paper (Gemini 62.47% rate), Claude tunes outputs to match user framing. If user invokes `/vault-policy "RAG techniques"` with implicit framing that RAG is solved, policy emits standards that confirm that framing. If user is skeptical, policy emits dissent-heavy standards.

**Symptom.** Same topic, different framings → systematically different policies. Detectable via A/B with framing variations.

**Detection signal.** Hard from one run. Cumulatively: pages with policies that evolved via /vault-correct show framing-correlated drift.

**Mitigation.** Strip user-supplied tone. Policy generator receives ONLY the topic noun phrase, not the wording surrounding it. Or: emit policy from neutral system prompt that explicitly counter-balances any embedded user framing. Cost: trivial. Effectiveness: medium.

---

## 2. Audit mechanisms

How does the user audit a policy decision?

### A1. Plain-markdown policy file (already proposed)

Policy file at `projects/<slug>/raw/source-policy-<topic-slug>.md`. Plain markdown, readable, editable. User can read it before /vault-autoresearch consumes it. No special tooling. **Cost: zero. Effectiveness: high baseline — but only if user reads it.**

### A2. `claude_reasoning:` section in the policy file

Add to policy template a section explaining WHY each ranking choice was made:

```markdown
## Reasoning

Why peer-reviewed papers ranked top: <one-paragraph justification>
Why practitioner blogs second: <...>
Why I'm uncertain about <X>: <...>
What I'm assuming about this field: <...>
What would change my ranking: <...>
```

Surfaces Claude's priors so user can spot bad ones. Cost: ~500 extra output tokens per policy. Effectiveness: medium-high — user can audit reasoning even without expertise in the topic.

### A3. `/vault-lint` flag for unreviewed policies

`/vault-lint --quality` adds dimension: "policy reviewed by user." Detection: presence of `policy_reviewed: <date>` frontmatter field on the policy file. If missing, flag YELLOW: policy in use but never audited. **Cost: trivial (one new lint check). Effectiveness: medium — depends on user actually fixing flagged items.**

### A4. User-confirmation prompt at end of /vault-policy

After policy generation, /vault-policy presents the policy to user and asks: "Confirm? (y/n/edit)". Default: requires confirmation. Optional `--auto` flag skips for autonomous runs.

**Cost: friction (interrupts flow). Effectiveness: high IF user actually reviews.**

Trade-off: blocks autonomy. Recommendation: confirmation default ON for first N runs (warm-up period); user opts into `--auto` once trust established. OR: confirmation only when policy_confidence = low.

### A5. `policy_review:` field stamped after downstream signals

After /vault-challenge or /vault-output reveals issues, stamp `policy_review: needed` back into the policy file. Surfaces policies whose downstream artifacts hit quality issues — an empirical signal that the policy may have been wrong.

**Cost: trivial. Effectiveness: medium — depends on /vault-challenge being run.**

### A6. Audit log per policy decision

Every /vault-policy run logs to `log.md`:

```
<ts> — POLICY — <topic> — confidence: <high|med|low> — flagged risks: [hyped-domain, contested]
```

Allows /vault-lint to surface low-confidence policies for review. Cost: trivial. Effectiveness: medium.

---

## 3. Override paths

How does the user fix a wrong policy?

### O1. Direct edit of policy file

Plain markdown — user opens the file and edits. Works but no record of why it was edited. Acceptable for power user, fragile for cross-project consistency.

**Cost: zero. Effectiveness: medium. Audit trail: weak.**

### O2. `/vault-correct` skill (proposed)

Hypothetical skill that:
1. Reads existing policy
2. Asks user what's wrong + what should change
3. Records the diff with rationale in policy frontmatter
4. Updates policy version (v1 → v2; preserves v1 in archive)
5. Logs correction to log.md with reason

Treats policy correction as a first-class operation, not a manual edit. **Cost: medium (new skill). Effectiveness: high — preserves audit trail and rationale.**

Recommendation: build /vault-correct after /vault-policy ships and at least one wrong-policy case has been observed in real use. Don't pre-build.

### O3. CLI override flags

User invokes `/vault-policy "topic" --override "authoritative_domains: include practitioner-blogs.com"`. Override is stamped into the policy file as an `overrides:` block. Downstream consumers respect overrides over base policy.

Concrete schema:

```yaml
---
topic: <slug>
policy_schema_version: 1
generated_by: claude
generated_at: <ts>
policy_confidence: medium
overrides:
  - by: user
    at: <ts>
    field: authoritative_domains
    add: [practitioner-blogs.com]
    rationale: "Claude missed practitioner blog where real expertise lives"
---
```

**Cost: small (parser for --override flag). Effectiveness: high — fast, audit-trail preserved.**

### O4. Frontmatter `policy_overrides:` field

Persistent override list survives policy regeneration. `/vault-policy --regenerate` produces a new policy from scratch BUT preserves the `policy_overrides:` block. User-supplied corrections persist across regeneration. Cost: trivial. Effectiveness: high — fixes the "user spent time correcting policy, regen wiped it" failure.

### O5. User-supplied authoritative source list

For F1 (out-of-distribution), user provides authoritative sources directly:

```
/vault-policy "topic" --authoritative-sources sources.txt
```

Where sources.txt is a user-curated list of domains/URLs Claude should treat as authoritative. Bypasses Claude's guessing entirely for domains where user has knowledge Claude doesn't. **Cost: trivial. Effectiveness: high for F1 failures.**

This is the honest fallback when Claude can't generate a useful policy: hand it the answer.

---

## 4. Confidence-driven behavior

When /vault-policy outputs low confidence, downstream behavior should change.

### C1. Confidence scalar in policy frontmatter

Policy emits `policy_confidence: high | medium | low` based on internal checks:
- HIGH: well-established field, clear source hierarchy, Claude has > 5 specific named domains in mind, no contested-topic flag, no hyped-domain flag.
- MEDIUM: some uncertainty in source hierarchy OR contested topic OR hyped domain.
- LOW: out-of-distribution OR can't name 3 specific authoritative domains OR topic too narrow/broad.

### C2. Behavior cascade on confidence

| Confidence | Allowlist | Challenge required | User confirmation | Disclaimer in /vault-output |
|---|---|---|---|---|
| HIGH | strict (filter) | optional | skip if --auto | minimal |
| MEDIUM | soft (rank, don't filter) | recommended | prompt | normal |
| LOW | none (suggest, don't restrict) | mandatory | required | strong |

Specifically on LOW confidence:
- Don't restrict search to allowlist Claude isn't sure about — skip the `site:` filter, just rank
- Flag the synthesis page with `quality_policy_confidence: low` so /vault-output emits stronger disclaimer
- Suggest user-supplied corrections (route to `/vault-correct` or `--authoritative-sources`)
- Mandatory /vault-challenge run before page is treated as canon

### C3. Cost / effectiveness

Cost: trivial (one extra field, one branching logic in downstream skills). Effectiveness: high — bad policies fail safely instead of confidently.

---

## 5. Detection of wrong-policy outcome (post-research)

After research runs with a policy, how do we detect the policy was bad?

### D1. /vault-lint --quality D8 compliance metric

If proposed in earlier design: lint scores whether page actually meets the bar set by its topic policy. **Caveat**: if policy was wrong (e.g., F2 hyped-domain), compliance metric is meaningless — page complies with a wrong policy. Compliance ≠ correctness.

### D2. /vault-challenge weakened-rate as empirical signal

After /vault-challenge runs, count claims classified WEAKENED. High weakened-rate (> 50%) suggests:
- Either claims were genuinely shaky (page-level issue), OR
- Policy was too permissive — admitted low-quality sources whose claims don't survive scrutiny.

Detection: post-/vault-challenge, if WEAKENED count > threshold, stamp `policy_review: empirical-failure` on the policy file. Routes back to user for /vault-correct.

**Cost: trivial. Effectiveness: medium — depends on /vault-challenge running.**

### D3. User feedback loop

Did synthesis match user expectation? Subjective. Hard to quantify. Could ask user via prompt at end of /vault-output: "did this match what you expected? (y/n)" — n triggers `policy_review: user-flagged`.

**Cost: friction. Effectiveness: variable. Skip unless user opts in.**

### D4. /vault-probe surfacing post-research gaps

If /vault-probe run on the project surfaces gaps that should have been covered by the policy's source classes (e.g., probe says "missing regulatory perspective" and policy named regulatory as authoritative), policy was incomplete. Stamp `policy_review: probe-detected-gap`.

**Cost: trivial. Effectiveness: medium.**

### D5. Cross-page inconsistency on same topic

If two pages on overlapping subtopics use the same policy but reach contradicting conclusions, policy may be the common cause. Detection: /vault-lint --deep cross-references contradictions, flags shared policy as suspect.

**Cost: small (lint extension). Effectiveness: low-medium — rare to trigger, but high signal when it does.**

---

## 6. Hyped-domain mitigation (F2 detail)

Hyped-domain failure deserves its own section because Claude's training is most likely to have absorbed vendor-blog framing.

### Detection rules

- Topic contains terms in hyped-domain set: `agentic`, `RAG`, `LLM tooling`, `vector DB`, `web3`, `crypto`, `metaverse`, `quantum supremacy`, `AGI`, `prompt engineering`, `<vendor name> framework`
- OR: top 3 domains Claude lists as authoritative are commercial vendors in the space
- OR: topic published in trade press > academic press over last 12 months

### Mandatory adversarial classes for hyped-domain

If hyped-domain detected, policy MUST include source classes from:
- Academic critique (peer-reviewed counter-claims, even if smaller field)
- Regulatory perspective (whatever regulator covers the space; FTC/SEC/NIST for crypto, FDA for health-tech, etc.)
- Independent benchmarks (not vendor-published)
- Postmortem / failure mode literature
- Commercial competitor critique (one vendor on another)

Policy disclaims: "Topic is in active hype cycle. Vendor sources flagged as interested-party. Cross-class dissent enforced."

### Effectiveness vs cost

Cost: medium — longer policy, more search angles in round 1. Effectiveness: HIGH for the failure mode it targets. This is the single most likely failure shape for any LLM-tooling research and worth the cost.

---

## 7. Versioning

Policies should evolve.

### V1. Schema version field

`policy_schema_version: 1` in frontmatter. As schema evolves (new fields, different structure), downstream skills check version and adapt or warn.

### V2. Regeneration with archive

`/vault-policy "topic" --regenerate` produces a new policy from scratch. Old policy preserved at `archive/source-policy-<topic-slug>-v1.md`. New policy at `source-policy-<topic-slug>.md` (current symlink or file with `policy_version: 2`).

### V3. Diff over time

User can `diff archive/source-policy-X-v1.md source-policy-X.md` to see how Claude's view of the topic changed. Useful for understanding training-data drift if regen happens months apart.

### V4. Override preservation

Per O4, `policy_overrides:` block survives regeneration. User corrections aren't wiped by --regenerate.

**Cost: trivial. Effectiveness: high.**

---

## 8. The honest fallback — when /vault-policy refuses

At some point, no policy can compensate for Claude's training. /vault-policy should refuse rather than fake.

### Refusal triggers

- Topic out-of-distribution (F1) AND user provided no `--authoritative-sources` override
- Topic too broad (F6) — refuse with decomposition prompt
- Topic crosses too many disciplines (> 4) — refuse with "decompose first"
- Self-confidence check fails: Claude can't name 3 specific authoritative domains AND can't name 1 specific contrarian camp

### Refusal output

```
Cannot generate reliable source policy for topic: <topic>.
Reason: <one of: out-of-distribution | too broad | over-disciplinary | low confidence>.

Recommended next step:
- /vault-correct <topic> --authoritative-sources <list>  (you supply the sources)
- /vault-policy <subtopic-1>; /vault-policy <subtopic-2>  (decompose)
- Skip policy: /vault-autoresearch <topic> --no-policy  (research without rubric, accept lower quality)
```

This is the honest path. Better than emitting a confident-looking policy that's actually guesses.

### Refusal vs low-confidence policy — which?

- LOW-CONFIDENCE policy: Claude has SOME relevant knowledge, just not enough to be authoritative. Policy emitted with relaxed allowlist + strong disclaimer + mandatory challenge.
- REFUSAL: Claude has near-zero relevant knowledge. Policy would be pure guess. Better to refuse and route to user-supplied correction.

Threshold: REFUSAL when Claude can't name even 1 specific authoritative domain (only generic categories). LOW-CONFIDENCE when Claude can name 1-2 but not 3+.

---

## 9. Top 5 failure modes ranked

Ranked by likelihood × impact:

### Rank 1: F2 hyped-domain bias

- **Likelihood: HIGH** — most active vault topics will be in some hype cycle (LLM tooling especially).
- **Impact: HIGH** — admits vendor framing as authoritative, contaminates downstream synthesis with marketing.
- **Mitigation**: hyped-domain detector + mandatory cross-class dissent. Built into /vault-policy.
- **Cost**: medium (longer policy, more search).
- **Effectiveness**: high.

### Rank 2: F3 contested-topic RLHF bias

- **Likelihood: MEDIUM-HIGH** — many research-worthy topics are contested.
- **Impact: HIGH** — RLHF bias filters out dissent that's the actual point of researching the topic.
- **Mitigation**: contested-topic flag + multi-stakeholder source classes + mandatory /vault-challenge with dissent expectations passed forward. Built into /vault-policy.
- **Cost**: medium.
- **Effectiveness**: high.

### Rank 3: F1 out-of-distribution

- **Likelihood: MEDIUM** — varies by user's domain.
- **Impact: HIGH** — confident-looking policy on something Claude doesn't know.
- **Mitigation**: confidence scoring + refusal threshold + user-supplied authoritative sources fallback (`--authoritative-sources`). Refusal path built into /vault-policy. Override path via /vault-correct (separate skill).
- **Cost**: small (confidence check) + zero (override flag).
- **Effectiveness**: high — names the limit instead of hiding it.

### Rank 4: F7 self-critique paradox on policy

- **Likelihood: MEDIUM** — only relevant if /vault-policy adds a self-critique step.
- **Impact: MEDIUM** — degrades a working policy.
- **Mitigation**: skip naive self-critique. If critique step is wanted, rubric-grounded only (named contrarian, named dissenter, named bias) and difficulty-gated (skip on high-confidence). Built into /vault-policy.
- **Cost**: depends on whether critique step is added. If skipped, zero. If added with rubric, 1 extra LLM call.
- **Effectiveness**: medium — only matters if critique was going to happen.

### Rank 5: F6 too-broad topic

- **Likelihood: MEDIUM** — users sometimes invoke at wrong altitude.
- **Impact: MEDIUM** — meaningless policy gets generated, downstream skills run with empty rubric.
- **Mitigation**: scope check at policy time, refuse with decomposition prompt. Built into /vault-policy.
- **Cost**: trivial.
- **Effectiveness**: high.

### Honorable mentions

- F4 interdisciplinary — likely; multi-axis rubric mitigates.
- F5 too-narrow — likely; narrow-mode rubric template mitigates.
- F8 sycophancy — likely but hard to detect; strip-user-framing mitigates.

---

## 10. Recommendations

### 10.1 What goes INTO /vault-policy

Built-in:
- Confidence scalar (HIGH / MEDIUM / LOW) with explicit thresholds
- Topic-class detection: hyped-domain, contested, narrow-entity, too-broad
- Refusal path for too-broad / out-of-distribution / over-disciplinary
- `claude_reasoning:` section explaining each ranking choice
- For hyped-domain: mandatory adversarial cross-class dissent
- For contested: mandatory multi-stakeholder source classes + dissent passed to /vault-challenge
- `policy_overrides:` block (preserved across regeneration)
- `policy_schema_version: 1` for forward compat
- Audit log entry per run

NOT built-in (avoid):
- Naive "now critique your own draft" step (self-critique paradox)
- Multi-agent debate variant (MAD failure modes from agentic-multi-agent-exploration)

### 10.2 Separate skill: /vault-correct

Build AFTER /vault-policy ships and ≥ 1 wrong-policy case observed.

Responsibilities:
- Read existing policy
- Accept user-supplied corrections (CLI flags or interactive)
- Produce v2 policy with diff + rationale
- Log correction to log.md
- Stamp `policy_overrides:` block

This is the honest "Claude was wrong, here's the fix" path. Don't pre-build.

### 10.3 Lint integration

`/vault-lint --quality` adds checks:
- Policy file reviewed by user (presence of `policy_reviewed:`)
- Policy confidence on pages flagged with low policy_confidence
- Empirical-failure stamp from /vault-challenge weakened-rate
- Probe-detected gaps that policy should have covered

### 10.4 The fundamental honesty

When Claude can't generate a useful policy, /vault-policy MUST refuse rather than fake. Refusal text routes user to:
1. `/vault-correct --authoritative-sources <list>` (supply the answer)
2. Decomposition into subtopics
3. `--no-policy` opt-out (research without rubric, lower quality, explicit acceptance)

Refusal is the rare failure mode that isn't a bug — it's the correct behavior when Claude's training doesn't reach the topic. Naming the limit beats faking competence.

### 10.5 Order of operations

Recommended build order:
1. /vault-policy v1 with: confidence scalar, topic-class detection (hyped/contested/narrow/broad), refusal path, claude_reasoning section, policy_overrides slot, schema version. NO self-critique step.
2. Downstream confidence-cascade behavior in /vault-autoresearch and /vault-output (relax allowlist + stronger disclaimer on low-confidence).
3. /vault-lint integration (review-status, confidence flag).
4. After ≥ 1 real wrong-policy case: build /vault-correct.
5. After /vault-correct ships and is dogfooded: optionally add rubric-grounded critique step to /vault-policy, gated on confidence (skip on HIGH, fire on MEDIUM/LOW).
6. Defer: D2/D4/D5 detection signals (need real-use data first).

---

## Appendix: cross-references to prior research

- agentic-self-critique.md: self-critique paradox (Snorkel: 98.1% → 56.9%); rubric-grounded critique beats free-form by 12-48% F1; difficulty-gated critique. Maps to F7 mitigation.
- agentic-self-rag.md: RA-RAG consensus-error failure mode (when sources agree on wrong answer, reliability boosts wrong side). Maps to F3 contested-topic mitigation — never collapse to consensus on contested topics.
- agentic-multi-agent-exploration.md: MAD sycophantic convergence; topic-aware quality determination as single-agent planner. Maps to recommendation 10.1 — don't add MAD-style critique to /vault-policy.
- /vault-challenge SKILL.md: post-synthesis adversarial pass, classifies HELD UP / WEAKENED / UNFALSIFIED. Provides empirical signal for D2 (weakened-rate as wrong-policy detector).
- /vault-correct: proposed but not yet built; specified in section 10.2 above.
