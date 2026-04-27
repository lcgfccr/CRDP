# Source Independence Detection for Claude Knowledge Vault

## Problem framing

Vault synthesis pages cite URLs. Citation count looks like rigor. But citation count is not independence. Failure mode:

- 7 secondary sources all trace to 1 primary source (citation chain collapse)
- 5 different domains, same 2 authors (cabal)
- 3 domains, same parent publisher (publisher-overlap masquerading as diversity)
- 8 sources all published within 30 days (hype cluster, temporal consensus, not durable)
- N domains tightly cross-linking (echo chamber)

D2 cite-diversity in `/vault-lint` counts distinct registrable domains. Catches the trivial "7 substack links" case. Misses everything above. Domain count is a necessary-not-sufficient signal for independence.

The synthesis page LOOKS rigorous because the surface metric (citation count) is high. The user trusts it more than they should. Confirmation cascade with cosmetic diversity.

Goal: detect when "multiple" sources collapse to one, and surface dependency as a quality dimension. Quantify, don't just count.

## Design space

### 1. Citation-chain detection (D7-chain)

Per cited URL, fetch the page, extract IT cites. Build a 1-hop graph: secondary citation → primary source. If N secondary sources all hop to the same primary URL (or same registrable domain), flag: "N nominal sources rest on K primary."

- **Detection power**: HIGH for explicit citation chains (academic-style references, journalism with hyperlinks). LOW for sources that don't link out (op-eds, marketing pages). Catches the canonical "7-citations-1-primary" failure.
- **Cost**: 1 extra WebFetch per cited URL. For a page with 8 citations → 8 extra fetches. Doubles round-3 budget. Cacheable per URL across vault.
- **Implementation**: New lint dim D7. Tier-2 only (content-deep). Tier-1 metadata cannot detect this.
- **User-actionability**: HIGH. Output "8 citations → 2 primaries" is concrete. User knows to find independent primaries. Pairs with `/vault-autoresearch round 4 adversarial`.
- **Generality**: Works for any topic where sources link out. Degrades on link-poor sources. Accept partial signal.

False-positive risk: legitimate primary-source convergence (e.g., NIST publishes spec, 8 articles cite NIST — that IS the primary, and convergence is correct). Mitigation: classify primary by domain class (`.gov`, `.edu`, ISO, IETF, primary research) and exempt convergence on those from the flag. Convergence on a single blog/news primary stays flagged.

### 2. Author-overlap detection

Extract author names from citations (frontmatter, byline, meta tags). If N sources share <K distinct authors, flag "cabal warning."

- **Detection power**: MEDIUM. Catches narrow research communities and influencer cabals. Misses anonymous sources, multi-author papers, ghostwritten pieces.
- **Cost**: Author extraction from already-fetched HTML — near-zero marginal. Names are noisy: "John Smith" vs "J. Smith" vs "Smith, J." Need fuzzy match.
- **Implementation**: Tier-2 lint check. Requires HTML/meta parsing already done.
- **User-actionability**: MEDIUM. "These 5 sources are all by the same 2 people" is concrete but not always actionable — sometimes the topic genuinely has only 2 experts.
- **Generality**: Strong on academic/journalistic content. Weak on Wikipedia, reference docs, anonymous tutorials, generated content.

False-positive risk: small expert pools (e.g., niche math topics). Mitigation: scale threshold by topic — high-volume topics (LLM, AI) trigger easily; niche topics (specific theorem) get a higher tolerance. Hard to set automatically; surface as data, let user judge.

### 3. Publisher-overlap detection

Beyond domain. Detect publisher relationships: `forbes.com` and `forbescouncil.com` and `forbes-india.com` are all Forbes. `theverge.com` and `polygon.com` are Vox Media. `inc.com` etc.

- **Detection power**: MEDIUM-HIGH for domains where publisher is known. Catches the most damaging D2 false-negative — domain count of 3 hiding publisher count of 1.
- **Cost**: Requires a publisher → domain mapping. Static lookup table (top ~200 publishers covers 80% of citation surface). No extra fetches if the table is local.
- **Implementation**: Augment D2 cite-diversity. Score on registrable-publisher (when known) instead of registrable-domain. Fall back to domain when publisher unknown.
- **User-actionability**: HIGH. "3 domains, but all Vox Media" → user knows to find a non-Vox source.
- **Generality**: High where the table is populated. Indie blogs / personal sites get treated as their own publisher (correct). Need to maintain the table — it goes stale (M&A). Quarterly refresh.

Bootstrap path: ship a seed table of ~50 known publishers covering common citation patterns (NYT, Vox, Hearst, Condé Nast, Forbes, Atlantic Media, The Information, Substack-as-platform, Medium-as-platform). Users contribute additions.

### 4. Time-clustered source warning

If all cited sources were published in a narrow window (e.g., 30 days), flag "hype-cluster citations." Consensus may be temporal, not fundamental.

- **Detection power**: MEDIUM. Real signal for AI/news/release-driven topics. Catches "everyone wrote about this last Tuesday" pattern. Less meaningful for evergreen topics.
- **Cost**: Near-zero — publication date is in HTML meta or already in cited frontmatter. No extra fetch.
- **Implementation**: New lint dim or weight inside D4 freshness. Compute std-dev of publication dates across citations.
- **User-actionability**: MEDIUM. Surfaces "this topic is hype-driven, find sources from before/after the cluster." Not always feasible (sometimes the topic IS new).
- **Generality**: Useful for HIGH-volatility tags (matches D4 τ=90). Less useful for math/theory.

False-positive risk: legitimately new topic. Mitigation: pair with `created`-page-age. If page was created during the same window, the cluster IS the topic — temper the flag.

### 5. Echo-chamber signal (cross-link density)

For each domain in citations, check if it links to / is linked from other domains in the citation set. Build a citation-graph subgraph restricted to the page's sources. Dense interlinking = echo chamber. Sparse = independent.

- **Detection power**: HIGH in principle. Catches cases where sources cite each other circularly without external grounding.
- **Cost**: HIGH. Per-citation-pair WebFetch verification, OR a backlink API (Ahrefs, Moz — not free). For N citations, up to O(N²) checks. Tractable only with caching across pages.
- **Implementation**: NEW skill or expensive lint dim. Probably too expensive for default lint pass.
- **User-actionability**: MEDIUM. "Citation graph dense" is abstract. Need visualization or specific links to be useful.
- **Generality**: Works anywhere but cost-prohibitive at scale.

Verdict: theoretically best signal, practically too expensive for v1. Defer.

### 6. Independence score per page (composite)

Composite of signals 1–5. Surface as `independence: high|medium|low` frontmatter. Feed back into D2 weight in `/vault-lint --quality`.

- **Detection power**: Inherits from components. Composite avoids over-weighting any single signal.
- **Cost**: Sum of components.
- **Implementation**: Once components exist, composite is trivial. Treats independence as a first-class quality property.
- **User-actionability**: HIGH at the summary level (frontmatter visible everywhere). Drill-down requires component detail.
- **Generality**: Generic.

Risk: composite hides component failures. Always surface weakest component alongside composite, like the existing D1-D6 next-move pattern.

### 7. "Real dissent" detection (cross-class adversarial)

For any topic, run separate WebSearch for "<topic> debunked / criticism / failure / limitations / wrong" and require ≥1 source from a DIFFERENT domain class than the supporting sources. Domain classes: academic (.edu, journals, arXiv), regulatory (.gov, ISO, IETF), independent journalism, vendor/marketing, blog/personal, social/forum.

If supporting sources are all blog-class and dissent is also blog-class → still echo chamber. Require cross-class dissent (academic-vs-blog, regulatory-vs-vendor, etc.). If unable to find cross-class dissent, flag the entire topic as "no genuine adversarial source available."

- **Detection power**: HIGH for the deepest failure mode — confirmation cascade where the disconfirming evidence simply doesn't exist in the sources class searched. Forces searching outside the bubble.
- **Cost**: 1-2 extra WebSearches + 1-2 WebFetches per page. Already partially done in `/vault-autoresearch round 3 mandatory counter-evidence pass` and `/vault-challenge`. Can piggyback.
- **Implementation**: Modify round 3 to require cross-class dissent. Add `dissent-class:` frontmatter. New lint dim D8 or merge with D3 never-challenged.
- **User-actionability**: HIGHEST. If no cross-class dissent exists, the user learns the topic is structurally one-sided in available sources — actionable epistemic state.
- **Generality**: Universal. Every topic has a class structure.

False-positive risk: some topics genuinely have no cross-class dissent (consensus mathematical results). For those, the "no adversarial source available" flag is correct and informative — it tells the user "this is settled," not "we failed."

## Scoring table

| # | Signal | Detection power | Cost | Effort | Actionability | Generality |
|---|---|---|---|---|---|---|
| 1 | Citation-chain | HIGH | MEDIUM (1x WebFetch per cite) | MEDIUM (new D7, tier-2) | HIGH | MEDIUM |
| 2 | Author-overlap | MEDIUM | LOW (parse already-fetched HTML) | MEDIUM (fuzzy match) | MEDIUM | MEDIUM |
| 3 | Publisher-overlap | MEDIUM-HIGH | LOW (static table) | LOW-MEDIUM (seed table + maintain) | HIGH | MEDIUM-HIGH |
| 4 | Time-cluster | MEDIUM | ZERO (date in meta) | LOW | MEDIUM | MEDIUM |
| 5 | Echo-chamber graph | HIGH | HIGH (O(N²) fetches) | HIGH | MEDIUM | LOW (cost-bound) |
| 6 | Composite indep score | inherits | sum-of-parts | LOW once parts exist | HIGH | HIGH |
| 7 | Cross-class dissent | HIGH | LOW-MEDIUM (1-2 searches, piggyback) | LOW (extend round 3) | HIGHEST | HIGH |

## Recommendation

**Best 1-2 from this angle: #7 cross-class dissent and #3 publisher-overlap.**

#7 cross-class dissent — highest leverage. Already half-built into `/vault-autoresearch round 3` and `/vault-challenge`. The change is small but the epistemic gain is large: instead of "we found counter-evidence," the system reports WHICH CLASS of source the counter-evidence came from. If the answer is "same class as supporting evidence," the user learns the topic is in a bubble. If "no cross-class dissent at all," the user learns the topic may be settled OR may be a one-sided narrative — the user decides which. Forces the question that the current pipeline silently skips.

Implementation:
- Domain-class taxonomy (~6 classes, simple suffix + allowlist rules).
- Round-3 counter-evidence pass extended: classify supporting sources, target dissent search at OTHER classes explicitly.
- `dissent-class:` frontmatter recording which class(es) of dissent were found.
- Lint dim D7 (or fold into D3): score = 1.0 if cross-class dissent present, 0.5 if same-class dissent only, 0.0 if no dissent surfaced. Independent of whether dissent succeeded in weakening the claim — measures search adequacy, not outcome.

#3 publisher-overlap — lowest cost, immediate D2 upgrade. Fixes the largest false-negative in current cite-diversity. Static table is bounded work (~50 publishers covers most patterns). No new fetches, no new searches. Pure metadata enrichment of existing D2.

Implementation:
- Ship `~/.claude/skills/vault-lint/publishers.json`: { domain → publisher }.
- D2 computes distinct publishers (when known) instead of distinct domains. Falls back to domain for unknown publishers.
- One-time effort. Quarterly maintenance for M&A.

Honorable mention: **#1 citation-chain detection** is conceptually the most direct attack on the problem and I would prioritize it as #3 once #7 and #3-publisher are in. The cost (extra WebFetch per cite) is the main blocker — but cacheable per URL, and the cache compounds across vault pages.

Skip for v1: #5 (cost-prohibitive), #2 (noisy without good NER), #4 (low marginal value), #6 (premature without components).

## References

- `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md` — round 3 mandatory counter-evidence pass; round 4 adversarial challenge; cited-claims rule
- `/Users/lucafuccaro/.claude/skills/vault-lint/SKILL.md` — D2 cite-diversity (registrable-domain count, current limitation); six-dimension composite; tier-1/tier-2 scan model; quality_profile system for re-weighting
- `/Users/lucafuccaro/.claude/skills/vault-challenge/SKILL.md` — adversarial falsification skill; HELD UP / WEAKENED / UNFALSIFIED bucketing (referenced but not read for this research; aligned with #7 framing)
