---
title: Source quality — out-of-band knowledge integration
created: 2026-04-23
angle: out-of-band knowledge — non-web sources brought into vault systematically
status: research-only
---

# Source quality: out-of-band knowledge integration

## Problem framing

Claude Knowledge Vault is bounded by what `WebSearch` + `WebFetch` can reach. The current toolchain (`/vault-autoresearch`, `/vault-challenge`, `/vault-ingest`, `/vault-probe`, `/vault-landscape`) is web-anchored:

- `/vault-autoresearch` round 1-3 = WebSearch + WebFetch loop
- `/vault-challenge` adversarial pass = WebSearch + WebFetch for dissent
- `/vault-ingest` accepts files/PDFs/paste — but treats each as a one-off, no persistent corpus

For domains where the highest-quality knowledge lives off-web, this matters. Off-web knowledge categories:

1. **Paid/private databases** — Bloomberg terminal, FactSet, Westlaw, paid-tier JSTOR full-text, paid academic publishers behind paywalls. Programmatic access blocked.
2. **Insider knowledge** — practitioner intuition, trader floor heuristics, regulatory grey-zone behavior. Not written down, lives in heads.
3. **Personal documents** — internal company reports, private PDFs, marked-up notes, .epub books on user's disk.
4. **Books** — full text of trade books and textbooks not freely fetchable. Can cite by title + page but not retrieve.
5. **Conversational expertise** — Claude's training itself contains domain knowledge that user-priming can unlock. The model "knows" things WebSearch never surfaces because the training corpus is broader than the live indexable web for some domains.

Failure mode: a vault on quant trading auto-researched from public web misses what an actual quant would consider table stakes — desk lore, vendor quirks, post-2008 unwritten compliance norms, Markets-In-Crisis tribal knowledge. Vault confidently asserts things any practitioner would correct. Vault doesn't know what it doesn't know.

Goal: bring non-web knowledge into the vault systematically — not as one-off ingests but as first-class sources that bias every research and challenge pass.

## Design space

Seven candidates evaluated below. Each gets: mechanism, where it slots into existing skills, effectiveness, user burden, implementation effort, generality, false-authority risk.

### 1. Trusted-experts registry

Mechanism. Add `experts.md` (or `## Trusted experts` section in `overview.md`) listing named people whose viewpoint outranks public-web consensus for this project. Format:

```
- Marcos López de Prado — quantitative finance, ML in markets. Override on: backtesting, meta-labeling, portfolio construction.
- Cliff Asness — factor investing, value/momentum. Override on: factor decay debates, equity premium puzzle.
```

Slot. `/vault-autoresearch` round 3 counter-evidence pass adds a step: "for each load-bearing claim, ask Claude — what would <expert> say about this?" Claude reasons from training knowledge of that expert's published views. Output annotates the synthesis: `(López de Prado would push back: backtests overfitted unless deflated Sharpe applied [training])`.

Effectiveness. Medium-high in domains where named experts have distinctive published positions Claude was trained on (finance, ML, philosophy, security). Low where experts are obscure or post-cutoff.

User burden. Low up-front (5-15 names per project). Zero ongoing — registry rarely changes.

Implementation. Tiny. New optional file + ~10-line addition to `/vault-autoresearch` round 3 prompt. No new skill needed.

Generality. High. Every domain has named experts.

False-authority risk. Medium. User picks experts who match their priors → confirmation bias amplified. Mitigation: require the registry to include at least 2 disagreeing camps per topic where camps exist (e.g. Asness AND Cochrane on factor zoo).

### 2. Personal corpus mount

Mechanism. New directory `corpus/` either per-project (`projects/<slug>/corpus/`) or vault-wide (`~/.claude/vault/corpus/`). User dumps private PDFs, .md notes, markdown-converted books, internal memos. `/vault-autoresearch` and `/vault-challenge` grep the corpus FIRST before WebSearch. Corpus hits cited as `[private corpus: <filename>]` (no URL).

Slot. New round 0 pre-pass: "search corpus for relevant content." If hits, integrate them as primary sources before web rounds. `/vault-challenge` uses corpus for counter-evidence with same priority as web dissent.

Effectiveness. Very high when corpus exists. A 200-page PDF of an internal trading manual outweighs ten blog posts. Compounds vault more than any web source could.

User burden. High up-front (convert books/PDFs to text, organize into corpus). Medium ongoing (add new docs as they arrive). Conversion friction is the killer — users won't OCR a textbook.

Implementation. Medium. Need: a corpus index (so grep is fast), corpus-search step in autoresearch + challenge skills, citation format that distinguishes corpus from web. ~1 new helper script + amendments to 2-3 skills. Could lean on existing `~/.claude/vault/projects/<slug>/raw/` infra.

Generality. High. Every project benefits if user invests up-front.

False-authority risk. Medium-low. Corpus is user-curated so false authority depends on what user puts in. Mitigation: corpus citations carry no automatic privilege — same scrutiny as a blog post would get, just with the `(private corpus)` tag for transparency.

### 3. Ground-truth pages

Mechanism. Per-page frontmatter flag: `ground_truth: true`. Marks pages that are primary-source authoritative — RFCs, official spec documents, the actual paper, regulator publications. Other pages with claims contradicting a ground-truth page get flagged in `/vault-lint`.

Slot. `/vault-lint` adds a contradiction-vs-ground-truth check. `/vault-autoresearch` round 3 reads ground-truth pages tagged with same topic and prefers their phrasing. `/vault-challenge` cannot WEAKEN a claim that matches a ground-truth page (or must call this out explicitly).

Effectiveness. High where unambiguous primary sources exist (RFCs, ISO standards, court rulings, official regulator guidance). Low for soft domains where there is no ground truth (philosophy, market sentiment).

User burden. Very low. One flag per ingest of an authoritative doc.

Implementation. Low. New frontmatter field + lint rule + ~5-line read in autoresearch/challenge to check for ground-truth pages. No new skill.

Generality. Medium. Useful for technical/legal/regulatory domains. Less so for opinion-heavy fields.

False-authority risk. Low if user only flags genuine primary sources. Risk goes up if user flags an opinion piece they personally trust. Mitigation: lint rule warns on `ground_truth: true` for source_type other than `paper | spec | official | primary`.

### 4. User-driven correction loop

Mechanism. New skill `/vault-correct [[page]] "<correction with reasoning>"`. User states what's wrong from their own knowledge. Skill appends a `corrections:` block to page frontmatter and a `## Corrections` section with timestamp, user reasoning, and which prior section/claim is amended. `/vault-challenge` reads corrections first and incorporates them into its adversarial pass — corrections become claims-to-defend rather than claims-to-attack.

Slot. New skill. Hooks into `/vault-challenge` (corrections shape the challenge) and `/vault-lint` (un-actioned corrections flagged).

Effectiveness. Very high when user has actual expertise. Captures the "I read this and the fourth paragraph is wrong" loop that currently has nowhere to go.

User burden. Medium ongoing. Requires user to actively notice errors and bother to correct them. Most users won't. But for the users who will, it's the highest-leverage out-of-band channel.

Implementation. Medium. New skill (~80 lines on the pattern of `/vault-save`). Frontmatter convention. Amendments to challenge + lint to honor corrections.

Generality. High. Every project, any domain.

False-authority risk. High if applied silently. User-supplied corrections override researched claims with no further check. Mitigation: corrections always cite reasoning ("source: my own backtest", "source: I built the trading desk for this"). Lint surfaces uncited corrections.

### 5. Expertise-prompted reasoning

Mechanism. At `/vault-init`, add prompt: "what's your expertise level in this domain — novice / practitioner / expert?" Stored in `overview.md` frontmatter. `/vault-autoresearch` adapts:

- novice: web-heavy default (current behavior)
- practitioner: web + light user-validation prompts ("does this match your experience? y/n/skip")
- expert: web-light, Claude-reasons-from-training-with-user-as-validator. Synthesis page draft is shown to user inline before being written, not after.

Slot. `/vault-init` (new question), all autoresearch + challenge passes (read level, adapt loop).

Effectiveness. High for experts who can validate fast. Medium for practitioners. Low/neutral for novices (they already use web-heavy correctly). The big unlock is for the user who knows MORE than the public web on this topic — they currently have to fight the autoresearch output rather than collaborate with it.

User burden. Low up-front (one question at init). Variable ongoing — practitioner/expert mode is more interactive.

Implementation. Medium. Needs branching logic in 2-3 skills + frontmatter field on overview. Inline interaction during autoresearch is a meaningful UX shift from current "spawn subagent and return" pattern.

Generality. High.

False-authority risk. Medium. "Expert" mode trusts user too much by default. Mitigation: even in expert mode, autoresearch retains a mandatory contestation pass (same as `/vault-ingest` step 3b) so user can't accidentally seal the vault inside their own bubble.

### 6. Cross-vault evidence

Mechanism. If user has multiple project vaults (`~/.claude/vault/projects/`), let `/vault-autoresearch` and `/vault-synthesize` cite across vaults. `[[other-project/page-slug]]` syntax. Forces reasoning about transferable knowledge.

Slot. Skill changes are scoped: cross-vault read in autoresearch round 3 (look for analogous content in other projects), cross-vault synthesize as new flag `--cross`.

Effectiveness. Low to medium. Most useful for users with many projects in related domains (e.g. several quant projects). Marginal for single-project users. Risk of importing irrelevant context.

User burden. Zero up-front. Zero ongoing.

Implementation. Low-medium. Read across `projects/*/pages/`. Wikilink resolver needs cross-project syntax.

Generality. Low (only multi-project users benefit).

False-authority risk. Low. Cross-vault evidence is still vault content, same trust level.

### 7. Books / paid-source proxies

Mechanism. Allow `/vault-ingest` to accept "book mode": user provides title + author + ISBN + the chapter(s) they want represented in the vault. Page is synthesized from Claude's training knowledge of the book (with `verification: claude-training` frontmatter and explicit "not auto-fetchable" warning). Citations format: `[Book: Hull, *Options Futures and Other Derivatives* 11e ch.4]`. `/vault-challenge` honors book citations as one notch above blog post but below primary research.

Slot. `/vault-ingest` gains a book mode. `/vault-challenge` learns to read book citations without trying to fetch them.

Effectiveness. High where the book is canonical and Claude has strong training knowledge of it (Hull, Sutton & Barto, Knuth, Tufte). Risky where Claude only weakly knows the book — risk of confabulation.

User burden. Low (just citation). Medium if user wants to verify Claude's training-recall against the actual book.

Implementation. Low. New `verification: claude-training` value + book-citation format + amendments to ingest + challenge.

Generality. Medium. Best in fields with known canonical texts.

False-authority risk. **High**. Confabulation risk is real. A page citing "Hull ch.7" that paraphrases Claude's training is hard to distinguish from a page that actually represents Hull's argument. Mitigation: mandatory `verification: claude-training` flag is visible to all downstream skills and to the user; lint surfaces such pages for periodic re-validation; high-stakes claims require user to confirm "yes Claude's recall matches my reading."

## Scoring table

| # | Approach | Effectiveness | User burden up-front | User burden ongoing | Implementation | Generality | False-authority risk |
|---|---|---|---|---|---|---|---|
| 1 | Trusted-experts registry | Med-High | Low | None | Tiny | High | Med |
| 2 | Personal corpus mount | Very High | High | Med | Medium | High | Low-Med |
| 3 | Ground-truth pages | High | Very Low | Very Low | Low | Med | Low |
| 4 | User-driven correction loop | Very High | None | Med | Medium | High | High (mitigable) |
| 5 | Expertise-prompted reasoning | High (for experts) | Low | Variable | Medium | High | Med |
| 6 | Cross-vault evidence | Low-Med | None | None | Low-Med | Low | Low |
| 7 | Book/paid-source proxies | High (canonical) / Risky (rest) | Low | Low | Low | Med | High |

Effectiveness × generality × low-burden ranking (impact ÷ friction):
1. **Ground-truth pages** — tiny implementation, near-zero burden, broad applicability where primary sources exist
2. **Trusted-experts registry** — tiny implementation, low burden, taps Claude's training without confabulation risk (training knowledge of named published authors is sturdier than "what does Hull's ch.7 say")
3. **User-driven correction loop** — highest expert leverage but burden is "user must care enough to notice and correct"
4. **Personal corpus mount** — highest ceiling but the conversion friction means most users never bootstrap it
5. **Expertise-prompted reasoning** — strong concept, UX cost
6. **Books/paid-source** — useful but confabulation risk requires careful gating
7. **Cross-vault evidence** — limited audience

## Recommendation

**Best 1-2 from this angle: ship #1 (trusted-experts registry) and #3 (ground-truth pages) together. Then #4 (correction loop) as a fast follow.**

Rationale.

- #1 + #3 together cost about a day of skill edits. No new skill files. Two frontmatter conventions, one new optional `experts.md`, one new `/vault-lint` rule, one prompt addendum to `/vault-autoresearch` round 3 and `/vault-challenge` step 2. The existing skills already have the right hooks (round 3 counter-evidence pass; lint contradiction check).
- #1 captures the "Claude's training has expert knowledge — please use it" angle without needing user to write down what experts believe. Claude already knows what López de Prado argues; user just names him.
- #3 captures "user has a primary source, treat it as anchor truth" without requiring a new skill or corpus infrastructure. RFCs, official regulator guidance, the actual paper — flag once, biases everything downstream.
- #4 is the highest-leverage expert channel but adds a new skill + behavioral change for the user. Ship after #1+#3 prove the pattern works.
- #2 (corpus) is the highest theoretical ceiling but conversion friction kills adoption. Better as opt-in v2 once #1/#3/#4 prove the vault can usefully integrate non-web inputs at all. When shipped, lean on `/vault-ingest` infrastructure rather than a new corpus subsystem — corpus = "a directory of files I want vault-ingested in bulk."
- #5, #6, #7 are deferrable. #5 has merit but the UX shift (inline expert validation during autoresearch) is non-trivial and benefits a smaller user segment. #7 is the riskiest — confabulation risk for canonical books, and the value depends on Claude's training fidelity to that exact text. #6 only helps multi-project users.

False-authority hardening (applies to all chosen options).

- Every out-of-band citation gets a visible tag: `(expert opinion: Asness)`, `(ground truth: RFC 7519)`, `(user correction: 2026-04-23)`. Downstream skills + user can see provenance.
- `/vault-lint --quality` adds a rule: pages whose load-bearing claims rest only on out-of-band sources without any web cross-check get YELLOW. Forces eventual contestation pass.
- `/vault-challenge` is the failsafe. Even an expert-cited or ground-truth-anchored page goes through challenge at user request — challenge mode treats out-of-band citations as challengeable, just with a higher bar for "WEAKENED" classification (must find primary-source contradiction, not opinion).

## References

Read for context:
- `/Users/lucafuccaro/.claude/skills/vault-ingest/SKILL.md` — current single-source ingest, has step 3b contestation check that #3 ground-truth would short-circuit for primary sources
- `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md` — round 3 counter-evidence pass is the slot for #1 expert reasoning step
- `/Users/lucafuccaro/.claude/skills/vault-challenge/SKILL.md` — step 2 adversarial search is the slot for #3 ground-truth check + #4 correction-aware challenge

Existing infrastructure that the recommended changes lean on:
- `pages/<slug>.md` frontmatter — extend with `ground_truth: bool`, `verification: ...`
- `overview.md` — add optional `## Trusted experts` section
- `/vault-lint` rule set — add ground-truth contradiction rule + out-of-band-only YELLOW rule
- `questions.md` — corrections that disagree with researched pages produce reconciliation entries (pattern already used by `/vault-challenge` for WEAKENED claims)

No new skill required for the top recommendation. `/vault-correct` (option #4) is the one new skill if/when added.
