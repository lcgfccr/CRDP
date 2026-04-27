---
title: Agentic Self-RAG, evidence eval, source-quality reasoning — SOTA survey + vault mapping
created: 2026-04-23
scope: retrieval-aware agents 2024-2026
angle: self-RAG / CRAG / FLARE / adaptive RAG / source reliability / topic-conditional source policy
purpose: map SOTA to vault max-ROI mechanism for ADAPTIVE topic-conditional source standards
---

# Agentic Self-RAG and Evidence Evaluation — SOTA Survey + Vault Mapping

## SOTA SURVEY

### 1. Self-RAG (Asai et al., ICLR 2024)

**Core mechanism.** LM is trained to emit *reflection tokens* interleaved with normal generation. Four token families:

- `Retrieve` ∈ {yes, no, continue} — predicted before each segment; decides whether to fetch passages.
- `IsRel` ∈ {relevant, irrelevant} — emitted per retrieved passage.
- `IsSup` ∈ {fully supported, partially supported, no support} — does the generated segment match the passage?
- `IsUse` ∈ {1, 2, 3, 4, 5} — utility of the final answer.

At inference: when `Retrieve=yes`, fetch K passages, generate K candidate segments in parallel, score each with weighted `IsRel + IsSup + IsUse` token probabilities, pick best via segment-level beam search. Inference-time weights are user-tunable — bias toward `IsSup` for citation-heavy tasks, toward `IsUse` for fluency.

**Source quality.** Self-RAG does NOT reason about source quality outside the passage. `IsRel` judges relevance to the query; `IsSup` judges grounding of the generated text in the passage. Passage credibility is implicit — the corpus is assumed pre-curated. No notion of authoritative-domain prior.

**Cost.** ~2-4× vanilla RAG: K parallel candidate generations × ≥1 reflection token per segment + critic-trained generator. Critic model (GPT-4 generated training labels) is offline; inference uses one model with vocabulary-extended reflection tokens.

**Failure modes.** Retrieval loops (repeatedly fetching similar passages), miscalibrated `Retrieve=yes` triggers (over- or under-retrieval), `IsSup` token can mark a hallucination "fully supported" when the passage is itself wrong. Production reports show 25-40% reduction in irrelevant retrievals but new failure mode of confidence-collapse loops.

### 2. Corrective RAG / CRAG (Yan et al., 2024)

**Core mechanism.** A lightweight T5-large *retrieval evaluator* scores each retrieved doc against the query, output ∈ [-1, 1]. Two thresholds (PopQA: τ+ = 0.59, τ− = −0.99) split retrieval state into three buckets:

- **Correct** (≥ one doc above τ+): refine via *decompose-then-recompose*. Split docs into 3-sentence strips, score each strip, drop strips < −0.5, recompose remaining strips as the context.
- **Incorrect** (all docs below τ−): discard, fall back to *web search* with query rewritten by an LLM.
- **Ambiguous** (between thresholds): combine refined retrieval + web search results.

**Source quality.** Implicit. Web search is the universal "more diverse knowledge" fallback — CRAG does not reason about which web sources are authoritative for the topic; it trusts the search engine ranker. Strip-level scoring filters in-passage noise but doesn't distinguish credible vs. spammy authors.

**Cost.** Retrieval evaluator forward pass per doc + optional web fetch + LLM query rewrite. Roughly 1.3-1.8× vanilla RAG when no fallback fires; 2-3× when web fallback fires.

**Failure modes.** Threshold tuning is dataset-specific (PopQA values don't transfer). T5 evaluator can mis-score domain-specific jargon. Web fallback inherits search-engine biases — when the topic is contested, top web hits often agree with the corpus error.

### 3. FLARE (Jiang et al., EMNLP 2023, baseline for 2024-2026 work)

**Core mechanism.** *Active retrieval* during long-form generation. LLM generates a tentative next sentence; if any token has probability < θ, treat sentence as uncertain → use it (with low-prob tokens masked, or rewritten as a question) as a retrieval query → regenerate sentence with retrieved context. Triggers retrieval on ~30-60% of sentences vs. fixed-interval baselines.

**Source quality.** None. Pure confidence-driven trigger; once retrieval fires, treats top hits as ground truth.

**Cost.** Adds one extra forward pass per "uncertain" sentence + retrieval call. Net cost ~1.5× vanilla RAG.

**Failure modes.** Depends on token-probability calibration. Aligned/RLHF'd models are systematically over-confident → FLARE under-retrieves on hallucinations. Domain shift breaks θ — a single static threshold doesn't transfer between scientific writing and casual chat.

### 4. Adaptive-RAG (Jeong et al., 2024) and routing variants

**Core mechanism.** Train a *small classifier* to predict query complexity → route to one of {no retrieval, single-step RAG, multi-hop RAG}. Training labels come from ground-truth model performance on each strategy ("which strategy answered correctly"). 2025 follow-ups (RAGRouter-Bench, R2RAG, FAIR-RAG): TF-IDF + SVM hits F1=0.928 with ~28% token savings vs. always-multi-hop.

**Source quality.** Routes by *retrieval depth*, not source quality. Closest 2025 variant: tier-based routing across financial / legal / medical corpora, but the tier is selected by domain classifier, not by topic-conditional reasoning about what "good source" means.

**Cost.** Classifier overhead is negligible (~ms). Net win on token cost when many queries are simple.

**Failure modes.** Classifier mis-routes novel queries (out-of-distribution). Strategy granularity is fixed — no notion of "this topic needs primary sources, that one needs reviews."

### 5. Source-reliability / evidence-aware (RA-RAG, ERA, 2025)

**Core mechanism — RA-RAG (ICLR 2025).** Iterative *unsupervised* estimation of per-source reliability across a query set. Algorithm: alternates between estimating "true answer" (weighted majority vote across sources) and updating per-source reliability (how often that source's answer matched the consensus). At inference, retrieve only from top-reliability sources, aggregate by reliability-weighted majority vote.

**ERA (Evidence-based Reliability Alignment, 2025).** Trains LLM to abstain or hedge when evidence quality is low. Augments training data with explicitly low-quality evidence + "I don't know" targets.

**Source quality reasoning.** Explicit. Reliability is a per-source scalar learned from cross-source agreement. Closest in spirit to "topic-aware quality determination" — but reliability is global per source, not topic-conditional.

**Cost.** RA-RAG: one-time cross-query reliability estimation (offline). At query time, near-zero overhead. ERA: training-time only.

**Failure modes.** RA-RAG: when most sources agree on a wrong answer (consensus error), reliability boosts the wrong side. Doesn't capture topic-conditional reliability — Wikipedia is reliable for general facts, sometimes wrong for niche math; RA-RAG collapses to a single Wikipedia-reliability scalar.

### 6. Search-o1 / Reason-in-Documents (RUC NLPIR, EMNLP 2025)

**Core mechanism.** Large-reasoning-model (o1-like long CoT) is trained to emit `<search>query</search>` mid-reasoning when it hits "uncertainty". A separate *Reason-in-Documents* module condenses the retrieved docs into 1-2 reasoning steps that slot into the chain. Batch-generation with interleaved search lets multiple parallel reasoning threads share retrieval calls.

**Source quality.** None native. The Reason-in-Documents module filters noise per-document but doesn't reason about source class.

**Cost.** Higher than CRAG/Self-RAG — o1-style long CoT + per-search condense step. Justified by complex reasoning tasks (math, science).

**Failure modes.** Search trigger inherits model's confidence calibration (same as FLARE). Condense step can summarize away the contradicting detail.

### 7. Deep Research agents (OpenAI/Perplexity/Gemini DeepResearch 2025; Step-DeepResearch, OPPO DR survey)

**Core mechanism.** Multi-round agentic search. Plan → search → fetch → write → critique → re-search. The novel piece for *source quality* is **curated authoritative shards**: Step-DeepResearch and similar systems built ~600 "authoritative" sites (gov, .edu, official orgs, peer-reviewed journals) into separate physically-isolated index shards, with an *authority boosting factor* applied at ranking — when semantic relevance is comparable, prefer authoritative shard.

**Source quality reasoning.** Static curated allowlist + ranking boost. NOT topic-conditional — gov.uk is boosted for any query, even ones where a gov source is irrelevant or biased.

**Cost.** Heavy — 50-200 tool calls per research run. Trade is justified for "research-grade" output.

**Failure modes.** Curated shard goes stale. Authority boosting amplifies institutional bias. No mechanism to *de*-boost authoritative sources when the topic is one they're systematically wrong about (e.g., government health agencies on contested nutrition topics).

### Summary table — what each pattern adds

| Pattern | When-to-retrieve | Source quality | Topic-conditional? |
|---|---|---|---|
| Self-RAG | learned `Retrieve` token | passage-level relevance/support | no |
| CRAG | retrieval-evaluator scalar | strip filtering + web fallback | no |
| FLARE | token-prob threshold | none | no |
| Adaptive-RAG | classifier on query | routing by depth | no (routes by complexity, not source class) |
| RA-RAG | always | global per-source reliability scalar | no (global, not topical) |
| Search-o1 | CoT-emitted query | Reason-in-Documents filter | no |
| Deep Research agents | multi-round plan | curated authority shards + ranking boost | partial (domain shards exist but boost is static) |

**Gap nobody has filled.** No SOTA system reasons about source quality *as a function of the topic* before retrieval. All seven patterns either (a) score quality post-retrieval, (b) treat quality as a global static prior, or (c) curate a static authoritative shard. The vault user's intuition — that "good sources" depends on what's being asked — maps to a missing primitive: a *pre-retrieval source policy* generated by reasoning about the topic.

---

## MAPPING TO VAULT

### Q1. Which SOTA pattern most closely matches "topic-aware quality determination as PRE-search step"?

None directly. Closest analogs:

- **Deep Research's authoritative shards** — same intuition (some sources are better) but static, not topic-conditional.
- **Adaptive-RAG's classifier** — same idea of reasoning about query before retrieving, but it picks retrieval *depth*, not *source class*.
- **RA-RAG's reliability estimation** — explicit per-source quality scalar, but global.

Vault concept = combine these three: a per-query reasoning step that emits a *topic-conditional source policy* (allowlist patterns, evidence standards, dissent expectations) *before* `WebSearch` fires. This is a small but real research delta — none of the 7 SOTA patterns do exactly this.

### Q2. Self-RAG reflection tokens → vault frontmatter

Direct map. The four reflection token families have natural vault analogs:

| Self-RAG token | Vault analog | Where it lives |
|---|---|---|
| `Retrieve ∈ {yes, no, continue}` | "is web search needed for this question, or can vault answer it?" | already implicit in `/vault-query` vs `/vault-autoresearch` choice; could be a `retrieval:` frontmatter field on questions.md entries |
| `IsRel ∈ {rel, irrel}` | per-source relevance after fetch | already implicit — sources that don't make it into the synthesis page were judged irrelevant |
| `IsSup ∈ {full, partial, none}` | per-claim support level — would slot into Key facts as `(fully supported by [src](url))` vs `(partially supported)` | NEW; current vault just cites without grading support strength |
| `IsUse ∈ {1..5}` | page-level utility / verification | maps onto existing `verification: quick \| deep \| challenged` field — extend with a 1-5 confidence scalar |

Concrete proposal: extend frontmatter with three new optional fields:

```yaml
verification: quick | deep | challenged    # already exists
source_class: [primary, secondary, tertiary, opinion]   # NEW — coarse class of cited sources
support_grade: full | partial | mixed       # NEW — strongest support level for the page's main claims
confidence: 1-5                              # NEW — Self-RAG-style ISUSE
```

`/vault-lint --quality` already scores 6 dimensions (cite-density, cite-diversity, never-challenged, freshness, inbound-links, open-question resolution) → add cite-class as a 7th, derived from `source_class`.

### Q3. CRAG-style "retrieval was poor → reformulate" loop in vault?

Yes, but narrowly. Current `/vault-autoresearch` is open-loop: 3 rounds, no quality check between rounds. CRAG-style retry should fire only when:

- Round 1 returns ≥3 sources but no source matches the topic-conditional policy from Q1 (analog of "all docs below τ−"). Retry with reformulated query.
- A claim's only supporting source is in the topic's blocklist (e.g., a marketing blog when policy required peer-reviewed). Trigger one targeted re-search.

Don't want a CRAG loop on every round — it would explode cost. Use it as an *escape hatch* triggered by source-policy violation, not by a generic relevance score.

### Q4. Concrete proposals — 1-2 retrieval-aware mechanisms adjacent to existing vault architecture

Two complementary additions, both small, both ride existing skill structure.

#### Proposal A — `/vault-source-policy` (pre-retrieval planner; new skill)

Lightweight skill that runs *before* `/vault-autoresearch` round 1 (or on demand). Input: topic. No web access. Pure LLM reasoning. Output: a structured policy block written to `projects/<slug>/raw/source-policy-<topic-slug>.md` and read as context by `/vault-autoresearch`.

Policy contents:

```markdown
# Source policy: <topic>

## What "authoritative" means here
<reasoning: who's the field's authority? primary literature? practitioner blogs? gov agencies?>

## Preferred source classes (ranked)
1. <e.g. peer-reviewed papers>
2. <e.g. official spec documents>
3. <e.g. recognized practitioner blogs>

## Blocklist patterns
- <e.g. SEO content farms>
- <e.g. vendor marketing pages>

## Evidence standards
- <e.g. require RCT for causal claims>
- <e.g. require benchmark numbers, not vibes>

## Dissent expectations
<is this contested? where should we expect to find the dissenting view? — primes the counter-evidence pass>

## Recency requirement
<e.g. last 24 months for ML, last 5 years for law>
```

`/vault-autoresearch` reads this file at round 1 start, uses it to (a) shape `WebSearch` queries with `site:` filters from the allowlist, (b) tag fetched sources by class, (c) prime the round-3 counter-evidence pass with the dissent expectation. ~1-2 extra LLM calls before round 1; near-zero web cost.

This is the **direct match** for the user's "topic-conditional adaptive standards" intuition. It's pre-retrieval (the user's framing) and topic-conditional (the missing primitive in SOTA).

#### Proposal B — `verification: quick | deep | challenged | reflected` + per-claim source class tags

Smaller, fully passive. No new skill — just a richer schema.

- Extend frontmatter with `source_class:` listing the classes of cited sources.
- Per Key fact, add inline `(class: primary, [src](url))` or `(class: practitioner-blog, [src](url))`.
- New verification stage `reflected` (above `deep`, below `challenged`): claim has been graded for `IsSup ∈ {full, partial, none}` and the grade is recorded in the citation.
- `/vault-lint --quality` adds two checks: any page cites only `tertiary` or `opinion` class? flag YELLOW. Any page has zero `primary` class citations on a topic where the policy requires them? flag RED.

Cost: zero at write time (Claude already classifies sources mentally; this just surfaces it). Pays off at lint and at challenge time.

Together: A generates the policy, B records compliance with it. The pair fills the gap none of the 7 SOTA patterns covers.

---

## RECOMMENDATION

**Build proposal A (`/vault-source-policy`).** It is the highest-leverage mechanism because:

1. **Closes a real SOTA gap.** No published agent does pre-retrieval, topic-conditional source policy generation. Self-RAG, CRAG, FLARE, RA-RAG, Deep Research all reason about quality *during or after* retrieval, with global priors. Vault would be doing something the published systems explicitly don't.
2. **Matches user's stated intuition.** User's mental model = "before searching, decide what good sources mean for this topic." That is literally the skill spec.
3. **Adjacent, not duplicative.** `/vault-challenge` is post-hoc adversarial (claim → search for dissent). `/vault-source-policy` is pre-hoc constructive (topic → search standards). Different stages of the pipeline; complementary.
4. **Cheap.** 1-2 LLM calls, no web cost. Output is a single 50-line markdown file consumed by autoresearch.
5. **Composes with existing stack.** `/vault-autoresearch` reads the policy → smarter round-1 queries. `/vault-challenge` reads the policy → dissent expectations prime its search. `/vault-lint --quality` reads `source_class` tags → flags policy violations. One new file unlocks four existing skills.
6. **Falsifiable ROI.** Run 5 topics with policy + 5 without. Measure: cite-class diversity, contestation-pass hit rate, post-hoc challenge surfacing rate. If policy version doesn't improve cite-class distribution by ≥30%, kill it.

**Integration shape.**

- New skill at `~/.claude/skills/vault-source-policy/SKILL.md`. Trigger: explicit `/vault-source-policy "topic"` OR auto-invoked at start of `/vault-autoresearch` if `--policy` flag (default-on after a dogfood period).
- Policy file at `projects/<slug>/raw/source-policy-<topic-slug>.md`, parallel to existing `raw/autoresearch-<topic-slug>-r1.md`.
- `/vault-autoresearch` SKILL.md gets a Round 0.5 step: "read policy file if exists, use allowlist for WebSearch `site:` filters, tag fetched sources, pass dissent expectations to round 3."
- `/vault-lint --quality` adds cite-class check.

**Defer proposal B (frontmatter expansion) to phase 2.** It's lower friction but lower signal. Once policy generation is dogfooded, the source_class tags emerge naturally as compliance receipts. Don't pre-build the schema; let it crystallize from policy use.

**Expected ROI.**

- Per-research-run: +1-2 LLM calls (policy gen) → -2-4 wasted WebFetch calls on low-quality sources (allowlist filter). Net: cheaper.
- Per-page: higher cite-class diversity, fewer contestation surprises in `/vault-ingest` step 3b, sharper round-3 counter-evidence (dissent expectations primed).
- Compounding: policy files accumulate in `raw/`. Over time they become a dataset of "what good sources mean per topic class" — itself ingestable into the vault as meta-knowledge.

**Anti-pattern to avoid.** Don't make the policy a hard filter (RA-RAG mistake). Make it a *prior* that biases ranking and shapes queries, but allow the round-3 counter-evidence pass to break it when the topic's mainstream sources are wrong (the contested-consensus failure mode). The policy is the prior; counter-evidence is the update.

## Sources

- [Self-RAG paper (arXiv)](https://arxiv.org/abs/2310.11511)
- [Self-RAG project page](https://selfrag.github.io/)
- [CRAG paper (arXiv)](https://arxiv.org/abs/2401.15884)
- [CRAG implementation analysis](https://medium.com/@jayduttdesais255/beyond-standard-rag-building-robust-rag-with-corrective-retrieval-5774068db3e9)
- [FLARE / Active RAG paper](https://aclanthology.org/2023.emnlp-main.495.pdf)
- [Adaptive-RAG paper](https://arxiv.org/abs/2403.14403)
- [RAGRouter-Bench (2026)](https://arxiv.org/abs/2604.03455)
- [Search-o1 (EMNLP 2025)](https://arxiv.org/abs/2501.05366)
- [RA-RAG (ICLR 2025)](https://openreview.net/forum?id=J3xRByRqOz)
- [Deep Research survey](https://arxiv.org/html/2508.12752v1)
- [Step-DeepResearch technical report](https://arxiv.org/html/2512.20491v1)
- [Self-Reflective RAG overview](https://www.emergentmind.com/topics/self-reflective-retrieval-augmented-generation-self-rag)
- [Reasoning Agentic RAG survey](https://aclanthology.org/2025.findings-ijcnlp.122.pdf)
- [RAG comprehensive survey 2025](https://arxiv.org/html/2506.00054v1)
