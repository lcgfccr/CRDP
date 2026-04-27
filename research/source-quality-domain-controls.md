# Source Quality via WebSearch Domain Controls

Research date: 2026-04-23
Scope: design global blocklist + tag-routed allowlist + escalation for vault-* skills.
Status: research only, no implementation.

## 1. Problem framing

Claude Code's `WebSearch` tool exposes two first-class array params: `allowed_domains` and `blocked_domains`. The vault skills (`vault-autoresearch`, `vault-challenge`, `vault-ingest`) currently pass NEITHER. Every WebSearch fires against the unfiltered open web, so source quality rests entirely on the model's free-form ranking and the user's hope that the first 5-10 hits are not SEO sludge, content farms, or hallucinated AI re-syntheses.

This is the largest unused lever for source quality:
- **Free** — no extra LLM calls, no infra, just structured args at call sites.
- **Pre-context** — filtering happens before results enter the token window, so token spend drops too.
- **Composable** — different skills + different tags can pass different lists.
- **Reversible** — bad list, just stop passing it.

The unused state means the vault is paying full LLM-verification cost for results that include Pinterest pin pages, Quora answers from 2014, and AI-generated marketing summaries the contestation check then has to filter out one source at a time.

The angle of this doc: **DOMAIN CONTROLS** specifically — what should be in the blocklist, how do tag → allowlist mappings look, what's the escalation when an allowlist runs thin, and which combination strategy wins given how the API actually behaves.

## 2. WebSearch param behavior research

Verified against `https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/server-tools` and the inline schema returned by `ToolSearch`.

Confirmed facts (load-bearing for design):

- **Mutual exclusivity.** "You can use either `allowed_domains` or `blocked_domains`, but **not both in the same request**." This kills the design space option of combining the two in one call. Combination only happens by separate calls or by org-level config layered with request-level config.
- **Subdomains auto-included.** `example.com` covers `docs.example.com`, `api.example.com`, etc. So an entry of `mit.edu` sweeps in every `*.mit.edu` automatically.
- **Specific subdomain restricts.** `docs.example.com` matches ONLY that subdomain, not `example.com` or `api.example.com`. So domain entry granularity is a real choice — be too specific and miss valid sub-trees.
- **Subpaths supported.** `example.com/blog` matches `example.com/blog/post-1`. Useful for surgical inclusion (e.g. `medium.com/some-quality-publication` rather than all of Medium).
- **Wildcard limits.** Only one `*` per entry, must be after the domain part. So `example.com/*` is valid, `*.example.com` is NOT. (Subdomains are auto-included anyway, so the `*.example.com` use case is already covered by writing just `example.com`.)
- **No HTTP scheme.** Use `example.com`, not `https://example.com`.
- **Org-level layer.** Console-level domain settings can constrain request-level. Request-level can further restrict but not expand. Conflicts → validation error. Vault skills run on user's own account so this is a non-issue today but worth noting in any team rollout doc.
- **Unicode homograph risk.** Cyrillic 'а' vs Latin 'a' attacks documented. Not a research-vault threat in practice but lists must be ASCII-only.

Open question NOT answered by docs (must be inferred):

- **What happens when `allowed_domains` returns 0 results?** Docs do not say. From the response schema (`web_search_tool_result` with empty content + no error code for "no results in allowlist") the inference is: it returns an empty result set, no fallback to general web, no error. The model then reads "0 results" in the tool result and decides what to do next.
- **Does `blocked_domains` influence ranking or just filter?** Docs phrase it as "Never include results from these domains" — language matches a post-rank filter, not a rank-time penalty. So a blocklist that knocks out 5 of the top 10 results does NOT cause the next 10 to be re-ranked; you get 5 results from the original top 10. This means: if the blocklist is too aggressive on a topic where the genuine top hits cluster in blocked domains, the remaining hits may be lower quality than what would have surfaced from a re-ranked search.
- **Cost / billing?** Each search counts as one use regardless of result count. So an empty allowlist response still spends a search slot. Implication: unlimited retries on thinness are wasteful — escalation logic must cap.

Two implications for design:
1. **Cannot pass both lists in one call.** A "blocklist + allowlist together" design requires two separate WebSearch calls and merging — doable but doubles search budget. Probably not worth it.
2. **Allowlist that returns thin = silent empty.** Escalation logic must inspect the result count and decide whether to retry without the allowlist, with a different allowlist, or just proceed. Caller has to handle this — the tool will not.

## 3. Proposed global blocklist

These are the candidates for the **default blocklist** the vault skills pass on every WebSearch call when running in "blocklist mode" (design B/D below). Categorized with rationale per domain. Target size ~40, deliberately under the upper bound of 50 to leave headroom for additions without bloat.

### Category A: SEO content farms / AI-rewrite mills

Sites that rank well but rarely provide primary content — they re-summarize others.

| Domain | Rationale |
|---|---|
| `pinterest.com` | Image-only board page, never a primary source. Often top-3 for visual queries. |
| `quora.com` | Answer quality is very uneven. Old answers stay top-ranked. Cannot be domain-tagged easily. |
| `answers.com` | Aggregator/spam, not a primary source. |
| `ehow.com` | Generic how-to, often outdated, ad-heavy. |
| `wikihow.com` | Same — generalist, never authoritative for technical work. |
| `chegg.com` | Paywalled homework answers — not citable, often wrong. |
| `coursehero.com` | Same as Chegg. |
| `studocu.com` | Aggregator of leaked student notes, no editorial control. |
| `geeksforgeeks.org` | High traffic but full of inaccuracies, especially in CS/algorithms. Often outranks better sources. |
| `tutorialspoint.com` | Same class as geeksforgeeks — surface coverage, frequent errors. |
| `javatpoint.com` | Same. |
| `w3schools.com` | Tolerable for HTML basics but routinely wrong on JS/CSS subtleties; ranks too high. |

### Category B: Marketing-heavy vendor blogs

Sites that publish content to rank, not to inform. Often vendor-aligned content disguised as analysis.

| Domain | Rationale |
|---|---|
| `medium.com` | DIFFICULT — has both Substack-quality writing and AI-rewrite mills. Block at the root level removes too much signal. **Recommendation: do NOT block, but consider blocking specific known-spam Medium publications via subpath if needed.** |
| `hackernoon.com` | Largely AI-rewrite content farm now. |
| `dev.to` | Mixed — but a lot of "I learned X today" filler. Probably block. |
| `freecodecamp.org/news` | Some good tutorials but also a high volume of low-effort posts. Conditional. **Recommendation: do not block (the curriculum content is valuable), but downweight by deprioritizing in allowlists.** |

### Category C: AI-generated content farms

The fastest-growing class. Sites that exist purely to scrape + rewrite + rank.

| Domain | Rationale |
|---|---|
| `byjus.com` | Edutech with extensive AI rewrites. |
| `vedantu.com` | Same class. |
| `unacademy.com` | Same. |
| `simplilearn.com` | Bootcamp marketing as content. |
| `analyticsvidhya.com` | Pre-2023 had useful content, post-2023 mostly rehash. Conditional. |
| `kdnuggets.com` | Was once authoritative, now mostly aggregation/rewrite. Conditional — keep on a watchlist. |
| `towardsdatascience.com` | Medium-hosted; quality has fallen sharply with the AI-content wave. Block specific subpath if Medium is allowed root-level. |

### Category D: Paywall-thin / contributor-page content

Sites whose URL says "authoritative publication" but the article is by an unvetted contributor.

| Domain | Rationale |
|---|---|
| `forbes.com/sites/` | Forbes contributor pages — anyone can write, no fact-check. The main `forbes.com` editorial is OK. **Recommendation: block subpath `forbes.com/sites/*`.** |
| `entrepreneur.com` | Mostly sponsored / contributor. |
| `inc.com` | Same — listicle / contributor heavy. |
| `huffpost.com/entry` | Contributor blog era is over but archived content lingers. Conditional. |
| `businessinsider.com` | Aggregation + clickbait around real news. Selective use only. |

### Category E: Low-signal social / forums

Quote: "social posts without substance". For research vault, almost all qualify. The exception is platform-specific: Stack Overflow IS authoritative for "how do I" code questions; subreddit-specific exceptions exist.

| Domain | Rationale |
|---|---|
| `reddit.com` | DIFFICULT — has gold (specific subs like r/AskHistorians, r/MachineLearning) and noise. **Recommendation: do NOT global-block. Per-tag allowlists can include specific subreddit subpaths if needed (`reddit.com/r/MachineLearning`, etc.).** |
| `facebook.com` | Always noise for research. |
| `instagram.com` | Always noise. |
| `tiktok.com` | Always noise. |
| `x.com`, `twitter.com` | DIFFICULT — primary source for current events / hype tracking but unsearchable text and gated. **Recommendation: do NOT block; block by topic when possible. Many quotes can be found at original-author blogs.** |
| `pinterest.com` | (Already in A.) |
| `slideshare.net` | Slide decks without text context — rarely citable. |
| `scribd.com` | Aggregator of leaked PDFs — copyright risk + low signal. |
| `linkedin.com/pulse` | Contributor articles, often lightly edited corporate content. Block subpath. The main `linkedin.com` is fine for resolving people/companies. |

### Category F: Low-rep technical wikis / forks

| Domain | Rationale |
|---|---|
| `fandom.com` | Wikis for entertainment/games, occasionally indexed for technical terms misleadingly. |
| `wikiwand.com` | Mirror of Wikipedia with extra cruft. Block in favor of `wikipedia.org`. |
| `simple.wikipedia.org` | Wikipedia simplified — the full wiki is better; this dumbs down technical detail. |

### Category G: Spam-prone / link-farm domains

| Domain | Rationale |
|---|---|
| `slideshare.net` | (Already in E.) |
| `prnewswire.com` | Press releases — vendor PR, not journalism. |
| `globenewswire.com` | Same. |
| `businesswire.com` | Same. |
| `marketwatch.com` | Mostly aggregated PR + clickbait headlines. |

### Final recommended global blocklist (~30 domains)

```
pinterest.com
quora.com
answers.com
ehow.com
wikihow.com
chegg.com
coursehero.com
studocu.com
geeksforgeeks.org
tutorialspoint.com
javatpoint.com
w3schools.com
hackernoon.com
byjus.com
vedantu.com
unacademy.com
simplilearn.com
forbes.com/sites/*
entrepreneur.com
inc.com
facebook.com
instagram.com
tiktok.com
slideshare.net
scribd.com
linkedin.com/pulse/*
fandom.com
wikiwand.com
simple.wikipedia.org
prnewswire.com
globenewswire.com
businesswire.com
marketwatch.com
```

**NOT blocked** (kept off the global list deliberately, with reason):
- `medium.com` — too much signal mixed in.
- `reddit.com` — niche subs are primary sources.
- `x.com`, `twitter.com` — primary source for many topics.
- `dev.to` — borderline; treat as "downweight via allowlist preference" not block.
- `kdnuggets.com`, `analyticsvidhya.com`, `towardsdatascience.com` — quality declined but not zero.

## 4. Proposed tag → allowlist table

Vault frontmatter `tags:` array drives selection. When the topic of a research run has a tag matching the table below, pass that allowlist on the WebSearch calls (subject to the escalation logic in section 6).

Critical design choice: **allowlists are large enough to leave room for diverse hits.** A 5-domain allowlist is too tight (one domain dominates results). 15-30 domains per tag is the sweet spot — enough breadth that the search engine has options, enough authority that bad sources stay out.

| Tag | Allowlist (Tier-1, authoritative) |
|---|---|
| `security`, `cybersecurity`, `infosec` | `ietf.org`, `nist.gov`, `csrc.nist.gov`, `owasp.org`, `cve.mitre.org`, `mitre.org`, `cisa.gov`, `kb.cert.org`, `us-cert.gov`, `tools.ietf.org`, `iacr.org`, `eprint.iacr.org`, `usenix.org`, `cccs.gc.ca`, `enisa.europa.eu`, `ncsc.gov.uk`, `sans.org`, `schneier.com`, `googleprojectzero.blogspot.com`, `portswigger.net/research`, `troyhunt.com` |
| `quant-finance`, `finance-research`, `markets-research` | `arxiv.org`, `ssrn.com`, `papers.ssrn.com`, `sec.gov`, `federalreserve.gov`, `bis.org`, `imf.org`, `worldbank.org`, `bloomberg.com` (specific paywall risk noted), `ft.com` (paywall), `wsj.com` (paywall), `nber.org`, `econpapers.repec.org`, `cfainstitute.org`, `risk.net`, `journals.aom.org`, `jstor.org` |
| `ai`, `ml`, `machine-learning`, `deep-learning` | `arxiv.org`, `paperswithcode.com`, `openreview.net`, `proceedings.mlr.press`, `proceedings.neurips.cc`, `aclanthology.org`, `openai.com/research`, `deepmind.google`, `anthropic.com/research`, `blog.research.google`, `ai.meta.com`, `huggingface.co/papers`, `distill.pub`, `jmlr.org`, `*.edu` (where supported, otherwise list specific labs: `csail.mit.edu`, `stanford.edu`, `cs.cmu.edu`, `berkeley.edu`) |
| `medical`, `clinical`, `health`, `biomed` | `pubmed.ncbi.nlm.nih.gov`, `ncbi.nlm.nih.gov`, `who.int`, `cdc.gov`, `fda.gov`, `nih.gov`, `nejm.org`, `thelancet.com`, `bmj.com`, `jamanetwork.com`, `nature.com/nm`, `cell.com`, `cochrane.org`, `cochranelibrary.com`, `clinicaltrials.gov`, `europepmc.org`, `medlineplus.gov` |
| `legal`, `law`, `case-law` | `courtlistener.com`, `justia.com`, `supremecourt.gov`, `law.cornell.edu`, `oyez.org`, `eur-lex.europa.eu`, `legislation.gov.uk`, `case.law`, `scholar.google.com`, `congress.gov`, `govinfo.gov`, `loc.gov`, `oecd.org`, `un.org` |
| `physics`, `science`, `chemistry`, `biology` | `arxiv.org`, `nature.com`, `science.org`, `pnas.org`, `journals.aps.org`, `iopscience.iop.org`, `nasa.gov`, `cern.ch`, `nist.gov`, `noaa.gov`, `royalsocietypublishing.org`, `sciencedirect.com`, `aps.org`, `osti.gov`, `pubs.acs.org` |
| `software-engineering`, `programming`, `dev` | `stackoverflow.com`, `github.com`, `gitlab.com`, `developer.mozilla.org`, `docs.python.org`, `cppreference.com`, `rust-lang.org`, `go.dev`, `kernel.org`, `tools.ietf.org`, `tc39.es`, `whatwg.org`, `w3.org`, `webkit.org`, `chromium.org`, `man7.org`, `gnu.org`, `pubs.opengroup.org`, `cve.mitre.org` |
| `economics`, `econ-policy` | `nber.org`, `econpapers.repec.org`, `imf.org`, `worldbank.org`, `oecd.org`, `bis.org`, `federalreserve.gov`, `ecb.europa.eu`, `bea.gov`, `bls.gov`, `frbsf.org`, `aeaweb.org`, `ssrn.com`, `voxeu.org` |
| `history`, `archaeology` | `jstor.org`, `archive.org`, `hathitrust.org`, `loc.gov`, `nara.gov`, `britishmuseum.org`, `cambridge.org`, `oxfordjournals.org`, `historicalstatistics.org`, `gutenberg.org`, `perseus.tufts.edu` |
| `philosophy`, `ethics` | `plato.stanford.edu`, `iep.utm.edu`, `philpapers.org`, `jstor.org`, `cambridge.org/core`, `oxfordjournals.org`, `bjps.aps-publishing.com` |
| `politics`, `policy` | `congress.gov`, `whitehouse.gov`, `gao.gov`, `crsreports.congress.gov`, `cbo.gov`, `state.gov`, `oecd.org`, `worldbank.org`, `un.org`, `pewresearch.org`, `brookings.edu`, `rand.org`, `cfr.org`, `belfercenter.org` |

**Notes on the table:**

- *Wildcards limited.* Per docs, `*.edu` is invalid syntax (wildcard must be after domain, not as subdomain). To cover `.edu` broadly, must enumerate institutions OR fall back to no-allowlist for ai/ml topics. **Decision: enumerate the top 20 CS/ML programs explicitly per ai tag — `mit.edu`, `stanford.edu`, `cmu.edu`, `berkeley.edu`, `cornell.edu`, `princeton.edu`, `harvard.edu`, etc.** Subdomains auto-included so `mit.edu` covers `csail.mit.edu`. This is the trade-off the docs force.
- Paywall sites (FT, WSJ, Bloomberg, Lancet, NEJM) included where the abstract / metadata IS valuable even when full text is paywalled. WebFetch handles graceful failure on the body.
- Vendor labs (`openai.com/research`, `anthropic.com/research`, `deepmind.google`) included with caveat: must be flagged at synthesis time as `source_class: vendor` so contestation pass treats them with appropriate skepticism.
- Allowlists overlap. A page tagged `[security, ai]` should pass the UNION of the two allowlists, not pick one. (Implementation: dedupe the union.)

## 5. Escalation logic when allowlist returns thin

Define "thin" as <3 results from a WebSearch call with `allowed_domains` set. From section 2's inference, the tool returns silent empty; the caller must inspect.

Recommended escalation ladder, applied in order until a step yields >=3 results or the budget is hit:

1. **Try tag-union allowlist** (the primary path). Most queries should hit on this.
2. **Drop the most restrictive tag.** If page tagged `[medical, AI-in-radiology]` and the medical+ai union hit thin, drop the more specific tag and try the broader one alone (e.g. `medical` only). One retry.
3. **Try a single related allowlist.** If the topic crosses domains (e.g. quant-finance + AI), and the union came up thin, try the OTHER tag's allowlist alone. One retry.
4. **Fall back to blocklist-only mode.** Re-run the same query with `blocked_domains` set to the global blocklist (section 3) and NO `allowed_domains`. This is the "open the door but keep the trash out" mode. Annotate the synthesis page that this happened: `source_class_warning: allowlist exhausted, fell back to blocklist-only` in frontmatter.
5. **Last resort: open web with no filtering.** Annotate strongly: `source_class_warning: open-web fallback` in frontmatter and add a paragraph in the synthesis explaining why.

**Budget cap:** maximum 2 escalation steps per query. So a thin allowlist hit triggers at most one retry before falling to blocklist-only. This keeps the search-cost ceiling at ~3x baseline in the worst case.

**Step 4 is the load-bearing fallback.** It's strictly better than the current "no filtering" state — even when the allowlist has nothing for the topic, you still get the open web minus 30 known-spam domains.

**No infinite loops.** The escalator is a fixed sequence; it does not retry the same query with the same params. If step 5 still yields nothing, the caller surfaces a "topic poorly covered on the open web" message and bails.

## 6. Combining blocklist + allowlist

API does not support both in one call. Two implementation options:

**Option A: Allowlist OR blocklist per call, never both.** When a tag matches, allowlist the call. When no tag matches, blocklist the call. Simpler.

**Option B: Two calls per query.** First call with allowlist, second with blocklist applied to the open web, merge results, dedupe by URL. More expensive (2x search cost) and gain is marginal — the allowlist already excludes most of what the blocklist would have removed.

**Recommendation: Option A.** The maintenance saving and search-budget reduction outweigh the marginal coverage from the second call. If allowlist runs thin, escalation logic (section 5, step 4) explicitly switches to blocklist mode for the retry — that achieves the "best of both worlds" outcome without paying for two calls every time.

## 7. Source-class metadata

When a result comes from a Tier-1 allowlist domain, frontmatter on the produced page can record this automatically. Proposed frontmatter additions:

```yaml
---
title: <topic>
created: <date>
source: autoresearch
tags: [...]
rounds: 3
verification: quick
source_classes:
  tier1: 8     # results from allowlist domains
  tier2: 2     # results from blocklist-mode (open web minus blocklist)
  vendor: 1    # tagged as vendor (allowlist-included but vendor-flagged)
  unknown: 0
allowlist_used: [security, ai]   # tag names whose allowlists fired
escalation: []                   # or ["dropped-tag-medical", "blocklist-fallback"] etc
---
```

This makes downstream `/vault-lint --quality` audits trivial: "pages with `source_classes.tier1: 0` AND `escalation: [open-web fallback]` are RED." Currently lint has to re-fetch URLs and classify them — recording at write-time is a clean Pareto improvement.

`source_classes` is a count, not a list of domains, to keep frontmatter compact. The full URL list lives in the page body's Key claims / Key facts citations as already.

## 8. Edge cases

Pages that legitimately need general-web. Three classes identified:

- **Current events, breaking news.** Allowlist of news.com authoritative outlets (`apnews.com`, `reuters.com`, `bbc.com`, `npr.org`, `theguardian.com`) should be a separate `current-events` tag. Allowlist mode applies. No special opt-out needed — just tag correctly.
- **Hype / sentiment tracking.** Twitter/Reddit/Hacker News are primary sources here. Need an opt-out flag. Proposed: `--no-allowlist` or `--open-web` flag on `/vault-autoresearch` and `/vault-ingest`. When set, the run uses blocklist-only mode (skipping the allowlist step entirely). Frontmatter annotates `source_classes.escalation: ["user-opt-out-no-allowlist"]`.
- **Vendor selection / product comparison.** "What CRMs are popular" — needs vendor blogs and review aggregators. Proposed: a `vendor-research` tag with its own allowlist of `g2.com`, `gartner.com`, `forrester.com`, `capterra.com`, `trustradius.com`, plus the vendor sites for whatever's being compared. Fall back to blocklist-only is fine here too.

Catch-all: the user can always override with `--open-web`. Default behavior should be tag-routed allowlist. If no tag matches AND no override, default to blocklist-only mode (option B in the design space).

## 9. Design space scoring

Four candidate strategies, evaluated on quality lift / dissent risk / maintenance / implementation effort.

### A. Blocklist-only (subtractive)

Pass `blocked_domains` always, never `allowed_domains`.

- Quality lift: medium. Removes ~20-30% of spam-class results. Real lift varies by topic.
- Dissent risk: low. Substack, niche blogs, Medium quality writers all still reachable.
- Maintenance: low. One global list, slow rot (bad domains change slowly).
- Implementation: trivial. Add a const `GLOBAL_BLOCKLIST` and pass it on every search.
- **Best for:** topics with no clear authoritative pool (politics, policy debate, hype tracking, vendor selection).

### B. Allowlist when tag matches, else blocklist

Two-mode.

- Quality lift: high on tagged topics, medium otherwise. Best of both worlds in the typical case.
- Dissent risk: medium. Allowlist on a `security` topic means a Substack post by a niche researcher won't surface. Mitigated by the contestation pass, which can use blocklist mode explicitly.
- Maintenance: medium. The tag → allowlist table needs updating as new authoritative sources emerge; bad domains get added to the blocklist.
- Implementation: moderate. Need a tag-routing function + the escalation ladder.
- **Best for:** the default mode for the vault. Most pages have tags; tagged pages get the lift; untagged pages still get blocklist protection.

### C. Blocklist + allowlist together (combined)

Forbidden by API in one call. Two-call merge possible but expensive.

- Quality lift: marginally above B at 2x search cost. Not justified.
- Maintenance: same as B.
- Implementation: complex (merge / dedupe logic).
- **Verdict: rejected.** API constraint and cost both push against it.

### D. Hybrid with escalation (B + section 5 ladder)

Same as B but with the formal escalation ladder when allowlist runs thin.

- Quality lift: highest of all options. Captures Option B's strengths and gracefully degrades when allowlist underperforms.
- Dissent risk: lowest. Step 4 of escalation explicitly opens the door for non-curated dissent when needed.
- Maintenance: medium. Same lists as B, plus the escalation routing logic (small).
- Implementation: B + ~30 lines of escalation glue. Single place to add the inspect-empty-then-retry logic.
- **Verdict: best.** This is the recommended design.

## 10. Recommendation

**Strategy: D — Hybrid B + escalation.**

**Implementation outline (mechanical):**

1. Create `~/.claude/vault/config/source-quality.json` with two top-level keys:
   - `blocklist`: array of domains (the ~33-entry list from section 3).
   - `tag_allowlists`: object mapping tag → array of domains (table from section 4).

2. In each vault skill that calls WebSearch (`vault-autoresearch`, `vault-challenge`, `vault-ingest`, also `vault-landscape`, `vault-probe --web`):
   - Determine the tags of the active page or topic.
   - Look up tags in `tag_allowlists`. If any match, build the union as the allowlist.
   - If allowlist non-empty, pass `allowed_domains: <union>` on the WebSearch call.
   - If allowlist empty (no tag match), pass `blocked_domains: <global-blocklist>` instead.

3. After every WebSearch call, count results.
   - If allowlist mode AND `len(results) < 3`, run the escalation ladder in section 5 (cap 2 retries).
   - On step-4 fallback, switch to blocklist-only mode and re-issue.
   - On step-5 fallback, surface a warning to the synthesis page frontmatter.

4. Record `source_classes` and `allowlist_used` and `escalation` in frontmatter as section 7 specifies.

5. `--open-web` flag on user commands skips allowlist mode entirely and uses blocklist-only. Useful for hype tracking, current events.

6. Wire `vault-lint --quality` to read `source_classes` and `escalation` from frontmatter when scoring pages — a page with `escalation: ["open-web fallback"]` should YELLOW if the topic was clearly authoritative-mappable.

**Maintenance cadence:**
- Blocklist: review every 6 months. Add new content farms as they emerge. Probably grows to ~50 over time; no need to keep small.
- Allowlists: review every 3 months per tag. Domains rot — academic journals merge, conferences change names, vendor labs publish less. Track per-tag last-reviewed timestamp in the config file.

**Roll-out path:**
1. Land the config file with current proposed contents.
2. Wire `vault-autoresearch` first (highest blast radius).
3. Wire `vault-ingest`'s contestation check (step 3b in the skill — single search, easiest test).
4. Wire `vault-challenge` and `vault-landscape`.
5. Add `vault-lint --quality` integration last (requires frontmatter signal to populate first).

**Expected outcome:**
- Tagged pages get a noticeable quality lift in citations (more `*.gov`, `arxiv.org`, primary-source domains; fewer SEO farms).
- Untagged pages still get protection via blocklist.
- Token cost on WebFetch drops because fewer junk results enter the context window.
- Escalation gives explicit signal in frontmatter when the allowlist couldn't cover the topic — `vault-lint` can flag those for review.

End.
