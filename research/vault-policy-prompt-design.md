---
title: /vault-policy — prompt design + output schema
created: 2026-04-23
scope: heart of the topic-aware quality skill
angle: prompt sequence, structured output, guardrails, worked examples
purpose: implementation-ready spec for the topic-assessment prompt
---

# /vault-policy — prompt design + output schema

The skill's job: before WebSearch fires, reason about the topic and emit a structured policy that downstream skills (autoresearch, challenge, lint) can consume. Quality of the entire research pipeline rides on quality of this single prompt.

Two failure modes to avoid:
- **Critique theater** — model recites generic "good sources matter" without per-topic substance.
- **Sycophantic confidence** — model emits a confident-looking policy on a topic it has thin training on.

Both are documented dominant failures in 2025 SOTA (CAI critique theater; Snorkel sycophancy 58%+). Prompt + schema must be designed against them.

---

## 1. PROMPT DESIGN

### 1.1 Question sequence

Order matters. Each question's answer constrains the next. Sequence chosen so that classification → standards → domains → dissent → risk → bias forms a chain where late answers can't drift from early ones.

**Final 7-question sequence** (drop redundant, group related):

1. **CLASSIFY** — what kind of topic is this?
   Why first: every downstream answer depends on topic class. Asking it first commits the model to a frame before it can drift.
   Probe: "Is this a technical spec / academic field / hyped emerging domain / regulated / niche practitioner / contested / hybrid?"

2. **EVIDENCE STANDARD** — what does "good evidence" look like for THIS class?
   Why second: classification implies the standard. Forces concrete naming (peer-reviewed RCT vs RFC text vs regulatory ruling vs benchmark vs practitioner postmortem).
   Probe: "What kind of artifact would settle a dispute about this topic?"

3. **AUTHORITATIVE DOMAINS** — where do those artifacts live?
   Why third: only after standard is named can the model name domain shapes that host them. Skipping this step = generic allowlists ("ieee.org, arxiv.org" applied to topics where that's wrong).
   Probe: "What domain shapes (globs OK) host the kind of evidence named in Q2?"

4. **DISSENT PATTERN** — where does dissent live, and in what source class?
   Why fourth: dissent is structurally OFF the authoritative shard. Asking after Q3 forces the model to name the off-shard class explicitly. Critical for cross-class enforcement (don't let mainstream consensus monopolize the synthesis).
   Probe: "If the mainstream view is wrong about this topic, who would catch it first? In what kind of source?"

5. **VOLATILITY + RECENCY** — how fast does this change?
   Why fifth: independent of source class but informs filtering. Bundled with recency weight because they trade off (high volatility → narrow recency window; low → broad).
   Probe: "Has the field's mainstream view shifted in the last 12 months? 5 years? Is the topic in active flux?"

6. **RISK PROFILE** — what specific failure modes threaten THIS topic?
   Why sixth: now that class, standards, dissent are named, risk flags can be specific (citation-cascade for AI hype; vendor-marketing for emerging dev tools; thin-primary for niche). Generic "watch out for low-quality sources" is critique theater.
   Probe: "What specific epistemic traps does this topic have? Cascade likely? Hype cycle? Thin primary sources? Active regulatory churn?"

7. **CLAUDE BIAS CHECK** — what bias should I expect to fight in MYSELF on this topic?
   Why last: forces the model to name its own priors AFTER committing to a policy, so it can't retroactively shape the policy to its bias. Last-position is deliberate — this is the meta-question that catches drift in the prior 6.
   Probe: "Given my training distribution, what would I likely overweight or underweight on this topic? Where might my prior diverge from a domain expert's?"

**Cut from earlier draft:**
- "What does Claude know about this topic?" — cut. Subsumed by Q7 (bias check) and confidence calibration. Asking it directly invites sycophantic "yes I know this well."
- "What's the goal of the research?" — cut. Out of scope for /vault-policy; consumer (autoresearch) carries the goal.
- "What blocklist applies?" — cut as standalone; subsumed by topic-specific extras under risk flags. Global blocklist lives in /vault-autoresearch, not policy.

**Why 7 not 5 or 10:**
- Fewer than 7 collapses classify+standard or dissent+risk and loses precision (e.g. dissent location ≠ risk profile; merging them produces vague "watch for biased sources").
- More than 7 = redundancy. Tested merging volatility/recency (kept merged), considered separating "first 12 months" vs "5 years" (cut — single volatility enum captures both).

### 1.2 Prompt scaffold (skeleton)

The actual skill prompt for Claude reasoning about the topic:

```
You're generating a source policy for the topic: "<TOPIC>".

This policy will steer downstream research. Be specific and falsifiable. Avoid generic advice.

Reason through 7 questions IN ORDER. Each answer constrains the next:

1. CLASSIFY: What kind of topic is this? Pick from: technical-spec / academic / hyped-domain / regulated / niche / contested / mixed. If mixed, name primary + secondary.

2. EVIDENCE STANDARD: Given the class, what kind of artifact settles a dispute here? Be concrete (e.g. "RFC text" not "documentation").

3. AUTHORITATIVE DOMAINS: Where do those artifacts live? Domain globs OK. Cap 5-7. If you can't name them concretely, the policy is too generic — recurse on Q1.

4. DISSENT: If mainstream view is wrong about this topic, who catches it first? In what source class (off the authoritative shard)? Name 1-3 dissent locations and the source class required for cross-class enforcement.

5. VOLATILITY + RECENCY: How fast does the mainstream view shift? Has it shifted in the last 12 months? Pick volatility (low/medium/high) and recency_weight (low/medium/high) — they often but not always co-vary.

6. RISK FLAGS: What specific epistemic traps threaten THIS topic? Pick from: citation-cascade-likely / vendor-marketing-heavy / thin-primary-sources / hype-cycle / regulatory-active / contested-consensus / paywall-locked / non-english-dominant. Multiple OK.

7. CLAUDE BIAS CHECK: What's MY likely prior on this topic, and where would it diverge from a domain expert's? Be specific. "I might overweight X because Y" — name the source class. If you'd over-trust academic sources on a practitioner topic, say so.

After answering all 7, emit the structured YAML schema (next section). Then a 3-5 sentence prose summary in your own voice that a user could read in 10 seconds.

If at any point you realize you don't know enough about this topic to answer concretely (e.g. you're guessing at domains in Q3), set confidence_in_assessment: low and add a claude_bias_note explaining the gap. Better to admit thin knowledge than emit a confident-looking generic policy.
```

Key scaffolding decisions:
- Numbered ordered prompt (vs free-form). Per DeepVerifier 12-48% F1 lift, structured rubric beats unstructured critique.
- Explicit "if Q3 generic, recurse on Q1" — local self-check inside the prompt.
- Explicit "admit thin knowledge" escape — defends against sycophantic confidence.
- Q7 forced — model can't skip the bias check.

---

## 2. OUTPUT SCHEMA (YAML frontmatter on policy file)

### 2.1 Final schema

```yaml
---
# IDENTITY
topic: <string>                              # verbatim user input
topic_slug: <string>                         # kebab-case for filename
created: <ISO-8601 date>
generated_by: vault-policy
policy_version: 1                            # bump on regenerate

# CLASSIFICATION (Q1)
topic_class: <enum>                          # see allowed values below
topic_class_secondary: <enum | null>         # for hybrid topics, else null

# EVIDENCE STANDARD (Q2)
evidence_standard: <enum>                    # see allowed values below

# AUTHORITATIVE DOMAINS (Q3)
authoritative_domains:                       # list of domain globs, 3-7
  - <glob>
  - <glob>
  ...

# DISSENT (Q4)
dissent_classes_required:                    # source classes for cross-class enforcement
  - <string>
dissent_likely_locations:                    # where to look (URL globs, forums, named authors)
  - <string>

# VOLATILITY + RECENCY (Q5)
volatility: <low | medium | high>
recency_weight: <low | medium | high>
recency_window_months: <int | null>          # explicit window if computable, else null

# RISK + EXTRA BLOCKLIST (Q6)
risk_flags:                                  # 0-N flags, controlled vocab
  - <flag>
blocklist_extra:                             # topic-specific spam beyond global blocklist
  - <domain glob>

# BIAS CHECK (Q7)
claude_bias_note: <string>                   # 1-3 sentences, specific
expected_alternative_framings:               # 0-2 alternative framings
  - <string>

# CONFIDENCE (meta)
confidence_in_assessment: <high | medium | low>
confidence_triggers:                         # what made the model pick this confidence
  - <string>

# OUTPUT POLICY
verbosity_default: <terse | full>            # how to display by default
---
```

Then below the frontmatter:

```markdown
# Source policy: <topic>

## Summary

<3-5 sentence prose summary the user can read in 10 seconds>

## Reasoning trace

<one-paragraph each for Q1-Q7, the structured answer that produced the YAML>
```

### 2.2 Allowed values

**topic_class enum:**
- `technical-spec` — RFCs, protocols, standards bodies, formal specs
- `academic` — peer-reviewed primary literature is the standard
- `hyped-domain` — active hype cycle, vendor marketing dominant, mainstream coverage thin
- `regulated` — regulatory rulings, compliance standards, gov/agency primary
- `niche` — small practitioner community, thin primary sources, knowledge in forums/conversations
- `contested` — active expert disagreement; mainstream view itself disputed
- `mixed` — genuinely hybrid; topic_class_secondary required

**evidence_standard enum:**
- `peer-reviewed` — academic papers, journals
- `RFC-or-spec` — IETF, W3C, ISO, vendor specs
- `regulatory-ruling` — agency decisions, compliance docs
- `empirical-data` — benchmarks, postmortems, datasets
- `practitioner-consensus` — recognized practitioner blogs, community-vetted writeups
- `mixed` — multiple standards apply; spell out in reasoning trace

**risk_flags controlled vocab:**
- `citation-cascade-likely` — claims propagate without independent verification
- `vendor-marketing-heavy` — vendor docs dominate organic search
- `thin-primary-sources` — most discussion is secondary
- `hype-cycle` — temporal compression of claims, low signal/noise
- `regulatory-active` — rules changing now, freshness critical
- `contested-consensus` — apparent consensus is itself disputed
- `paywall-locked` — primary sources mostly behind paywalls
- `non-english-dominant` — primary sources predominantly non-English
- `survivor-bias-heavy` — failure cases under-reported (e.g. trading strategies)

**volatility / recency_weight enums:** `low | medium | high` (3-bucket, no further granularity needed).

### 2.3 Schema critique

**Removed from earlier draft:**
- `source_pool_warning` — redundant with risk_flags. Use a flag instead.
- Separate field for "what bias to fight" — folded into `claude_bias_note` (string) + `expected_alternative_framings` (list).

**Kept despite questioning:**
- `confidence_triggers` — list, not bool. Reason: needs to be inspectable. "Topic appears in <5% training" vs "highly recent post-cutoff topic" matter differently downstream.
- `recency_window_months` — explicit int. Some skills (lint freshness) need a number, not an enum. Null when not computable.
- `policy_version` — for re-policy on stale topics (see edge cases).

**Added late:**
- `expected_alternative_framings` — per-research finding from CAI work: surface alternative frames before committing. 0-2 cap; not always applicable.
- `verbosity_default` — solves the "show full vs collapsed" question structurally rather than via runtime flag.

### 2.4 Field count justification

13 frontmatter fields + reasoning trace. Compared to:
- vault-landscape frontmatter: 8 fields. Smaller because it's an output artifact, not a policy.
- vault-autoresearch frontmatter: 6 fields.
- /vault-policy is denser because every field is consumed by a downstream skill. Drop a field, lose a downstream behavior.

13 is at the edge. If schema grows, consider splitting `authoritative_domains` into a separate `policy.allowlist.yaml` referenced by the main policy. Don't yet — premature.

---

## 3. GUARDRAILS

### 3.1 Against Claude's priors

Claude has documented biases in research synthesis:
- **Quant trading**: overweights academic finance (efficient markets, factor models), underweights practitioner knowledge (microstructure, regime changes, adverse selection in real markets).
- **AI tooling**: overweights Anthropic/OpenAI/Google content. Underweights independent benchmarks, smaller-lab work.
- **Crypto**: oscillates between dismissive and credulous. Often parrots either Bitcoin maximalist or skeptical-academic frame.
- **Niche programming**: overweights popular framework docs; underweights deep practitioner forums.

**Mechanism in prompt: Q7 + claude_bias_note + expected_alternative_framings.**

Q7 forces a named bias check. The schema field `claude_bias_note` is mandatory (not optional) — if model can't articulate its bias, it must say so explicitly ("I have insufficient training-distribution introspection to name a specific bias here"), which itself triggers `confidence_in_assessment: low`.

`expected_alternative_framings` (0-2 entries) provides a rubric receipt: even if the policy commits to a frame, the alternatives are recorded. Downstream skills (autoresearch round 2) can probe these.

**What this does NOT do:** It does not eliminate bias. It surfaces and records it so downstream skills can compensate. Over-claim risk: don't pretend bias check makes the policy unbiased. Mark it as a check, not a fix.

### 3.2 Against critique theater

Q3 (authoritative_domains) requires concrete globs. Generic answers ("authoritative domains") fail the schema — list must be 3-7 concrete entries.

Q6 (risk_flags) uses controlled vocab. Free-text risk flags would invite "be careful" theater. Forcing controlled vocab forces specificity.

Reasoning trace below frontmatter is mandatory — model must write one paragraph per question. This is the mechanism that catches the model when it tries to emit a confident YAML without doing the work.

### 3.3 Against sycophantic confidence

`confidence_in_assessment: low` is the explicit escape hatch. Triggered by:

- Topic appears thin in training distribution (model self-reports "I'm guessing at domains" or "I can't name dissent locations concretely")
- Topic post-dates training cutoff and isn't widely covered
- Topic is contested at the meta-level (i.e. even the topic class is disputed — confidence: low for `topic_class`)
- Q3 produces fewer than 3 concrete domain globs (mechanical signal of thin knowledge)
- Q4 produces "no specific dissent location" (also mechanical signal)

**Prompt instruction:** "If at any point you realize you don't know enough about this topic to answer concretely, set `confidence_in_assessment: low` and explain in `claude_bias_note`. Better to admit thin knowledge than emit a confident generic policy."

The mechanical triggers (Q3 < 3 entries; Q4 vague) provide post-hoc verifiability — a separate lint can check "low confidence policy with 7 concrete domains?" → flag for review.

### 3.4 Against drift in the prompt itself

Fixed-order question sequence. Each question constrains the next. Late drift (e.g. picking domains in Q3 that don't match the standard from Q2) is catchable by re-reading the trace.

The reasoning trace below frontmatter is the inspectable artifact. /vault-lint could add a check: does the trace's Q3 answer match the YAML's authoritative_domains? Drift detection.

---

## 4. WORKED EXAMPLES

Three topics, three expected policies. These should look right and convince.

### 4.1 Topic: "JWT signing key rotation cadence"

```yaml
---
topic: JWT signing key rotation cadence
topic_slug: jwt-key-rotation-cadence
created: 2026-04-23
generated_by: vault-policy
policy_version: 1

topic_class: technical-spec
topic_class_secondary: null

evidence_standard: RFC-or-spec

authoritative_domains:
  - datatracker.ietf.org/*    # IETF RFCs
  - tools.ietf.org/*           # legacy IETF
  - openid.net/specs/*         # OIDC specs
  - oauth.net/2/*              # OAuth specs
  - csrc.nist.gov/*            # NIST guidance
  - cheatsheetseries.owasp.org/*  # OWASP practical
  - cloud.google.com/iam/docs/*   # vendor practitioner docs (sample)

dissent_classes_required:
  - security-research-postmortem
  - practitioner-incident-writeup

dissent_likely_locations:
  - portswigger.net/research/*
  - blog.cloudflare.com/*
  - real-world-incident postmortems on personal blogs

volatility: low
recency_weight: medium
recency_window_months: 60

risk_flags:
  - vendor-marketing-heavy
blocklist_extra:
  - medium.com/*               # tutorial farms with bad crypto advice
  - dev.to/*                   # mixed quality, often outdated

claude_bias_note: >
  I likely overweight Auth0/Okta blog content because vendor docs dominate
  search ranking on JWT topics. Practitioners sometimes diverge from vendor
  recommendations on rotation cadence (e.g. shorter intervals than vendors
  default). Worth specifically searching for security researcher writeups
  that contradict vendor "best practice" guidance.

expected_alternative_framings:
  - "Rotation as a key-compromise blast-radius limit (security-researcher framing)"
  - "Rotation as operational toil tradeoff (SRE framing)"

confidence_in_assessment: high
confidence_triggers:
  - well-defined RFC corpus exists
  - mature topic with 10+ years of practitioner discussion
  - I can name authoritative domains concretely

verbosity_default: terse
---
```

Why this looks right:
- topic_class: technical-spec (correct — JWT is RFC 7519, key handling RFC 7517).
- evidence_standard: RFC-or-spec (matches class).
- authoritative_domains: concrete IETF/NIST/OAuth (would pass the Q3 specificity check).
- dissent classes named: security research vs vendor docs (real divergence on this topic).
- volatility: low (RFCs don't change fast).
- risk_flags: vendor-marketing-heavy (real — Auth0/Okta SEO dominates).
- bias note: explicit Auth0/Okta overweight (a real Claude bias).
- confidence: high (well-trained topic).

### 4.2 Topic: "agentic frameworks for quantitative trading"

```yaml
---
topic: agentic frameworks for quantitative trading
topic_slug: agentic-frameworks-quant-trading
created: 2026-04-23
generated_by: vault-policy
policy_version: 1

topic_class: hyped-domain
topic_class_secondary: niche

evidence_standard: mixed

authoritative_domains:
  - arxiv.org/abs/*            # academic, partial
  - papers.ssrn.com/*          # finance research
  - docs.langchain.com/*       # vendor docs (treat skeptically)
  - github.com/*               # implementation, varied quality

dissent_classes_required:
  - practitioner-trader-postmortem
  - regime-change-failure-report

dissent_likely_locations:
  - twitter.com/quantian1
  - reddit.com/r/algotrading
  - private newsletters and Substack (limited by paywall)
  - hedge-fund failure postmortems (bloomberg, ft)

volatility: high
recency_weight: high
recency_window_months: 12

risk_flags:
  - hype-cycle
  - vendor-marketing-heavy
  - thin-primary-sources
  - survivor-bias-heavy
  - paywall-locked
blocklist_extra:
  - medium.com/*
  - towardsdatascience.com/*   # outdated agent-trading takes
  - youtube tutorial channels (no schema for this; flag manually)

claude_bias_note: >
  Strong bias here. I likely overweight academic finance (efficient markets,
  factor models) which assumes the strategies don't work, AND vendor content
  from LangChain/CrewAI which assumes they do. The practitioner truth is
  somewhere else: it sometimes works in narrow regimes, fails on regime
  change, success cases under-reported (commercially sensitive), failures
  over-reported in postmortems. I should explicitly search for "agentic
  trading failed" / "LLM trading regime change" / "agent backtest overfit".

expected_alternative_framings:
  - "Microstructure / execution problem (HFT framing — agents irrelevant)"
  - "Research / strategy generation problem (where agents may add value)"
  - "Operations layer — risk monitoring, regulatory reporting (low controversy)"

confidence_in_assessment: medium
confidence_triggers:
  - topic post-dates much of relevant practitioner discussion
  - I can name domains but not specific dissenting voices confidently
  - claim divergence between vendor marketing and practitioner reality is large
  - survivor bias makes "what works" hard to assess from public sources

verbosity_default: full
---
```

Why this looks right:
- Hybrid class (hyped + niche) — matches the actual landscape.
- Multiple risk flags — survivor-bias and paywall-locked are real for this topic.
- Bias note is sharp and specific — calls out the academic-vs-vendor bimodal bias.
- Three alternative framings (HFT vs strategy vs ops) — captures a real disagreement on what "agentic in trading" means.
- Confidence: medium (admits uncertainty; doesn't pretend to have practitioner inside knowledge).
- verbosity_default: full (high-risk topic; user should see the policy).

### 4.3 Topic: "DAO governance models in 2026 crypto regulation"

```yaml
---
topic: DAO governance models in 2026 crypto regulation
topic_slug: dao-governance-2026-regulation
created: 2026-04-23
generated_by: vault-policy
policy_version: 1

topic_class: regulated
topic_class_secondary: contested

evidence_standard: regulatory-ruling

authoritative_domains:
  - sec.gov/*
  - cftc.gov/*
  - eur-lex.europa.eu/*        # EU MiCA
  - finma.ch/*                 # Swiss
  - mas.gov.sg/*               # Singapore MAS
  - law.cornell.edu/*           # US legal interpretation
  - papers.ssrn.com/*          # legal scholarship

dissent_classes_required:
  - crypto-native-legal-analysis
  - practitioner-DAO-counsel-writeup

dissent_likely_locations:
  - a16zcrypto.com/*           # industry counsel writeups
  - twitter.com/jchervinsky
  - paradigm.xyz/*
  - delphi-digital research

volatility: high
recency_weight: high
recency_window_months: 6        # regulation changes fast in 2026

risk_flags:
  - regulatory-active
  - contested-consensus
  - hype-cycle
  - non-english-dominant         # significant non-US/EU regulatory activity
blocklist_extra:
  - cointelegraph.com/*
  - decrypt.co/*
  - generic crypto news outlets

claude_bias_note: >
  Likely outdated training on 2026-specific regulatory developments. My prior
  may overweight 2023-2024 SEC enforcement actions and underweight (a) the
  MiCA implementation timeline post-2024, (b) Asian regulatory frameworks
  (Singapore/HK/Japan), (c) recent court decisions reversing prior agency
  positions. I should explicitly check publication dates and prefer 2025-2026
  primary regulatory sources over my training-time understanding.

expected_alternative_framings:
  - "Regulatory-arbitrage frame (jurisdiction-shopping)"
  - "Securities-law-defense frame (Howey test, decentralization argument)"
  - "Operational compliance frame (KYC/AML for DAO operators)"

confidence_in_assessment: low
confidence_triggers:
  - topic post-dates training in important ways
  - actively-changing regulatory landscape
  - I cannot confidently name 2026-specific rulings without WebSearch verification
  - contested at meta-level — even what counts as a DAO is disputed

verbosity_default: full
---
```

Why this looks right:
- Two-class (regulated + contested) is correct — regulation exists but consensus is disputed.
- recency_window_months: 6 (extremely tight) — regulatory changes in 2026.
- Confidence: low — explicit admission that 2026 is post-cutoff in important ways.
- Bias note names training-time vs current divergence concretely.
- Alternative framings capture the real schism (regulatory-defense vs compliance vs arbitrage).
- Dissent locations include a16z crypto, Paradigm — the actual industry counsel community.

---

## 5. EDGE CASES

### 5.1 Re-policy on stale topics

**Question: when should /vault-policy re-run?**

Auto re-policy triggers:
- Policy file `policy_version: N` and N is older than `volatility`-derived TTL:
  - low volatility: 24 months
  - medium: 12 months
  - high: 6 months (DAO example would expire fast)
- Policy file's `recency_window_months` would no longer cover today's research date.
- Topic class was `regulated` and `recency_weight: high` (regulation changes — re-policy aggressively).

Manual re-policy:
- User runs `/vault-policy <topic> --regenerate`. Old policy preserved as `policy.v<N>.yaml` (mirror /vault-challenge v2 pattern).
- Diff between v1 and v2 surfaces whether anything changed (could be a vault-lint check: "policy v2 unchanged from v1 — was regen needed?").

**Default behavior: do NOT auto-re-run.** Manual is safer. Surface stale policies in /vault-lint as a yellow flag, prompt user to regenerate.

Reasoning: auto-regen risks silent policy drift mid-research. User invariant: "research outputs are reproducible against a known policy." Auto-regen breaks that.

### 5.2 Topic decomposition

What if topic is huge (e.g. "AI safety")?

Pre-prompt guardrail (matching /vault-landscape's pre-decomposition step):
- Before running the 7-question prompt, ask: "Is this topic decomposable? If yes, name 2-4 sub-topics. Generate policy per sub-topic OR generate a meta-policy for the whole class."
- Default: generate one policy. Flag in `claude_bias_note` if decomposition would help: "Topic is broad — sub-policies for [X], [Y], [Z] would be sharper."

Don't force decomposition — user might want a coarse policy for orientation.

### 5.3 Single-keyword topics

Topic: "JWT" (just one word).

Force expansion: prompt should ask one clarifying question: "JWT is broad — narrow to: implementation, security, key rotation, validation, signing algorithms?" before running the 7-question chain.

If user insists on bare topic, generate a coarse policy with `confidence_in_assessment: medium` and `claude_bias_note` flagging the breadth.

### 5.4 Topic the model has never seen

Topic: post-training-cutoff novel domain.

The 7-question prompt will mechanically fail on Q3 (no concrete domains) and Q4 (no concrete dissent). Schema's mechanical triggers catch this:
- `authoritative_domains` < 3 entries → confidence: low
- `dissent_likely_locations` empty or vague → confidence: low

Prompt should emit a `meta_note: "topic appears outside training distribution; policy is speculative"` field. (Add to schema as optional.) Alternatively, force confidence: low + verbose claude_bias_note.

### 5.5 User overrides

User can pass overrides: `/vault-policy "X" --topic-class technical-spec --recency-weight high`.

Overrides applied AFTER the model's reasoning. Model still runs the 7-question chain; override patches the YAML. Trace records both ("model output: hyped-domain; user override: technical-spec — see reasoning"). Audit trail.

### 5.6 No applicable global blocklist

Some topics genuinely have low risk_flags. Empty `risk_flags: []` is valid. Don't force flags. Empty list is the schema-compliant signal of low-risk topic.

---

## 6. OUTPUT VERBOSITY

Two modes, schema-driven via `verbosity_default`:

**Terse (default for high-confidence, low-risk topics):**
```
Policy for "<topic>": <topic_class>, <evidence_standard>, recency <recency_weight>.
Confidence: <confidence>. Risk flags: <flags or "none">.
Full policy: ./policies/<topic_slug>.md
```

**Full (default for low-confidence or high-risk):**
- Print full YAML
- Print summary section
- Print reasoning trace summary (Q1-Q7 one-liners)

Decision rule baked into schema: `verbosity_default` is set during policy generation based on:
- `confidence_in_assessment: low` → full
- `risk_flags` includes `regulatory-active` or `contested-consensus` → full
- topic_class in `[hyped-domain, contested]` → full
- otherwise → terse

User can override at consume time: `/vault-policy show <topic-slug> --full`.

**Why this matters:** Reading too much policy is friction; reading too little is theater. Schema-driven default solves it without per-invocation cognitive load.

---

## 7. INTERFACE WITH DOWNSTREAM SKILLS

Brief sketch of how policy fields map to consumers (cross-check schema doesn't have dead fields):

- `/vault-autoresearch` reads:
  - `authoritative_domains` → site: filters in WebSearch
  - `blocklist_extra` → exclusion in WebSearch
  - `dissent_classes_required` → seeds round-2 follow-ups + round-3 counter-evidence
  - `dissent_likely_locations` → explicit search targets in counter-evidence pass
  - `recency_window_months` → time filter on WebSearch
  - `risk_flags` → modulates source acceptance (e.g. citation-cascade-likely → require ≥2 independent sources per claim)
  - `expected_alternative_framings` → seeds round-1 query expansion

- `/vault-challenge` reads:
  - `dissent_classes_required` → drives counter-evidence search class
  - `dissent_likely_locations` → explicit search targets
  - `risk_flags` → modulates which claims to challenge most aggressively
  - `expected_alternative_framings` → forces challenge to test alternatives

- `/vault-lint --quality` reads:
  - `authoritative_domains` → cite-class scoring (page citations from policy domains?)
  - `recency_window_months` → freshness check
  - `risk_flags` → modulates RED/YELLOW thresholds

Every schema field is consumed. No dead fields. (If field stays unread for 3+ months → kill it.)

---

## 8. RECOMMENDATION

**Adopt the 7-question prompt + 13-field schema as specified.**

Final prompt structure: numbered, ordered, each question constrains next, mandatory bias check at Q7, explicit "admit thin knowledge" escape, mandatory reasoning trace below YAML.

Final output schema: 13 frontmatter fields. Three enums (topic_class, evidence_standard, risk_flags) with controlled vocab. Three confidence-meta fields (`confidence_in_assessment`, `confidence_triggers`, `claude_bias_note`). Reasoning trace below.

Worked examples (JWT / agentic-quant / DAO-regulation) demonstrate that the prompt produces materially different policies and confidence calibration per topic class.

Guardrails: Q7 forced bias check + concrete-glob requirement on Q3 + controlled-vocab on Q6 + reasoning trace + mechanical low-confidence triggers. These compound — each defends a different failure mode.

Edge cases handled: re-policy stale (manual default, lint flag for stale), single-keyword expansion, post-cutoff topics, user overrides.

**Open question (defer to implementation):** Should `dissent_classes_required` be a controlled vocab or free-form? Currently free-form. Risk: vague entries. Mitigation: lint check counts entries with named domain shapes; flag if zero. Decide after dogfooding.

**Anti-pattern to avoid (matching the SOTA findings):** Don't make the policy a hard filter. It's a prior. The reasoning trace + confidence field record uncertainty. Counter-evidence pass in /vault-challenge can break the policy when mainstream sources are wrong. The policy biases ranking and shapes queries; it does not gate truth.
