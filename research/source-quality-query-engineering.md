# Source quality via query engineering

Angle: bias WebSearch toward authoritative sources by query design — cheapest lever before fetch/synthesis.

## Problem framing

The Vault's three search-driven skills all hit WebSearch with naive default queries:

- **vault-autoresearch round 1** (`SKILL.md:87`): `WebSearch the topic. Pull ~5-10 distinct URLs.` Topic string passed verbatim.
- **vault-autoresearch round 3 counter-evidence** (`SKILL.md:102`): `"<claim> limitations"`, `"<claim> failure cases"`, `"against <claim>"`, `"<claim> does not"`. Reasonable adversarial shape but no authority bias.
- **vault-challenge step 2** (`SKILL.md:68-75`): same negation patterns plus `"<claim>" criticism`, `against "<claim>"`, `"<claim>" counterexample`, `"<claim>" does not work when`.
- **vault-ingest contestation check** (`SKILL.md:67`): `"<central claim> contested"`, `"<central claim> debunked"`, `"critique of <author/claim>"`, `"<claim> failure cases"`.

For technical topics (RFCs, specs) the default surfaces vendor blogs (Auth0, Okta, Curity, Supabase) before primary sources. For hyped topics (agentic AI, LLM agents, crypto) it surfaces marketing content (HBR, Gartner, ARIS, beam.ai) and a handful of legitimate critique pieces — the ratio is hostile.

The query layer is upstream of fetch and synthesis. Cheap to fix; high leverage.

## Operator research findings

Probed Google-backed WebSearch with several operator forms. Results from probes (April 2026):

| Operator | Probe | Result | Verdict |
|---|---|---|---|
| `site:ietf.org JWT signing key rotation` | single-domain | 10 IETF results, all primary | RELIABLE |
| `site:nist.gov OR site:ietf.org OR site:rfc-editor.org` | OR-composite | 10 IETF + RFC Editor results | RELIABLE (Google honors `OR`) |
| `JWT signing key rotation -tutorial -guide -beginner` | exclusion | vendor blogs still dominate but tutorial-titled pages dropped | PARTIAL (works, but vendor blogs sidestep it) |
| `filetype:pdf JWT key rotation cadence` | filetype | 2 PDFs surfaced (limited corpus) | RELIABLE but narrow — only useful when authoritative content is PDF |
| `intitle:"specification" agentic AI architecture` | intitle | 0 results | UNRELIABLE (over-restrictive or unsupported on this WebSearch backend) |
| `"agentic AI" criticism failure cases inurl:edu` | inurl | 0 results — backend ignored or filtered | UNRELIABLE on this backend |
| Quoted phrase `"<exact phrase>"` | quoting | works (used implicitly in challenge queries already) | RELIABLE |

Working set for query templates: **`site:`, `site:A OR site:B`, quoted phrases, `-exclusion`, `filetype:pdf`**. Avoid `intitle:` and `inurl:` — silent failures.

Bonus: WebSearch tool itself accepts `allowed_domains` / `blocked_domains` parameters (per its schema). Equivalent to `site:` but applied at tool level, no operator parsing risk. Probably more reliable than `site:` for hard pinning. Worth using when topic class strongly maps to known authoritative domains.

## Topic-class authority phrase table (concrete)

Map topic class → site allowlist + phrase boosters. Topic class detected from frontmatter `tags:` or heuristic on topic string.

| Class | Detection trigger | Site allowlist (top 3-6) | Phrase boosters | Filetype hint |
|---|---|---|---|---|
| `security/standards` | tags include `security`, `auth`, `crypto`, `protocol`; topic mentions JWT/OAuth/TLS/PKCE/RFC | `ietf.org`, `rfc-editor.org`, `nist.gov`, `csrc.nist.gov`, `owasp.org`, `cve.mitre.org` | `RFC`, `specification`, `security considerations`, `normative` | `pdf` for NIST SPs |
| `academic/research` | tags include `research`, `paper`, `study`; topic mentions algorithm names, "X et al" | `arxiv.org`, `acm.org`, `ieee.org`, `springer.com`, `nature.com`, `science.org`, `*.edu` | `peer-reviewed`, `preprint`, `proceedings`, `doi:`, `abstract` | `pdf` |
| `regulatory/compliance` | tags include `regulation`, `gdpr`, `hipaa`, `compliance`, `policy` | `eur-lex.europa.eu`, `gov.uk`, `ftc.gov`, `sec.gov`, `iso.org`, `nist.gov` | `official guidance`, `final rule`, `statutory`, `directive`, `recital` | `pdf` |
| `medical/clinical` | tags include `medical`, `clinical`, `pharma`, `disease names` | `pubmed.ncbi.nlm.nih.gov`, `cochrane.org`, `who.int`, `cdc.gov`, `nejm.org`, `bmj.com` | `systematic review`, `meta-analysis`, `clinical trial`, `RCT` | (none) |
| `engineering/practitioner` | tags include `infrastructure`, `database`, `distributed`, `kubernetes` | `<canonical-project-domain>` (e.g. `kubernetes.io`, `postgresql.org`), `usenix.org`, `acm.org`, `engineering.<bigco>.com` | `postmortem`, `design doc`, `RFC` (internal sense), `production` | (none) |
| `economics/finance` | tags include `economics`, `monetary`, `markets`, `macro` | `nber.org`, `imf.org`, `bis.org`, `federalreserve.gov`, `ssrn.com`, `*.edu` | `working paper`, `empirical`, `econometric`, `dataset` | `pdf` |
| `hyped/emerging` | tags include `agentic`, `ai`, `crypto`, `web3`, `quantum`, OR no other class matches AND results are SEO-skewed | (no allowlist — diversity needed) blocklist instead: `medium.com`, `linkedin.com/pulse`, `gartner.com`, `forbes.com/sites`, vendor blogs | `arxiv`, `paper`, `benchmark`, `evaluation`, `empirical` — plus standard adversarial phrases from challenge skill | `pdf` |
| `default/unknown` | nothing matches | (no allowlist) | (none) | (none) |

Detection heuristic: look at `tags:` first (frontmatter set during ingest/research); fallback to keyword regex on topic string (e.g. `/JWT|OAuth|OIDC|PKCE|RFC ?\d+|TLS|JWS|JWE/` → security). When ambiguous, default to `default/unknown` (no operators applied — current behavior).

## Design space

### A. Static authority-leaning template (topic-class-aware)

For matched class, inject `site:A OR site:B OR site:C` plus 1 phrase booster into the round-1 query.

Round 1 query for topic `JWT signing key rotation cadence` with class `security/standards`:
```
JWT signing key rotation cadence (site:ietf.org OR site:rfc-editor.org OR site:nist.gov) RFC
```

Pros: zero extra WebSearch cost. Drop-in edit to `vault-autoresearch round 1`. Effective on technical topics where authority is clearly mapped.

Cons: misses non-allowlisted gold (e.g. a great Cloudflare engineering blog on JWT). Can return zero results for niche topics — needs fallback. Useless for hyped topics (no allowlist).

### B. Dual-query with merge

Run TWO WebSearch calls in parallel: (1) bare topic, (2) authority-biased variant. Dedupe URL set. Prefer authority-domain URLs in fetch order; backfill with general until N=5 fetched.

Pros: no false negatives — general query catches what allowlist misses. Authority sources still get prioritized at fetch time. Robust.

Cons: 2x WebSearch cost in round 1. Implementation: parallel call, dedupe by URL host, sort fetch order by `is_authority_domain(host)`.

### C. Dynamic refinement

Round 1 query is bare. After WebSearch, inspect result hosts. If >60% are SEO-skewed (heuristic: hosts in blocklist set, or marketing-typical TLDs/paths like `/blog/`, `/insights/`, `/why-X-matters/`), reformulate with authority operators and re-search.

Pros: adapts to topic. No extra cost on technical topics where bare query already finds primary sources. Catches the hyped case automatically.

Cons: detection heuristic is fuzzy and could misclassify. Adds latency (sequential re-search). Implementation in 3 skill files is heavier — needs heuristic logic per skill.

### D. Multi-perspective parallel (3 queries)

Round 1 fans out to 3 parallel WebSearch calls: (1) general, (2) authority-biased, (3) adversarial (`<topic> limitations OR criticism`). Each returns ~3-5 URLs. Fetch top 1-2 from each — guarantees coverage of consensus + authority + dissent.

Pros: best coverage. Bakes in counter-evidence at round 1 instead of waiting for round 3. Mirrors how `vault-landscape` already fans out.

Cons: 3x WebSearch cost in round 1. Some redundancy (general + authority will overlap). Bigger procedure rewrite.

## Scoring

Effectiveness on hyped topics (e.g. agentic AI):
- A: WEAK — no allowlist for hyped class. Phrase booster `arxiv` helps a bit. Blocklist (Medium/Forbes/Gartner) is the real lever for hyped class.
- B: GOOD — general catches the popular discourse, authority/blocklist catches the empirical work.
- C: GOOD — exactly the case where dynamic refinement shines (detect SEO skew → rewrite).
- D: BEST — adversarial slot is what hyped topics need most.

Effectiveness on technical topics (e.g. JWT, RFCs):
- A: BEST — site:ietf.org goes straight to the source. Probe confirmed.
- B: GOOD — same authority pull plus general safety net.
- C: GOOD — bare query already finds primary sources for clean technical topics; refinement rarely triggers.
- D: GOOD — overkill but works.

Cost (WebSearch calls in round 1):
- A: 1 (no change from baseline). Best.
- B: 2.
- C: 1 most of the time, 2 when refinement triggers. Average ~1.3.
- D: 3.

Implementation effort (edits across `vault-autoresearch`, `vault-challenge`, `vault-ingest`):
- A: LOW — add topic-class detection + lookup table + query template. ~30 lines per skill.
- B: MEDIUM — parallel call + merge + sort logic. ~50 lines per skill.
- C: MEDIUM-HIGH — heuristic SEO detection on result set. ~70 lines per skill, plus heuristic tuning.
- D: HIGH — fans out to 3 calls, each with own prompt; merge logic. ~80 lines per skill.

Risk of MISSING legitimate dissent on non-authority sources (Substack, Twitter threads, individual blogs):
- A: HIGH — strict allowlist drops everything else. Substack post calling out an RFC's flaw never surfaces.
- B: LOW — general query catches it.
- C: LOW — bare query first, only refines if SEO-skewed. Substack rarely triggers SEO heuristic.
- D: LOW-MEDIUM — adversarial slot may catch it but uses same authority lean elsewhere.

## Recommendation: B + light A (combined approach)

**Best 1-2 from this angle: dual-query merge (B) plus topic-class authority HINT (A-lite).**

Specifically:

1. **Topic-class detection + hint table** (A-lite): keep the table in this doc as a Vault config file — `~/.claude/vault/config/authority-hints.yaml`. Each skill loads it at procedure start. Detection from `tags:` in frontmatter (preferred — already populated by ingest) OR keyword regex fallback (security/JWT/OAuth/TLS, academic/arxiv/paper, regulatory/GDPR/etc.).

2. **Dual-query merge in round 1** (B): for matched topic class, run two WebSearches in parallel:
   - Q1: bare topic (current behavior — preserves dissent surfacing)
   - Q2: bare topic + ` (site:A OR site:B OR site:C)` from class allowlist
   - Dedupe by URL host. Sort fetch order: authority-domain hits first, then general. Cap fetch budget unchanged.
   - For `hyped/emerging` and `default/unknown` classes: skip Q2 — fall back to single-query baseline (saves cost when authority list doesn't apply).

3. **Counter-evidence queries (round 3 / vault-challenge / vault-ingest contestation)**: keep current adversarial phrases — they work. Add ONE site-hint variant per class: e.g. for security class, run one extra query `<claim> CVE OR vulnerability site:cve.mitre.org OR site:nvd.nist.gov`. For academic, `<claim> "limitations" site:arxiv.org`. Single extra query, big payoff for primary-source dissent.

Why this combo:
- Cheap (only +1 WebSearch in round 1, only when allowlist applies — bypassed for hyped/unknown).
- Preserves dissent paths via the parallel general query.
- Drop-in edits to existing procedures — no major rewrite.
- The authority-hints config is one file, edited centrally; all three skills consume it.
- Hyped-topic coverage handled by the BLOCKLIST mechanism using `WebSearch.blocked_domains` parameter (medium.com, linkedin.com/pulse, forbes.com/sites, gartner.com) rather than allowlist — push noise out instead of pulling authority in.

Concrete next step (research only, not implementing): write the `authority-hints.yaml` schema and the topic-class detection regex set as a follow-up artifact. Probe a few more topic classes (medical, regulatory) to confirm `site:` composite works on those domains too.

## Notes on what NOT to do

- Don't use `intitle:` or `inurl:` operators — probes returned 0 results, silent failure mode.
- Don't strip the bare general query — it catches Substack/blog dissent the allowlist misses.
- Don't apply allowlist to `vault-challenge` adversarial queries unless paired with general — challenge needs to find counterexamples wherever they live, including non-authoritative.
- Don't auto-block `medium.com` globally — some Medium posts are the primary source (engineer postmortem on their own incident). Block only when class is `hyped/emerging` AND general query already returned 5+ results.
