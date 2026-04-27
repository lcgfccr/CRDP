---
title: vault-correct trust model + audit
created: 2026-04-23
source: research
tags: [research, vault-design, trust-model, audit, sycophancy]
---

# vault-correct — trust model + audit design

User-as-source-of-truth is load-bearing for the vault. /vault-correct lets user override or annotate web-sourced content. Corrections are unverified — could be wrong, hallucinated, marketing-tinted, or politically motivated. This doc designs how to treat corrections honestly: tiered trust, mandatory audit, defenses against laundering, sycophancy mitigation.

---

## Problem framing

Vault has two epistemic tiers already:
- **Web sources** — graded by /vault-policy authoritative_domains, scored by D1/D2/D8 in /vault-lint, stress-tested by /vault-challenge.
- **User input** — currently unmoderated.

The asymmetry: web claims face Popper-pressure (challenge), rubric-pressure (policy), structural-pressure (lint dimensions). User claims face nothing. The vault is therefore vulnerable to the laundering pattern:
1. User asserts X via /vault-correct (no evidence).
2. Page now says X with `corrected: 2026-04-23`.
3. /vault-output emits report citing the page.
4. Reader sees X as "researched" — provenance erased.

Worse than the web-claim case because the user is also the auditor — no second pair of eyes. Trust model must compensate by making each correction's TIER explicit at every surface (frontmatter, body, output), so the reader sees "this is one person's claim, not researched evidence" without needing to read git log.

Three failure modes to defend against:
- **Honest mistake.** User misremembers a fact, /vault-corrects with confidence. Vault accepts, contradicts an actual web source the vault already has.
- **Bias drift.** User has a vendor preference; corrections accumulate that nudge the vault toward marketing without anyone noticing.
- **Sycophantic loop.** User says "Auth0 docs are wrong about X." Claude rubber-stamps without surfacing that the existing source disagreed. Naive "are you sure?" critique degrades 98%→56% per agentic-self-critique findings, so it can't be the fix.

Handle all three with mechanism, not vibes.

---

## Trust tiers

Three-tier vocabulary. Tiering must be DECLARED by user. Auto-classification rejected — itself a sycophancy vector (Claude infers the flattering tier).

### CITED

Primary-source URL or vault-archived doc backs the claim.
- Trust signal: high. Treated like a web-sourced ingest, with `tier: cited` in audit frontmatter.
- Required: `source_url` OR `source_doc` (path under `raw/`).
- Behavior: can displace web sources of equal/lower authority. /vault-challenge runs against them like web claims.
- Use case: "I checked the RFC — doc says §4.3, RFC actually says §4.1, here's the link."

### PRACTITIONER

Lived experience grounds the claim, no external citation.
- Trust signal: medium. Marked in body output as "Practitioner note (user, dated)".
- Required: `practitioner_context` (1-2 sentences — built it / debugged it / ran in prod / reverse-engineered).
- Behavior: layered ALONGSIDE web claims, never displacing. If web says X and practitioner says Y, both shown with origin labels, contradiction surfaced in `## Open / contradicts`.
- Use case: "Shipped this 18mo in prod — flag X behaves like Y, docs are wrong, no public issue to link."

### OPINION

Preference or judgment, no evidence required.
- Trust signal: low. Labeled "Opinion (user, dated)" — visually distinct.
- Required: `confidence` (`strong` / `weak` / `preference`).
- Behavior: never displaces. /vault-output excludes opinion content from Synthesis / Key facts. Lives in `## Per-author preferences`.
- Use case: "Prefer pattern A over B for our team — fit, not better."

### Why three not four

Considered REVOKED tier — better as a status transition (`status: revoked`) than a separate tier. Tiers = quality bands, status = lifecycle.

Considered DOMAIN-EXPERT tier ("told to me by Dr. Y") — folds into CITED via `source_doc: personal-comm-yname-<date>.md` (verbatim quote, channel, date in `raw/`). Forces user to make personal-comm an artifact, not a hand-wave (academic precedent).

### Auto-classification: rejected

Tempting to infer tier from input shape (URL → CITED, "I think" → OPINION). Rejected:
- Sycophancy: Claude infers the flattering tier on ambiguity.
- User loses the discipline-forcing function of declaring "is this evidence or just preference?"
- One-line cost (`--tier <name>`) is small.

/vault-correct REQUIRES `--tier {cited|practitioner|opinion}`. No default. Aborts if missing.

---

## Audit schema

Every correction generates an audit record.

### Mandatory fields

| Field | Type | Source |
|---|---|---|
| `correction_id` | `<page>-<ts>-<short-hash>` | auto |
| `tier` | `cited` \| `practitioner` \| `opinion` | declared |
| `timestamp` | ISO-8601 | auto |
| `author` | string (default `user`; override `--source <name>`) | declared |
| `target_page` | wikilink slug | argument |
| `target_section` | section heading or `synthesis` / `key-facts` / `frontmatter:<field>` | argument |
| `correction_text` | text added/replacing | input |
| `original_text` | text being replaced (empty if pure annotation) | derived |
| `reason` | 1-3 sentences, why this correction | input |
| `status` | `active` \| `superseded` \| `revoked` | default `active` |

### Tier-conditional

| Field | Required for | Type |
|---|---|---|
| `source_url` | CITED (one of url/doc) | URL |
| `source_doc` | CITED (one of url/doc) | path under `raw/` |
| `practitioner_context` | PRACTITIONER | 1-2 sentences |
| `confidence` | OPINION (mandatory); CITED/PRACTITIONER (optional) | `strong`\|`weak`\|`preference` |

### Optional

| Field | Use |
|---|---|
| `supersedes` / `superseded_by` | replacement chain |
| `revoked_reason` / `revoked_by` | revocation context |
| `expiry_check` | re-validate by date; default = +6mo CITED, +12mo PRACTITIONER, none OPINION |
| `contradicts_existing` | wikilinks populated by hallucination-check |
| `challenged` | ISO-8601 set when /vault-challenge runs |

### Storage shape — two-part

**Frontmatter index on target page:**
```yaml
corrections:
  - id: oauth-pkce-2026-04-23-a3f2
    tier: cited
    section: synthesis
    status: active
```

**Full record at `corrections/<page>-<ts>-<short-id>.md`:**
```markdown
---
correction_id: oauth-pkce-2026-04-23-a3f2
tier: cited
timestamp: 2026-04-23T14:30:00Z
author: user
target_page: oauth-pkce
target_section: synthesis
status: active
source_url: https://datatracker.ietf.org/doc/html/rfc7636#section-4.1
reason: Synthesis cited §4.2; RFC defines code_verifier in §4.1.
expiry_check: 2026-10-23
---

## Original
> The PKCE code_verifier is defined in §4.2 of RFC 7636.

## Correction
The code_verifier is defined in §4.1. §4.2 covers code_challenge derivation.

## Why
I checked the RFC directly while implementing.
```

### Why two-part — file/frontmatter/single tradeoffs

**A — single `corrections.md`.** Pro: one file. Con: no page scoping; unbounded growth.
**B — inline frontmatter only.** Pro: simple. Con: bloat; rich fields don't fit; revoked entries clutter.
**C — frontmatter index + per-correction file.** Pro: full audit per record; revoked entries persist for history without polluting target page; correction is independently lintable / challengeable / supersedeable. Con: more files.

**Pick C.** Audit case (revocation history, supersede chains, rich fields) dominates. `corrections/` lives under `projects/<slug>/corrections/` alongside `pages/` and `raw/`.

---

## Adversarial defenses

### 1. Tier marking visible everywhere

OPINION and PRACTITIONER carry a visible marker in /vault-output and page body. CITED gets a footnote-style annotation — small but present. Cannot pass as researched evidence on any output surface. This is the laundering defense.

### 2. /vault-challenge runs against corrections

CITED corrections are claims subject to falsification. Extend /vault-challenge to also pull active CITED corrections from the page when selecting load-bearing claims. PRACTITIONER and OPINION skip default challenge (can't web-falsify lived experience or preference) but get a softer "any web contradiction?" check.

When /vault-challenge weakens a correction: correction's frontmatter gets `challenged: <date>`, source page's `## Adversarial challenge` notes the weakening. User decides revoke vs qualify.

### 3. /vault-lint flags

New lint checks over `corrections/*.md`:
- Active OPINION without `confidence` → YELLOW.
- Active PRACTITIONER without `practitioner_context` → YELLOW.
- CITED with broken `source_url` (4xx/5xx via WebFetch spot-check) → RED.
- Past `expiry_check` → YELLOW (re-validate).
- Target page re-researched (newer page `created` than correction `timestamp`) and correction still `active` → YELLOW (verify still applies).

### 4. Periodic re-validation

- CITED: 6mo default. URLs rot, RFCs revise.
- PRACTITIONER: 12mo default. Lived experience drifts.
- OPINION: no auto-expiry. Preferences age but don't expire.

User runs `/vault-correct --revalidate <id>` → confirm (reset expiry), supersede (new correction), or revoke (status flip + reason).

### 5. Vendor laundering defense

Specific scenario: user keeps /vault-correcting "vendor X is best" without evidence.

- **Per-page correction density alarm.** /vault-lint flags pages where active corrections > N% of total claims (default 25%). Structural smell.
- **Per-vendor density alarm.** /vault-lint flags when corrections mentioning vendor X across vault exceed M (default 5) without independent web sources of equal weight.
- **Tier-mismatch demotion.** CITED with `source_url` matching /vault-policy `risk_flags: hype-cycle` allowlist (vendor marketing) → auto-demote display to PRACTITIONER until user supplies independent citation or accepts demotion.

### 6. Reversibility — supersede / revoke

`/vault-correct supersede <id>` — new correction with `supersedes: <old-id>`; old gets `superseded_by: <new-id>` and `status: superseded`. Both files persist.

`/vault-correct revoke <id> --reason "..."` — flip to `revoked`. Capture `revoked_reason` and `revoked_by` (correction-id or `web-evidence:<url>`). Page body switches to strikethrough or reverts (default: strikethrough — leaves audit visible).

### 7. Honest fallback when correction proven wrong

1. /vault-challenge writes finding to source page's `## Adversarial challenge` AND correction's frontmatter (`challenged:`).
2. /vault-lint flags next pass.
3. User runs `/vault-correct revoke <id> --reason "Overturned by [[new-page]] / web-evidence:<url>"`.
4. Correction file persists with `status: revoked` and revocation context.
5. Log: `<ts> — REVOKE — [[corrections/<id>]] — reason: <summary>`.

History never destroyed. Vault must answer "what did we believe at time T?"

---

## Sycophancy mitigation in correction flow

Naive "are you sure?" degrades per agentic-self-critique findings (98%→56% in some loops). Fix anchors to STRUCTURE, not free-form critique.

### Hallucination-check procedure (mandatory before write)

**Step 0.** Read target page + 1-hop neighbors (pages wikilinking to/from it).

**Step 1.** Scan for direct contradictions. Match by:
- Sentence-level negation overlap ("X is true" vs "X is false").
- Numeric contradictions ("500ms" vs "200ms").
- Section/citation contradictions (claim cites §4.2, correction cites §4.1 of same doc — could be either party right; must surface).

**Step 2.** If contradictions, present to user:
```
This correction appears to contradict:
  [[oauth-pkce]] — "code_verifier defined in §4.2 of RFC 7636." (cited: rfc-editor.org/rfc/rfc7636)
  [[auth-comparison]] — "PKCE: §4.2"

Your correction asserts: code_verifier is in §4.1.

Resolutions:
  (a) You're right — page is wrong. Proceed.
  (b) Correction is mistaken — abort.
  (c) Both partially right — refine the correction text.
  (d) Defer — file as `## Open / contradicts` annotation, don't apply yet.
```

**Step 3.** Capture user's choice in correction record (`contradicts_existing` + extended `reason`).

### Why this beats free-form critique

Per agentic-self-critique: naive critique loops degrade in high-confidence regions and only help in low-perf zones. This procedure:
- Doesn't ask "is this right?" (Claude can't answer better than user; degrades).
- Asks "does this conflict with vault content?" (mechanical, deterministic, can't sycophantically skip).
- Surfaces conflicts. User adjudicates. User stays the authority.
- Captures resolution in audit `reason`. If user says "I'm right, vault is wrong," that becomes audit history.

This is the constitutional-rubric pattern from agentic-self-critique research: anchor critique to structure committed to BEFORE Claude can drift.

### Soft check (one question, not a loop)

When no direct contradiction exists but framing is suspicious, Claude surfaces ONE clarifying question only when:
- OPINION + `confidence: strong` (rare combination, worth asking).
- CITED but `source_url` not WebFetch-verified (spot-check it exists).

One question, then proceed. Doesn't degrade through repetition.

---

## Display rules

Three surfaces matter: target page body, target page frontmatter, /vault-output artifacts.

### Target page body

**CITED** → inline edit with footnote:
```markdown
The PKCE code_verifier is defined in §4.1 of RFC 7636. [^c1]

[^c1]: Per [[corrections/oauth-pkce-2026-04-23-a3f2]] — user-cited correction (RFC §4.1, 2026-04-23).
```

**PRACTITIONER** → labeled annotation block:
```markdown
> **Practitioner note** ([[corrections/oauth-pkce-2026-04-23-b1d4]] · user · 2026-04-23): in our prod deployment §4.2 references challenge derivation, not verifier definition.
```

**OPINION** → dedicated section at end of page:
```markdown
## Per-author preferences

- ([[corrections/oauth-pkce-2026-04-23-c9e1]] · user · 2026-04-23 · confidence: preference) Prefer code_verifier length 64 over spec minimum 43 for our threat model.
```

### Frontmatter

Index only — full record in correction file:
```yaml
corrections:
  - id: oauth-pkce-2026-04-23-a3f2
    tier: cited
    section: synthesis
    status: active
```

### /vault-output

Per-format rules:
- `report`: CITED inline (footnoted) + PRACTITIONER as labeled side notes + OPINION only in "author preferences" appendix if `--include-opinion`.
- `study-guide` / `glossary`: CITED + PRACTITIONER labeled; OPINION excluded by default.
- `comparison`: CITED inline; PRACTITIONER and OPINION as separate columns / footnotes.

Universal: never strip the correction marker. Even clean CITED inline still triggers a "Sources" entry pointing to the correction file.

---

## Comparison to academic-literature mechanisms

Useful analogs:

- **Personal communication.** "(Smith, personal communication, 2024)" — named, dated, no URL. Lower-evidence but acceptable when no public source. Maps to PRACTITIONER with `--source <name>` + `practitioner_context`.
- **Data on file.** Industry/regulatory: "data on file, [Company]" — claim retained internally, producible on request. Maps to CITED with `source_doc:` pointing to `raw/` artifact (notes, screenshots, internal docs).
- **Expert opinion (evidence pyramid).** Lowest tier above mechanism in clinical pyramid. Legitimate but flagged as not derived from controlled study. Maps to OPINION.
- **Erratum.** Published correction that doesn't delete original record. Original persists with erratum link. Maps to revoke + persist: revoked file persists with `status: revoked`.
- **Supersede chain.** Preprint v1, v2, v3. Maps to /vault-correct --supersede with `supersedes:` / `superseded_by:`.

Lessons that transfer:
- Name the author (no anonymous; `author: user` minimum).
- Tier evidence with explicit labels (not implicit).
- Preserve historical record on retraction (no silent deletion).
- Distinguish source type on display, not just back-matter.

What doesn't transfer: peer review. Single-user vault can't peer-review corrections. /vault-challenge is the closest analog (adversarial-search, not human peer review). Recognize the gap honestly — structural defenses (tier marking, density alarms, contradiction surfacing) are partial substitutes.

---

## Recommendation

### Trust tier vocabulary

Three tiers, user-declared, mandatory:
- **CITED** — primary-source URL or vault-archived doc.
- **PRACTITIONER** — lived experience, no external citation.
- **OPINION** — preference/judgment, must declare confidence.

No auto-classification. /vault-correct aborts if `--tier` missing.

### Audit schema (mandatory + optional)

Mandatory: correction_id, tier, timestamp, author, target_page, target_section, correction_text, original_text, reason, status.
Tier-conditional: source_url|source_doc (CITED), practitioner_context (PRACTITIONER), confidence (OPINION mandatory; others optional).
Optional: supersedes, superseded_by, revoked_reason, revoked_by, expiry_check, contradicts_existing, challenged.

Storage: two-part — frontmatter index on target page + full record at `corrections/<page>-<ts>-<short-id>.md`.

### Display rules

- CITED: inline body with footnote marker + correction-file backref.
- PRACTITIONER: labeled annotation block.
- OPINION: `## Per-author preferences` at end of page.
- All tiers visible in /vault-output with origin label. No invisibility, no laundering surface.

### Adversarial-correction defenses

1. /vault-challenge runs against CITED corrections. PRACTITIONER/OPINION get soft "any contradiction?" check.
2. /vault-lint flags missing tier-required fields, broken source URLs, expired corrections, suspicious density (per-page, per-vendor).
3. Tier-mismatch demotion — vendor-marketing source on CITED auto-demotes to PRACTITIONER until challenged.
4. Periodic re-validation per tier (CITED 6mo, PRACTITIONER 12mo, OPINION none).
5. --supersede / --revoke preserve audit history. No silent deletion.

### Sycophancy mitigation

Hallucination-check is structural, not free-form:
1. Read target + 1-hop neighbors.
2. Detect direct contradictions with cited claims.
3. Surface conflicts to user with discrete options (proceed / abort / refine / defer).
4. Capture resolution in audit `reason`.

Anchors critique to mechanical contradiction-detection (deterministic) instead of free-form "are you sure?" (which degrades per agentic-self-critique findings). Plus ONE soft clarifying question for OPINION+strong or CITED+unverified-URL — then proceed.

### Ship order

**MVP:**
1. `--tier` mandatory; three-tier vocabulary.
2. Mandatory audit schema.
3. Two-part storage (frontmatter + corrections/).
4. Hallucination-check (contradiction surface + user adjudication).
5. Display rules across body and /vault-output.

**Phase 2:**
- /vault-lint integration (density alarms, expiry check, broken-URL).
- /vault-challenge extension to CITED corrections.
- --supersede / --revoke lifecycle.
- Tier-mismatch demotion via /vault-policy `risk_flags`.

The asymmetry — web claims under pressure, user claims unmoderated — is the real bug. Tier system, audit schema, display rules close it without making /vault-correct adversarial to the user. User stays the authority; vault makes the user's authority legible to readers and to future Claude instances.
