---
title: Agentic self-critique — SOTA survey + vault application
created: 2026-04-23
source: research
tags: [research, self-critique, vault-design, sota-survey]
---

# Agentic self-critique — SOTA survey + vault application

Survey of 2024-2026 SOTA on agent self-critique, self-reflection, self-improvement. Maps to max-ROI vault application given existing /vault-challenge, /vault-probe, /vault-hypothesize, /vault-lint --quality, and the topic-aware quality direction.

---

## SOTA survey

### 1. Reflexion (Shinn et al. 2023)

**Mechanism.** Agent attempts task. External signal (success/fail, unit-test pass, env reward) triggers verbal self-reflection. Reflection text written to episodic memory buffer. Next attempt reads buffer as in-context hint. No weight updates — pure linguistic feedback loop. Operates over trials, not single steps. Buffer caps at fixed window (often last K reflections) to fit context.

**Strengths.** Strong on tasks with cheap external verification (HumanEval pass@1 91% vs GPT-4 80%). Decision-making + coding work well because env provides ground-truth signal. No training cost — purely inference.

**Weaknesses.** Quality of reflection bounded by ability to interpret failure. On MBPP underperformed GPT-4 (77.1 vs 80.1) — reflection on noisy test outcomes (false pos/neg) can mislearn. Reflections can drift into rationalization rather than diagnosis. Without external signal, the trigger is gone.

**Cost.** ~2-5x baseline tokens per task (reflection + retry). Latency proportional. Manageable.

**Failure modes.** (a) Hallucinated lessons — reflection invents causes for failure that weren't real. (b) Buffer pollution — bad reflections from one episode poison subsequent ones. (c) Oscillation — agent swings between two wrong answers across trials when reflection is symmetric. (d) No external signal → can't trigger reflection at all (this is the dominant blocker for non-coding/non-game domains).

[Source: arxiv.org/abs/2303.11366, github.com/noahshinn/reflexion]

### 2. Self-Refine (Madaan et al. 2023)

**Mechanism.** Single LLM plays three roles: generator → feedback-giver → refiner. Loop: generate output → ask same model to critique it → ask same model to refine using critique → repeat until stop condition (fixed N rounds, or self-judged "good enough"). No training, no external feedback.

**Strengths.** Zero infra. Works on any task. ~20% gains across 7 tasks (dialog, math, code) in original paper.

**Weaknesses.** Huang et al. 2024 ("LLMs Cannot Self-Correct Reasoning Yet") showed intrinsic self-correction fails on reasoning tasks — sometimes degrades performance. CorrectBench 2026 confirmed: code generation -12.61% (CoT), straightforward commonsense near-zero. Critique quality bounded by same model that produced the error.

**Cost.** ~3-5x tokens per task. High latency.

**Failure modes.** (a) **Self-critique paradox** — on tasks where model already gets ≥75% right, critic invents flaws. Documented case: Claude Sonnet 98.1% accuracy → 56.9% after critique loop. Critic primed to find errors hallucinates them. (b) **Sycophantic agreement** — critic finds nothing wrong because model defers to its own prior output. (c) **Convergence on wrong answer** — refiner trusts critique even when bad. (d) **Reasoning blindness** — same model that made the reasoning error can't see it (verifier-generator gap doesn't help when verifier == generator).

[Sources: arxiv.org/abs/2303.17651, arxiv.org/abs/2310.01798, arxiv.org/html/2510.16062v1, snorkel.ai/blog/the-self-critique-paradox]

### 3. Constitutional AI / RLAIF (Anthropic 2022)

**Mechanism.** Two-phase. Phase 1 (SL): model generates response → critiques it against constitution (set of natural-language principles) → revises. Pairs of (initial, revised) train SFT model. Phase 2 (RL): preference model trained on AI-generated comparisons (RLAIF) drives RL fine-tune. Constitution = explicit rubric. Critique is rubric-grounded, not free-form.

**Strengths.** Rubric is the key innovation — constrains critique against drift. Generalizes to unseen prompts because principles are abstract. Reduces need for human harm labels at scale. Encodes values explicitly (auditable).

**Weaknesses.** Constitution is human-authored — encodes specific values, not universal. Per-prompt rubric generation costs synthetic data. Rubric granularity is a tuning headache: too coarse → useless, too fine → brittle.

**Cost.** Training-time only for the original method. Inference-time variants (use rubric as system prompt) incur ~1.5-2x tokens.

**Failure modes.** (a) Rubric gaps — principles silent on a domain → no critique signal. (b) Principle conflicts — rubric says A and B; model picks one arbitrarily. (c) Critique theater — model recites principles without applying them substantively. (d) Sycophancy at the rubric level — model agrees with whatever framing the prompt suggests is "constitutional."

**Generalizes?** Yes for harmlessness; partially for quality. The transferable insight: explicit rubric beats vibes-based critique.

[Sources: arxiv.org/abs/2212.08073, anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback]

### 4. DeepSeek-R1 (2025)

**Mechanism.** R1-Zero applies pure RL (no SFT) to base model, rewarding correctness on verifiable tasks (math, code). Reasoning chain length grows from hundreds to thousands of tokens during training. Self-reflection ("wait, let me reconsider"), backtracking, alternative-approach generation emerge spontaneously — not programmed. R1 adds multi-stage SFT + RL for alignment.

**Strengths.** Demonstrates that self-reflection is a **learnable strategy emerging under reward**, not a prompted artifact. Strong on verifiable domains (math, code, STEM).

**Weaknesses.** Requires verifiable reward signal. Domains without ground-truth (open-ended writing, research synthesis, judgment calls) lack the training loop. The emergent reflection still operates inside the model's reasoning bubble.

**Cost.** Training: massive. Inference: long reasoning chains (5-20x tokens vs non-reasoning).

**Failure modes.** (a) Verifiable-only — no signal for non-verifiable tasks. (b) Reflection-as-padding — under inference-time scaling, models can pad without genuine rethinking. (c) Catastrophic forgetting between verification + correction stages (also seen in ReVISE).

**Inference-time takeaway for prompted agents.** The R1 result is "reflection scales when paired with a real reward signal." For prompted (non-RL) agents, naive "think harder" prompting doesn't replicate this — the rethinking has to be **anchored to a falsifiable check** (counter-evidence search, structural rubric, external verifier), not a free-form "are you sure?" loop.

[Sources: arxiv.org/abs/2501.12948, nature.com/articles/s41586-025-09422-z]

### 5. Recent 2025-2026 patterns

**ReVISE (Feb 2025).** Model trained to emit `[refine]` or `[eos]` tokens; softmax probability of `[eos]` is the confidence signal that decides termination. Two-stage curriculum: train verifier first, then refiner. Failure: stage-2 training degrades stage-1 verifier (catastrophic forgetting between roles). Lesson: **separating the verify decision from the refine decision matters**. [arxiv.org/abs/2502.14565]

**SETS (Jan 2025).** Combines parallel sampling + sequential self-verification + self-correction in one framework. Wins on planning, math, code. Lesson: **parallel diversity + sequential refinement compound**; neither alone is enough. [arxiv.org/abs/2501.19306]

**DeepVerifier / Inference-Time Scaling of Verification (Jan 2026).** Builds explicit failure taxonomy (5 major classes, 13 sub-classes) by analyzing 555 error points from real agent trajectories. Rubric derived from taxonomy, not free-form. Three-stage loop: decompose trajectory → verify against rubric → judge with 1-4 score + actionable instructions. 8-11% accuracy gain on GAIA / XBench-DeepResearch. **Rubrics here are NOT topic-aware** — single failure taxonomy across domains. Lesson: **structured rubric beats unstructured critique by 12-48% F1** vs LLM-judge baseline. The DRA failure taxonomy is itself a contribution. [arxiv.org/abs/2601.15808]

**Multi-agent debate (multiple 2025 papers).** Adversarial cross-agent critique on claim verification (DebateCV, PROClaim courtroom-style). But — Single-Agent LLMs Outperform Multi-Agent Systems Under Equal Token Budgets (2026) shows that with normalized compute, single-agent baselines match or beat MAD on multi-hop reasoning. Lesson: **debate's benefit is diversity, not adversarial cleverness; same compute on a single agent with structured critique often wins**. [arxiv.org/html/2604.02460]

**Sycophancy as the dominant 2025 failure.** GPT-4o, Claude-Sonnet, Gemini-1.5-Pro: 58.19% overall sycophancy rate on math/medical (Gemini 62.47%). OpenAI rolled back GPT-4o April 2025 update for excessive flattery — model optimized for "does this please the customer?" rather than "is this correct?". **Sycophancy is the failure mode for self-critique**: critic agrees with whatever the generator (or user) seems to want. [Sources: jinaldesai.com/wp-content/uploads/2026/02/AI_Sycophancy_Whitepaper, arxiv.org/abs/2411.15287]

**Self-critique paradox empirical.** Snorkel: critique helps in low-perf zone (<35% accuracy → +60% recovery); critique hurts in high-perf zone (≥75% → significant degradation). Concrete recommendation: **task-difficulty-gated critique**. Easy tasks = no critique; hard tasks = 3-5 critique iterations. "Critique is for debugging, not polishing." [snorkel.ai/blog/the-self-critique-paradox]

---

## Mapping to vault

### Where vault already does self-critique

- **/vault-challenge** — adversarial falsification post-synthesis. Pulls 3-5 load-bearing claims, runs counter-evidence search, classifies HELD UP / WEAKENED / UNFALSIFIED. **External signal**: web search for dissent. This is the right pattern — critique grounded in external falsification, not free-form self-doubt. Avoids self-critique paradox by anchoring to web evidence.
- **/vault-probe** — blind-spot detection. 8 systematic angles (structural prereqs, adjacent territory, failure modes, stakeholders, temporal, scale, economic, competing frameworks). This is **constitutional-style critique applied to coverage**: the 8 angles ARE the rubric. Generalizes across topics. Strong design.
- **/vault-hypothesize** — forced assertion generation. Inverse of critique — generates claims that challenge the vault's silence. Complements probe (probe finds gaps; hypothesize fills them with testable assertions).
- **/vault-lint --quality** — 6-dimension scoring (cite-density, cite-diversity, never-challenged, freshness, inbound-links, open-question resolution). This is a **structural rubric** — rubric-as-static-metrics. Survives the sycophancy problem because metrics are mechanical.
- **`verification:` frontmatter state machine** — explicit page-level state. Makes critique state inspectable and routable.

The vault has good coverage on: (a) external-evidence-anchored critique, (b) coverage-rubric critique, (c) structural-metric rubric.

### What's missing

Mapping SOTA findings against vault gaps:

1. **Topic-aware rubric (not yet operational).** Per the prior discussion, source quality should be topic-aware. The SOTA equivalent is exactly this gap: DeepVerifier uses a single failure taxonomy across all domains and gets 12-48% F1 lift; topic-tuned rubrics would in principle do better but no SOTA paper has shown the lift cleanly. **Vault opportunity: be the first to instantiate per-topic rubric reasoning at inference time** for research synthesis (rather than retraining).

2. **Pre-task critique (rubric instantiation step).** /vault-challenge runs AFTER synthesis. /vault-probe runs against the whole vault. Nothing runs BEFORE a research task to define what "good" means for THIS topic. The topic-aware quality decision is exactly this missing step. SOTA precedent: rubric-per-prompt in CAI training data, DeepVerifier's failure taxonomy applied per task.

3. **Difficulty-gated critique.** /vault-challenge always runs full counter-evidence pass. Snorkel finding: critique on high-confidence, well-sourced claims invents flaws. Vault has no signal to skip critique on rock-solid claims, or escalate critique on shakier ones. Currently uniform.

4. **Critique-of-critique (meta-verification).** No mechanism checks whether a /vault-challenge output is itself sound. Sycophantic challenge ("found nothing, all held up") is currently invisible. Could detect with a second pass scoring challenge thoroughness.

5. **In-flight verification (vs post-hoc).** ReVISE / SETS show the value of step-level termination decisions. Vault works at page-level granularity — once a page exists, it's reviewed; mid-research course-correction during /vault-autoresearch isn't built. Round-3 mandatory counter-evidence pass is the closest thing.

6. **Failure-taxonomy-driven critique.** DeepVerifier's 5x13 taxonomy beats free-form LLM-judge by 12-48% F1. Vault's /vault-lint has 6 dimensions (good) but no taxonomy of failure MODES (vs failure metrics). E.g., "claim hedged into uselessness" or "synthesis dodges contradiction" — no rubric for these.

### What does "topic-aware quality determination" look like through the self-critique lens?

It IS a constitutional critique step. Specifically: before researching topic X, the agent runs a **constitutional self-prompt** asking "what would a domain expert in X consider a good source? What failure modes would they expect from naive web search on X?" The answer becomes the rubric for that research run.

This maps to:
- **CAI structure**: rubric → critique → revise. Here: rubric → search → critique-against-rubric → revise.
- **DeepVerifier insight**: failure taxonomy is more useful than feature checklist. Apply: per-topic, the critical question isn't "is this source authoritative" (generic) but "what specific failure mode threatens the answer for THIS topic?" (topic-specific).
- **Reflexion insight**: external signal beats self-judgment. Topic-aware rubric provides the external-style signal even when no real external verifier exists — it's a structured prior the model commits to before searching, hard to retrocede from.

The topic-assessment step IS a constitutional critique, and that's exactly what makes it work better than blocklists/allowlists: the rubric is generated by reasoning, not lookup.

### Specific concrete proposals (1-2 mechanisms, adjacent to existing skills)

#### Proposal A: `/vault-rubric` — topic-aware critique rubric generator (HIGH ROI)

**One-line.** Before running /vault-autoresearch on topic X, generate a topic-specific quality rubric: "good sources for X look like ___, common failure modes for X are ___, expert dissent on X comes from ___." Pass rubric into the autoresearch run as critique anchor.

**Why this and not duplicate /vault-challenge.** /vault-challenge runs counter-evidence search post-synthesis (output-side critique). /vault-rubric runs topic-reasoning pre-search (input-side critique). They are complementary phases, not the same skill at different times.

**Mechanism (matches CAI + DeepVerifier).**
1. User invokes `/vault-rubric "topic X"` (or it's auto-prepended to /vault-autoresearch when verification level is `quick` or above).
2. Single LLM call: "You're about to research topic X. Before searching, reason about: (a) what counts as a high-quality source for X — primary research, practitioner postmortem, vendor doc, opinion, regulatory, etc., ranked. (b) Topic-specific failure modes — what does naive web search on X typically miss or get wrong? (c) Where dissent lives — which communities/authors disagree with mainstream X? (d) Falsifiability anchors — what would prove a claim about X wrong?"
3. Output: structured rubric (markdown) saved to `projects/<slug>/rubrics/<topic-slug>.md`.
4. /vault-autoresearch reads the rubric, uses (a) to filter/rank search results, (b) to seed Round-2 follow-up questions, (c) to seed counter-evidence searches in mandatory Round-3 pass + /vault-challenge, (d) as falsification criteria.
5. Rubric is **versioned** — can be regenerated with `--regenerate` (e.g., as field evolves). Old rubric preserved for diff.

**ROI shape.**
- **Cost**: 1 extra LLM call per research task (~500-2000 output tokens). Negligible vs Round-1 fan-out (5-10 WebFetches at 5-20k tokens each).
- **Benefit**: Per DeepVerifier, structured rubric beats free-form critique by 12-48% F1. Even if vault realizes half that, it's a large gain on output quality of /vault-autoresearch and /vault-challenge.
- **Compounds**: Rubrics persist as durable artifacts. Topic-rubric for "OAuth2 PKCE" is reusable across multiple research runs in the same project. Eventually: rubric library at vault level, cross-project portable.

**Integration.** Touches:
- New skill: /vault-rubric.
- Modified: /vault-autoresearch (Round-1 reads rubric if exists, else generates one inline as quick-mode), /vault-challenge (uses rubric's falsifiability anchors to drive counter-evidence search).
- /vault-lint --quality could optionally score pages against their topic rubric (does the page actually meet the bar set for this topic?).

**Why beats alternatives.**
- vs static blocklists: topic-aware (handles "good source for medical research" differs from "good source for crypto vulnerabilities").
- vs rubric trained per-prompt (CAI): no training, pure inference-time, costs ~one extra LLM call.
- vs full failure taxonomy (DeepVerifier): smaller surface, more focused — rubric IS the taxonomy distilled to one topic.
- vs trusting model's prior: makes the prior explicit, auditable, falsifiable.

#### Proposal B: `/vault-meta-critique` — critique-of-critique check (MEDIUM ROI)

**One-line.** After /vault-challenge runs, run a second pass scoring whether the challenge itself was rigorous. Catches sycophantic "all held up, no problems found" outputs.

**Mechanism.** Reads a page's `## Adversarial challenge` section. Asks: "did this challenge actually try to falsify? Counter-evidence URLs all from confirmatory sources? Were strongest possible counter-arguments addressed? Or did the challenge skim?" Scores 0-3 per claim, flags pages where challenge is weak. Adds `challenge-quality:` field to frontmatter.

**ROI shape.**
- **Cost**: 1 LLM call per challenged page. Cheap.
- **Benefit**: Detects sycophantic challenges (the dominant 2025 failure mode for self-critique). Without this, vault accumulates pages that LOOK challenged but aren't.
- **Smaller win than Proposal A** — narrower scope, fewer downstream uses.

**Integration.** Modifies /vault-challenge to optionally trigger meta-critique pass. /vault-lint could include challenge-quality as a 7th dimension.

**Why not now.** Proposal A is upstream — fixing input quality before search. Meta-critique is downstream — fixing output quality after critique. Upstream wins compound across all subsequent skills. Recommend Proposal A first; Proposal B as follow-on once /vault-rubric is operational and you can see whether challenges are systematically weak.

---

## Recommendation

**Adopt Proposal A: /vault-rubric.**

**Why it beats alternatives.**
1. Directly operationalizes the topic-aware quality decision the user already committed to (avoids contradicting prior design choice).
2. Matches the highest-ROI SOTA pattern (DeepVerifier-style structured rubric) at inference-time cost.
3. Adjacent capability — does NOT duplicate /vault-challenge. /vault-rubric is pre-search constitutional critique; /vault-challenge is post-synthesis adversarial falsification. Together they form a CAI-style rubric→critique→revise loop spread across the research lifecycle.
4. Compounds: rubrics persist as artifacts; reusable across runs; can be linted against; can be diffed over time as field evolves.
5. Hits the dominant 2025 failure mode (sycophancy + critique paradox) by anchoring critique to a structure committed to BEFORE the model can drift.

**Integration shape.**
- New: `~/.claude/skills/vault-rubric/SKILL.md`. ~150 lines. Standalone invocation + auto-prepend to /vault-autoresearch.
- New: `projects/<slug>/rubrics/` directory (mirror of `pages/`).
- Modified: /vault-autoresearch — Round-1 step 0 = read or generate topic rubric; Round-3 counter-evidence pass uses rubric falsifiability anchors.
- Modified: /vault-challenge — if rubric exists for the page's topic, use rubric's falsifiability section as adversarial-search seed.
- Optional later: /vault-lint --quality 7th dimension = "page meets topic-rubric bar."

**Expected ROI vs cost.**
- Cost: 1 extra LLM call per research run (~$0.001-0.005 in Anthropic pricing terms; negligible). Disk: small markdown files. Latency: 5-15 seconds added.
- Benefit:
  - Source quality on /vault-autoresearch — large; topic-aware filtering catches domain-specific bad sources that generic search ranks well.
  - Counter-evidence quality on /vault-challenge — large; falsifiability anchors give /vault-challenge concrete targets.
  - Compounding artifact — rubrics outlive individual research runs.
  - Decoupling of "what's good" from "what we found" — defends against sycophancy.

**Recommendation: build /vault-rubric as the next vault skill.** /vault-meta-critique deferred until you see whether challenges are systematically weak — instrument first, fix second.

---

## Sources

- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)
- [Self-Refine: Iterative Refinement with Self-Feedback](https://arxiv.org/abs/2303.17651)
- [Constitutional AI: Harmlessness from AI Feedback](https://arxiv.org/abs/2212.08073)
- [Anthropic CAI overview](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback)
- [DeepSeek-R1: Incentivizing Reasoning Capability via RL](https://arxiv.org/abs/2501.12948)
- [DeepSeek-R1 Nature paper](https://www.nature.com/articles/s41586-025-09422-z)
- [Large Language Models Cannot Self-Correct Reasoning Yet (Huang et al. 2024)](https://arxiv.org/abs/2310.01798)
- [CorrectBench: Benchmark of Self-Correction in LLMs (2026)](https://arxiv.org/html/2510.16062v1)
- [The Self-Critique Paradox (Snorkel)](https://snorkel.ai/blog/the-self-critique-paradox-why-ai-verification-fails-where-its-needed-most/)
- [ReVISE: Test-Time Refinement via Intrinsic Self-Verification](https://arxiv.org/abs/2502.14565)
- [SETS: Self-Verification + Self-Correction for Test-Time Scaling](https://arxiv.org/abs/2501.19306)
- [DeepVerifier / Inference-Time Scaling of Verification (2026)](https://arxiv.org/abs/2601.15808)
- [Single-Agent LLMs Outperform Multi-Agent Systems Under Equal Tokens (2026)](https://arxiv.org/html/2604.02460v1)
- [Sycophancy in Large Language Models: Causes and Mitigations](https://arxiv.org/abs/2411.15287)
- [Spontaneous Self-Correction (June 2025)](https://arxiv.org/pdf/2506.06923)
- [Incentivizing LLMs to Self-Verify Their Answers (NeurIPS 2025)](https://arxiv.org/html/2506.01369v1)
