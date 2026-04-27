---
title: source-quality allowlist — vault contamination defense
created: 2026-04-23
status: research-only (no implementation)
angle: route WebSearch through tier-curated domain pools to defeat citation cascades and hype-ecosystem bias
inputs:
  - /Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md
  - /Users/lucafuccaro/.claude/skills/vault-challenge/SKILL.md
  - /Users/lucafuccaro/.claude/skills/vault-ingest/SKILL.md
  - WebSearch tool schema (allowed_domains / blocked_domains arrays)
---

# Source-quality allowlist — design

Improve WHICH sources hit the vault, not how many rounds search them.

---

## 1. Problem framing

### 1.1 What's broken

`/vault-autoresearch` round 3 counter-evidence pass and `/vault-challenge` adversarial pass both run `WebSearch` + `WebFetch` against the open public web. For polluted domains (quant trading, agentic AI hype, crypto, niche academia), confirming AND dissenting results come from the SAME ecosystem:

- **Citation cascade**: 5 "secondary" sources all cite 1 primary. Looks like 5 votes; is 1.
- **Hype monoculture**: agentic-AI vendor blogs, crypto-native media, quant Twitter — even "critiques" published in this ecosystem replay ecosystem framings. Counter-evidence pass returns counter-evidence-shaped content, not actual dissent.
- **SEO spam ranking**: top-ranked WebSearch results are increasingly content-marketing pages optimized for the query, not for truth. Round 1 grabs them, rounds 2-3 deepen inside their frame.
- **Coordinated voice**: domains like crypto have well-funded coordinated discourse on both "pro" and "skeptic" sides — but both are insiders. Real-money academic finance critique sits in SSRN papers nobody clicks.

The vault confidently propagates this because Tensions & contradictions section reads "we found dissent" when in reality the dissent is from the same well.

### 1.2 What an allowlist defense looks like

Constrain WebSearch's source pool BEFORE the search, not after. Tier domains by epistemic quality (primary > secondary > general > marketing). Route queries to appropriate tiers based on topic / vault project / claim type. Force at least one primary-source touch per research run.

### 1.3 What WebSearch actually allows

Confirmed from tool schema (loaded April 2026):

```
WebSearch.allowed_domains: array of strings  # results restricted to listed domains
WebSearch.blocked_domains: array of strings  # results exclude listed domains
```

Both are first-class params. They appear to be applied at the SEARCH-RESULTS layer (filter the result set), not at the engine layer — meaning a query returning all-blocked results returns empty, not a re-ranked alternative. Implication: blocklist is safe (zero false positives if domain genuinely garbage). Allowlist is risky (can return zero results if list too narrow). WebFetch has no such param — already URL-specific.

`/vault-autoresearch` and `/vault-challenge` skill files (read in full) currently invoke `WebSearch` with no allowed/blocked params. Default = full web. This is the entire surface area to fix.

---

## 2. Design space

Seven candidate mechanisms, evaluated independently then scored together.

### 2.1 D1 — Domain allowlist by topic tag

Each page's frontmatter `tags:` triggers a per-tag domain pool. `tags: [academic]` → search restricted to arxiv.org, ssrn.com, scholar.google.com, *.edu. `tags: [legal]` → courtlistener.com, *.gov, justia.com. `tags: [engineering]` → official docs (RFC editor, MDN, language.org), GitHub repos.

Triggered when round-1 WebSearch fires inside autoresearch or challenge. Tags inherited from existing pages in the project; for new pages, infer from query text or project `overview.md`.

Storage: per-tag JSON map at `~/.claude/vault/_global/tag-domain-pools.json`, user-editable.

### 2.2 D2 — Tier-based source weighting (post-search re-rank)

Don't restrict. Re-rank. Every WebSearch returns ~10 results. Tag each by domain tier:

- **Tier 1**: peer-reviewed (arxiv, ssrn, *.edu, jstor), official docs (RFCs, ietf.org, w3.org, language.org), regulatory (sec.gov, ec.europa.eu).
- **Tier 2**: reputable secondary (major news with editorial standards, technical magazines with bylines, books).
- **Tier 3**: general web (mid-tier blogs, Stack Overflow, Reddit text-only).
- **Tier 4**: marketing/SEO/social (vendor blogs touting product, listicle sites, YouTube transcripts).

Skill processes results: `WebFetch` Tier 1 first, Tier 2 if needed, Tier 3 only as supplement, Tier 4 skipped. Tier 4 domains can also be passed as `blocked_domains` to WebSearch directly.

Tier table is a single global file `~/.claude/vault/_global/source-tiers.json` keyed by domain pattern. Not per-project.

### 2.3 D3 — Per-vault sources policy

New file `projects/<slug>/sources-policy.md` curated by vault owner at `/vault-init` time (or later via `/vault-sources`). Lists `allow:`, `prefer:`, `block:` arrays. All `/vault-autoresearch` + `/vault-challenge` runs in this project read it and pass through to WebSearch params.

Example for a quant-trading vault:
```
allow: [ssrn.com, arxiv.org, papers.nber.org, federalreserve.gov, bis.org, jstor.org, *.edu]
prefer: [academic finance journals]
block: [seekingalpha.com, zerohedge.com, twitter.com, medium.com]
```

Updates rare — once per project, edited if a discovered source proves valuable/garbage.

### 2.4 D4 — Forced primary-source pass

Every research round includes 1 mandatory `WebFetch` against a known primary source for the domain, regardless of what WebSearch returned. Specified at `/vault-init` or inferred from project `overview.md`.

For JWT topic: always WebFetch RFC 7519 + relevant IETF drafts. For OAuth: RFC 6749 + 6750. For CRDT: Shapiro 2011 paper. For specific Python lib: official docs URL. Even if WebSearch never surfaces them, they get fetched.

Storage: `projects/<slug>/primary-sources.md` listing 1-5 canonical URLs per topic-cluster.

### 2.5 D5 — Citation cascade detection

While running WebFetch on N "secondary" sources, extract their cited primary sources. Build a citation graph mid-research. If 5 fetched secondaries all cite the same primary X:

- Collapse to 1 vote, not 5.
- Add primary X to the WebFetch list (if not already fetched).
- Flag in synthesis Tensions section: "Apparent consensus traces to single primary [X]; independent corroboration absent."

Pure runtime detection — no curation. Operates on whatever URLs WebSearch returned. Defends against the cascade even when sources superficially diverse.

### 2.6 D6 — Bias-domain blocklist (opt-in)

Pre-built per-domain `blocked_domains` list the user opts into per project. Categories like `marketing-spam`, `crypto-native-media`, `ai-vendor-blogs`, `seo-listicle-farms`. User picks N at `/vault-init` based on project tags.

Lower-resolution version of D3 — blocklist only, opt-in templates instead of full curation.

### 2.7 D7 — Adversarial domain pairing

For each topic, define paired pools: `pro-pool` and `anti-pool` (or `proponent` / `critic`). Round 1 searches pro-pool. Counter-evidence pass searches anti-pool. Forces structural separation of voices.

Crypto example:
- pro-pool: ethereum.org, bitcoin.org, project whitepaper sites
- anti-pool: academic finance critiques (e.g. Harvey, Roubini), regulatory (sec.gov), bank research (BIS reports)

Defends specifically against the "both sides come from the same ecosystem" failure.

---

## 3. Scoring table

Each design scored 1-5 on five axes. **Effectiveness** = how well it defeats citation cascades + hype monocultures. **Cost** = curation burden on the user (5 = zero curation, 1 = heavy ongoing curation). **Feasibility** = fits within current WebSearch/WebFetch tool surface (5 = direct param map, 1 = needs new infra). **Generality** = works across all vault topics (5 = universal, 1 = only specific domains). **Over-filter risk** = inverse — risk of missing legit dissent (5 = low risk, 1 = high risk).

| #  | Design                          | Effectiveness | Cost | Feasibility | Generality | Over-filter risk | Total |
|----|---------------------------------|--------------:|-----:|------------:|-----------:|-----------------:|------:|
| D1 | Domain allowlist by topic tag   | 4             | 2    | 5           | 4          | 2                | 17    |
| D2 | Tier-based weighting (re-rank)  | 4             | 4    | 4           | 5          | 4                | 21    |
| D3 | Per-vault sources policy        | 5             | 2    | 5           | 4          | 3                | 19    |
| D4 | Forced primary-source pass      | 5             | 3    | 5           | 3          | 5                | 21    |
| D5 | Citation cascade detection      | 5             | 5    | 3           | 5          | 5                | 23    |
| D6 | Opt-in bias blocklist           | 3             | 4    | 5           | 4          | 4                | 20    |
| D7 | Adversarial domain pairing      | 5             | 1    | 5           | 2          | 3                | 16    |

### Notes on scoring

- **D1** loses on cost (per-tag pool curation) and over-filter risk (pure allowlist can starve legit dissent in unranked domains).
- **D2** strong on generality + cost (one global tier table) but feasibility-4 because re-ranking happens post-search inside the skill — adds prompt logic, not config.
- **D3** highest curation burden hit but most effective when curated. Risk: vault owner curates once and forgets, list rots.
- **D4** great defense (primary always touched) but topic-specific — needs primary URL per topic-cluster, doesn't scale to vague vaults. Excellent over-filter score because forced primary is ADDITIVE, not restrictive.
- **D5** highest total. Pure runtime detection, zero curation, fully general, additive (never blocks dissent — only flags collapse). Feasibility-3 because needs in-skill graph-building logic across WebFetch results, mid-procedure.
- **D6** mid — easier than D3, weaker than D3 because no per-project allowlist to bias TOWARD good sources, only away from bad.
- **D7** most surgical against monoculture but lowest generality — works for topics with clean pro/anti split (crypto, climate, drug efficacy) — fails for engineering / academic / legal topics where the split is hierarchical, not adversarial.

---

## 4. Recommendation

### 4.1 Best 1-2 from this angle

**Primary: D5 (Citation cascade detection) + D4 (Forced primary-source pass).**

Both are ADDITIVE, not restrictive. They never starve a search of legit dissent — they ADD signal (D4) or ANNOTATE collapse (D5). Combined, they:

1. Force at least 1 primary touch per run (D4) → defeats "all-secondary echo chamber" failure.
2. Detect when secondaries cluster on a single primary (D5) → defeats citation-cascade illusion of consensus.
3. Zero allowlist curation (D5 fully automatic, D4 needs 1-5 URLs per topic-cluster — written once at `/vault-init`).
4. Both compose with the EXISTING round-3 counter-evidence pass (autoresearch L98-102) and challenge skill — they don't replace, they harden.

The over-filtering risk (top concern in problem framing) is structurally near-zero for both: D4 fetches MORE, never blocks; D5 reweights but never excludes.

### 4.2 Why NOT the allowlist designs alone

D1, D3, D6, D7 are all variants of "constrain the search pool." They share three structural problems:

- **Curation rot**: lists go stale. Vault owner curates once, the field moves, sources drift, blocklist misses new spam, allowlist excludes new legit voices.
- **Legitimate dissent lives in non-curated places**: a substantive crypto critique might appear in a Substack the curator never tagged. Allowlist excludes it.
- **Zero default**: until curated, they do nothing. Most vaults will never get curated. D5+D4 work on day 1 with no setup beyond a one-time primary-source list.

D2 (tier weighting) is the strongest of the constraint-based designs and a reasonable DEFAULT layer underneath D5+D4. A small global tier file (Tier 4 = blocked, Tier 1 = preferred) gives baseline hygiene with negligible curation cost, plus the cascade detection on top.

### 4.3 Layered recommendation

Stack: **D2 (cheap default) + D4 (per-project primary touch) + D5 (runtime cascade detection)**.

- D2: ships with vault, blocks Tier 4 marketing/SEO globally via WebSearch `blocked_domains`. Single global file, low maintenance.
- D4: invoked at `/vault-init` — user lists 1-5 canonical primary-source URLs for the project. Forced WebFetch every research run.
- D5: pure mid-skill logic. Add to round-3 counter-evidence pass in autoresearch + step 3 of challenge. Build citation graph from WebFetch'd content, collapse cascades, annotate Tensions section.

D3 (per-vault sources policy) added LATER as opt-in for power users who want full per-project curation. Not default.

### 4.4 Concrete edit sketches (not implementing)

For D2 — autoresearch round 1, line 84:
```
WebSearch(query, blocked_domains: load(_global/source-tiers.json).tier_4)
```

For D4 — autoresearch round 1, after WebSearch:
```
for url in primary_sources_for_topic():
    WebFetch(url, "extract claims relevant to <topic>")
```

For D5 — autoresearch round 3, before writing Tensions section:
```
graph = build_citation_graph(round1_fetched + round2_fetched)
cascades = graph.find_clusters(min_size=3, shared_primary=true)
for cascade in cascades:
    annotate Tensions: "<N> sources collapse to single primary <X> — apparent consensus, independent corroboration absent"
```

`/vault-challenge` step 3 gets the same D5 hook between fetch and classify.

`/vault-ingest` step 3b (contestation check) gains D2 + D5: contestation WebSearch uses tier-blocked pool; if contestation results all cite one primary, flag cascade in the page's `(contested by ...)` annotation.

---

## 5. References

- WebSearch tool schema, accessed 2026-04-23 via ToolSearch — confirms `allowed_domains` + `blocked_domains` array params, US-only, single API call.
- WebFetch tool schema, accessed 2026-04-23 — per-URL only, no domain param.
- `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md` — round 1 WebSearch L84-89, round 3 counter-evidence pass L98-102, round 4 challenge L154-180.
- `/Users/lucafuccaro/.claude/skills/vault-challenge/SKILL.md` — adversarial search per claim, L66-78; fetch top counter-sources, L80-84.
- `/Users/lucafuccaro/.claude/skills/vault-ingest/SKILL.md` — contestation check step 3b, L67.
- Format precedent: `/Users/lucafuccaro/Desktop/CRDP/research/vault-autoresearch-parallel-design.md`, `vault-lint-quality-design.md`.
