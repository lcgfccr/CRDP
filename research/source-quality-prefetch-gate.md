# Pre-Fetch URL Gate: Source Quality via Reasoning Step

## Problem framing

Round 1 of `/vault-autoresearch` runs `WebSearch <topic>` and gets back ~5-10 URLs. Current procedure (line 87 of `SKILL.md`): "For each top result, `WebFetch` and extract key claims + source." That "for each top result" hides the actual choice — Claude implicitly picks 5-7 URLs from the ~10 based on title/snippet relevance, but there is no explicit quality assessment. Marketing pages, SEO listicles, and clickbait can survive the implicit filter and pollute the synthesis pool.

A pre-fetch URL gate inserts an explicit reasoning step BEFORE WebFetch fires. Claude scores each candidate URL against quality criteria from the signals already visible in WebSearch results (URL, title, snippet, sometimes date, rank). Low-signal sources get dropped or down-ranked. Zero extra WebFetches — the gate only redirects the existing fetch budget toward better URLs.

This is a complement to allowlist/denylist gating (`source-quality-allowlist.md`) and independence checking (`source-quality-independence.md`). Allowlist gates by domain. Independence gates by mutual citation patterns. This gates by per-URL surface signals.

## Pre-fetch signals available

What WebSearch hands Claude, per result:
- **URL** — full URL string. Domain, subdomain, path components, file extension, query params.
- **Title** — page title as scraped or as the search engine generated it.
- **Snippet** — 1-3 sentence excerpt (sometimes the meta description, sometimes auto-extracted).
- **Date** — publication date, when the search engine surfaces it. Often missing.
- **Rank** — position in the result list. Some signal of search-engine relevance, but the engine ranks for click-through, not truth.

Claude's reasoning capacity, pre-fetch:
- Pattern recognition on URL/title/snippet text.
- Domain class inference from URL alone.
- Topic-specific recency expectations (Claude already knows OAuth2 PKCE evolves slowly; LLM benchmarks evolve weekly).

What is NOT visible pre-fetch: page body, citations, author credentials, primary-source status. Those need WebFetch.

## Dimension / Signal / Score rubric

Five dimensions, each scored 0-2. Total 0-10. Thresholds at the end.

### D1. Domain class

| Signal | Score | Examples |
|--------|-------|----------|
| Academic, standards body, regulatory, primary research | 2 | `.edu`, `arxiv.org`, `ietf.org`, `nist.gov`, `who.int`, `acm.org`, `nature.com`, `nejm.org` |
| Reputable journalism, established practitioner blog, recognized vendor docs | 1 | `nytimes.com`, `bbc.com`, `reuters.com`, `engineering.fb.com`, `aws.amazon.com/blogs/`, `martinfowler.com`, `lwn.net` |
| Marketing, SEO content farm, social media, anonymous blog | 0 | `*-guide.io`, `top10*.com`, `medium.com/@randomuser`, `linkedin.com/pulse/`, content-marketing subdomains of vendors (`blog.somevendor.com/why-you-need-X`) |

Inference rule: if the domain is unfamiliar, infer from URL pattern. `/blog/`, `/learn/`, `/resources/` on a vendor site = marketing tier (0-1). `/research/`, `/papers/`, `/whitepapers/` = primary tier (1-2). PDFs hosted on `.edu` or standards-body domains = strong primary signal (2).

### D2. URL path pattern

| Signal | Score | Examples |
|--------|-------|----------|
| Primary-document path: `/papers/`, `/research/`, `/rfc/`, `/standards/`, `.pdf`, `/docs/<version>/` | 2 | `arxiv.org/abs/2310.12345`, `tools.ietf.org/html/rfc7519` |
| Neutral path: `/article/`, `/post/`, `/news/`, dated paths like `/2025/04/` | 1 | `nytimes.com/2025/03/15/tech/...` |
| SEO red-flag path: `/ultimate-guide/`, `/top-10-`, `/best-X-for-Y/`, `/sponsored/`, `/partner-content/`, query strings with `utm_campaign=` | 0 | `somesite.com/ultimate-guide-to-X`, `vendorblog.com/top-10-Y-tools` |

### D3. Title pattern

| Signal | Score | Examples |
|--------|-------|----------|
| Technical, specific, citable: contains spec/RFC numbers, section refs, version numbers, technical terms | 2 | "RFC 7519: JSON Web Token (JWT)", "Section 4.2 of the OAuth 2.0 Threat Model", "PKCE for OAuth 2.0 (RFC 7636)" |
| Descriptive, neutral: states what the page is about without hype | 1 | "How OAuth 2.0 PKCE flow works", "PKCE explained" |
| Clickbait, hype, or vague: "X tricks", "you won't believe", "the only guide you need", "complete guide", "everything about X" | 0 | "10 OAuth tricks every dev should know", "The ultimate PKCE guide", "Why you NEED PKCE in 2026" |

### D4. Snippet quality

| Signal | Score | Examples |
|--------|-------|----------|
| Concrete: specific facts, numbers, version refs, quotes from primary text | 2 | "PKCE adds two parameters: `code_verifier` (43-128 chars) and `code_challenge` (S256 hash). Defined in RFC 7636 Section 4." |
| Mixed: some substance, some filler | 1 | "PKCE is an extension to OAuth 2.0 that adds security for public clients. It works by..." |
| Generic: filler verbs ("learn more", "discover", "explore"), buzzwords, no facts | 0 | "Discover the power of PKCE in our comprehensive guide. Learn everything you need to know about modern auth." |

### D5. Recency vs topic volatility

Claude judges topic volatility from prior knowledge:
- **High volatility** (LLM benchmarks, vulnerability disclosures, frontier ML, JS framework state): need recent (≤ 12 months).
- **Medium volatility** (cloud architecture patterns, language ecosystem, regulatory guidance): ≤ 36 months acceptable.
- **Low volatility** (foundational CS, mature protocols like TCP/HTTP/OAuth2 core, pure math): age irrelevant.

| Signal | Score |
|--------|-------|
| Date matches topic volatility need (or topic is low-volatility and date missing/old) | 2 |
| Date stale by one volatility tier (e.g., medium-volatility topic with 5-yr-old source) | 1 |
| Date stale by two or more tiers (e.g., LLM benchmark from 2021) OR date missing on high-volatility topic | 0 |

## Aggregation and thresholds

Composite score = sum(D1..D5), range 0-10.

Tier mapping:
- **Tier A (8-10)**: Fetch, prioritize. Primary or strong secondary.
- **Tier B (5-7)**: Fetch if budget allows, after Tier A.
- **Tier C (3-4)**: Skip unless desperate (i.e., <3 candidates passed total). Annotate as low-confidence if used.
- **Tier D (0-2)**: Hard reject. Never fetch. Surface in raw notes as "rejected: <url> for <reason>".

Hard-reject veto rules (immediate Tier D regardless of total):
- D1 = 0 AND D3 = 0 (marketing domain + clickbait title): pure SEO output, fetching wastes budget.
- URL contains `/sponsored/` or `/partner-content/` path component: paid placement, near-zero independent signal.
- Title is a question that the snippet does not answer ("Is X better than Y?" with snippet "Find out in this article...") and D4 = 0: classic content-farm pattern.

## Behavior on rejection

Surface the rejection in the round-1 raw notes. Add a section:

```markdown
## Pre-fetch URL gate

Evaluated N URLs from WebSearch. Fetched M, rejected K.

### Fetched (Tier A/B)
- [Tier A, 9/10] <url> — <1-line reason>
- [Tier B, 6/10] <url> — <1-line reason>

### Rejected (Tier C/D)
- [Tier D, 1/10] <url> — D1=0 marketing domain, D3=0 clickbait title
- [Tier C, 4/10] <url> — D5=0 outdated for high-volatility topic
```

This gives the user transparency: they see what was filtered and why. If they disagree, they can `/vault-ingest <url>` directly to force inclusion.

## Fallback when too many rejections

Trigger: <3 URLs pass at Tier A or B.

Fallback ladder:
1. **Lower threshold**: include Tier C URLs, mark them as low-confidence in raw notes. Fetch but cite cautiously.
2. **Re-search with different query**: original WebSearch produced bad results. Reformulate (more specific terms, add domain hints like `site:edu`, `site:arxiv.org`, `filetype:pdf`).
3. **Surface the gap**: tell the user "round-1 search returned mostly low-signal sources for `<topic>`. Recommended: refine the query or accept low-confidence pass." Don't silently produce bad synthesis.

Cap: max 1 re-search per round to prevent runaway fetch loops.

## Cost of the reasoning step

Per WebSearch result: ~50-150 tokens of Claude reasoning to apply the rubric (signals are short, rubric is mechanical). For 10 URLs, ~500-1500 tokens of evaluation. Compared to the cost of a single WebFetch (which can pull 5-10k tokens of page body), the gate is cheap — under 10% of one fetch's cost, and it cuts wasted fetches.

The rubric should be embedded in the skill so the agent doesn't reason from scratch each time. Each invocation just walks down the table and assigns scores.

## Design space scoring

| Design | Quality lift | False rejection risk | Token cost | Impl effort | Transparency |
|--------|-------------|---------------------|-----------|-------------|--------------|
| **A. Hard reject below threshold** | High — drops trash entirely. | Medium — non-mainstream dissent on small blogs gets cut. | Low (rubric run once per result). | Low (rubric in skill, ~30 lines). | High if rejections logged. |
| **B. Soft re-rank, fetch in score order** | Medium — same fetch count, better selection. Marginal gain if budget covers most URLs anyway. | Low — nothing rejected outright. | Same as A. | Low. | Medium — order matters but no rejections to surface. |
| **C. Tiered fetch (forced diversity)** | High but can dilute — forcing 1 academic + 2 secondary + 1 blog might pull weaker sources just to fill quota. | Low. | Same as A. | Medium (categorization logic per topic). | Medium. |
| **D. Hybrid: hard reject Tier D + soft re-rank rest** | Highest — combines noise floor cut with budget optimization. | Low (Tier D is unambiguously bad). | Same as A. | Low-medium. | High — Tier D rejections logged, rest is just ordering. |

**Winner: D (Hybrid).** Hard reject only the obvious trash (Tier D, with veto rules). Soft re-rank (fetch in score order) for everything Tier C and above. This kills the false-rejection-of-dissent risk because the threshold is set deliberately low for hard rejection — a non-mainstream blog would still be Tier C (D1=0, but D3 and D4 might be 2 if the writer is technical), so it survives.

## Worked example

Hypothetical WebSearch results for topic `OAuth2 PKCE flow in mobile apps`:

| # | URL | Title | Snippet (truncated) | Date |
|---|-----|-------|---------------------|------|
| 1 | `tools.ietf.org/html/rfc7636` | "RFC 7636: Proof Key for Code Exchange by OAuth Public Clients" | "This document describes an extension to the OAuth 2.0 protocol... Section 4.1 specifies the code_verifier..." | 2015 |
| 2 | `oauth.net/2/pkce/` | "PKCE — OAuth 2.0" | "PKCE (RFC 7636) is an extension to the Authorization Code flow to prevent CSRF and authorization code injection attacks. Spec: client generates a code_verifier..." | undated |
| 3 | `auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce` | "Authorization Code Flow with PKCE" | "When public clients (e.g., native and single-page apps) request access tokens, certain attacks are possible..." | 2024 |
| 4 | `medium.com/@somedev/oauth-pkce-the-complete-guide-2026-edition-7d3f` | "OAuth PKCE: The Complete Guide (2026 Edition) — 10 Tricks Every Mobile Dev Should Know" | "Discover everything you need to know about PKCE in 2026. Learn the 10 tricks that will transform your mobile auth..." | 2026 |
| 5 | `somesite.com/sponsored/why-you-need-pkce-now` | "Why You NEED PKCE Now (Sponsored)" | "Find out why every mobile dev is switching to PKCE. Read our comprehensive guide..." | 2025 |

Scoring:

| # | D1 | D2 | D3 | D4 | D5 | Total | Tier | Decision |
|---|----|----|----|----|----|-------|------|----------|
| 1 | 2 (standards) | 2 (`/rfc/`) | 2 (RFC number) | 2 (cites Section 4.1) | 2 (low-volatility topic, age fine) | **10** | A | Fetch |
| 2 | 1 (recognized practitioner) | 1 (neutral) | 1 (descriptive) | 2 (concrete: cites RFC, names mechanism) | 2 (low-vol) | **7** | B | Fetch |
| 3 | 1 (vendor docs, reputable) | 1 (`/docs/`) | 1 (descriptive) | 1 (mixed: starts concrete, no specifics yet) | 2 (recent, low-vol) | **6** | B | Fetch |
| 4 | 0 (medium.com user blog) | 0 (`/oauth-pkce-the-complete-guide-2026-edition-`) | 0 ("Complete Guide", "10 Tricks") | 0 ("Discover everything", "transform") | 2 | **2** | D | **Hard reject** (D1=0 + D3=0 veto) |
| 5 | 0 (sponsored content) | 0 (`/sponsored/`) | 0 ("Why You NEED") | 0 ("Find out", "comprehensive guide") | 2 | **2** | D | **Hard reject** (sponsored path veto) |

Outcome: 3 fetches (RFC, oauth.net, Auth0 docs), 2 rejections logged. Synthesis built from primary spec + reputable secondary. Round 1 raw notes carry the rejection list so the user can audit.

Without the gate, current behavior would likely fetch 5-7 of these, including the medium clickbait and possibly the sponsored page (the LLM has no explicit incentive to skip). The gate cuts 2 polluting sources at zero extra fetch cost.

## Recommendation

**Implement Design D (Hybrid) with the 5-dimension rubric above.**

Concrete implementation:
1. Insert a new section in `vault-autoresearch/SKILL.md` Round 1 before step 2 ("For each top result, WebFetch..."): "**Step 1b — Pre-fetch URL gate.** Apply the 5-dimension rubric (see Appendix). Hard-reject Tier D. Fetch Tier A/B in score order until budget hit. Log rejections in raw notes."
2. Add Appendix to the skill: copy the rubric tables verbatim. Keep them tight — the agent should read and apply mechanically, not reason from scratch.
3. Mirror in `vault-ingest/SKILL.md` step 3 (already has a soft warning for low-value sources — formalize with the rubric).
4. Mirror in `vault-challenge/SKILL.md` step 3 (counter-source fetching also benefits from the gate; counter-evidence should be from credible sources, not random blogs).
5. Apply fallback ladder if <3 Tier A/B URLs pass.
6. Surface rejections in raw notes for transparency.

Rationale for hybrid over pure hard-reject: pure hard-reject is too aggressive. A small-blog post by a known security researcher might score D1=0 but D3=2 and D4=2 — total 5-6, Tier B. Cutting it would lose legitimate dissent. The hybrid approach only kills clear-cut trash via the veto rules, then re-ranks everything else.

Rationale for hybrid over forced-diversity (C): forcing 1 academic + 2 secondary + 1 blog risks fetching weak slots when the topic genuinely has 4 strong primary sources and 0 good blogs (e.g., a niche RFC). Better to let the rubric pick on merit.

The rubric is the implementation. Once embedded in the three skills, the gate runs automatically every WebSearch round.

## Open questions

- Should the rubric scores be stored in page frontmatter for later quality audits? E.g., `sources_avg_score: 7.4` so `/vault-lint --quality` can flag pages built from low-tier sources. Probably yes — minimal cost, useful signal.
- Should the rubric be tunable per-project? E.g., a security project demands stricter D1 thresholds. Defer until usage data justifies the complexity — start with one universal rubric.
- Should `--challenge` mode loosen the rubric to include more dissenting voices (which often live on smaller blogs)? Possibly: in challenge mode, drop the D1=0 + D3=0 veto, since adversarial dissent often comes from outside mainstream channels. Keep `/sponsored/` veto regardless.
