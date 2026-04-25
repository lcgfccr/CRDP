---
title: force-bypass — architectural angle
created: 2026-04-23
angle: architectural
scope: change system shape so --force rare in legitimate cases
---

# Force-bypass — architectural solutions

## Problem framing

`/vault-integrate` has a verification gate. Pages with `verification: none` (set by `/vault-save`) or missing the field block integration. Escape hatch: `--force "<reason>"` proceeds + logs `INTEGRATE-FORCE` line to `log.md`.

Failure mode: gate is binary (refuse vs force) and `--force` is the only path forward when verification feels disproportionate to content stakes. Three legitimate-feeling cases dominate:

1. **Legacy `verification: none` pages** authored before the gate existed (no migration ran).
2. **Low-stakes drafts** — quick conversation save where full `/vault-challenge` (3-5 WebFetches) overshoots the page's actual epistemic weight.
3. **Time-sensitive integration** — finding is needed in a source page now; verification scheduled but not done.

Once `--force` is the daily path, the audit log is wallpaper. Bypass becomes default. Discipline collapses silently because the system never differentiates "I forced this once because legacy" from "I forced this because I never challenge anything."

The gate as written conflates two different things: page-content risk (autoresearch synthesis vs ingested source) and operational urgency (today vs next week). Architectural fix: separate them in the system shape.

## Constraint check on the existing system

Pages enter `pages/` from 4 paths:

- `vault-save` → `verification: none` (drafts)
- `vault-ingest` → `verification: quick` (passes 1 contestation WebSearch)
- `vault-autoresearch` → `verification: quick` (passes mandatory counter-evidence pass in round 3)
- `vault-challenge` → bumps to `verification: full` + `challenged: <date>`

So `verification: none` is ALWAYS a `vault-save` artifact. `verification: quick` already includes a built-in counter-evidence pass for both ingest and autoresearch. The current gate treats `quick` as good enough but `none` as blocked — the gate's actual concern is "did anything contest this content?" not "is this fully challenged?"

This reframes the design space: the gate should fire on the SHAPE of the page, not a single `verification` field.

## Design space

### 1. Page-type-specific gates

Different `source:` values get different gate behavior:

- `source: autoresearch` + `verification: quick` → integrate freely (counter-evidence pass already ran).
- `source: autoresearch` + missing `challenged:` AND inferential weight high → REQUIRE `/vault-challenge`, no `--force` allowed. Heavyweight inferential synthesis is exactly where unfalsified claims do damage.
- `source: ingest` → `--force` allowed; ingest is mostly transcription of an external claim, not Claude inference. Risk is misquotation, not hallucination.
- `source: conversation` → `--force` allowed with reason; these are drafts the user already has direct knowledge of.

**Eliminates** `--force` on the highest-risk path (autoresearch synthesis without challenge) while keeping the escape hatch where it makes sense.

**Backward compat:** Existing pages keep working — gate just routes per `source:`. No frontmatter migration needed.

**Cost:** Zero added WebFetches. One frontmatter read.

**Cognitive load:** Low — user already thinks in source-type categories (save vs research vs ingest).

**Failure-mode coverage:**
- Forgetful user: when they save a conversation and want to integrate, `--force` still works → no friction added on the legitimate path.
- Adversarial discipline-skipper: cannot bypass autoresearch challenge requirement at all. The skill of skipping moves from "type --force" to "do something genuinely different" (challenge or accept the cost). That asymmetry is the whole point.

**Implementation effort:** ~30 lines in `vault-integrate/SKILL.md` step 0. No new commands.

### 2. Auto-promote on first integration

First integration of a `verification: none` page silently runs `/vault-challenge` as part of the integrate flow. Refusal becomes promotion.

**Architectural depth:** Patches symptom (refusal) by making the gate invisible. Doesn't address the underlying question of when challenge is overkill — just always pays the cost.

**Backward compat:** Strong — old pages get challenged on first integrate, no breakage.

**Cost:** 3-5 extra WebFetches per first integration. Adds 30-90s latency. For users with many `verification: none` pages, this is a one-time burst.

**Cognitive load:** Lowest of all options — user types `/vault-integrate`, things happen, page is challenged + integrated. No new flag, no new state.

**Failure-mode coverage:**
- Forgetful user: SOLVED. No discipline required; the system enforces challenge transparently.
- Adversarial: N/A — there is no `--force` to abuse. Challenge runs unconditionally.

**Risk:** Defeats the cost signal that `--force` provides. Currently `--force` says "I'm taking a shortcut." Auto-promote says "no shortcut exists; you always pay full cost." Users with 50 conversation drafts they never want to integrate now face a 4-minute integrate every first time.

**Implementation effort:** Medium — vault-integrate must invoke vault-challenge mid-flow, then re-read the now-updated page. ~50 lines.

### 3. TTL on --force bypasses

Forced integrations stamp `force_until: <date+30days>` on the source page (NOT the research page) at the integration site. After expiry, `/vault-lint` flags the integrated finding as `verification: stale` and the source page's claim becomes RED until the underlying research page is challenged or the finding is re-confirmed.

**Architectural depth:** Real — turns `--force` from a permanent decision into a debt that auto-matures. Force usage stays cheap upfront but accrues lint debt the user must service.

**Backward compat:** Existing forced integrations have no `force_until` so lint can grandfather them or backfill from `log.md` `INTEGRATE-FORCE` timestamps.

**Cost:** Zero per-integration. Linear cost in lint time later.

**Cognitive load:** Medium — new state (`force_until`, `verification: stale`) to understand. Gets noisy if user has 30 forced pages and lint goes RED for all of them at month boundary.

**Failure-mode coverage:**
- Forgetful user: lint RED is the proactive surfacing the audit log lacks. Solves the "logs aren't read" problem.
- Adversarial: weak. A user willing to type `--force "draft"` repeatedly will also ignore lint RED. Discipline still required at the consumption side.

**Implementation effort:** Medium — frontmatter mutation on source page during integrate, lint logic update, optional retroactive backfill from log.md.

### 4. Soft-fork architecture

Un-verified pages don't integrate. Instead, integrate appends to the source page as a footnote-style claimed-by reference: `[^claim-N]: claimed by [[unverified-page]]`. The actual finding text never enters the source page until the underlying research is challenged. Lint flags un-promoted footnotes.

**Architectural depth:** Highest in the design space. Models the actual epistemic relationship: source pages know which of their claims rest on un-verified foundations and can be queried about it (`/vault-query "what in this page rests on un-verified work?"`).

**Backward compat:** Major break. Existing forced integrations need migration from blockquote-form to footnote-form. Reading patterns on source pages change — the inline `> **Updated:**` blockquote that lint relies on for indexing becomes a different shape.

**Cost:** Zero per integrate. Increases lint complexity.

**Cognitive load:** High — new concept (claim provenance). Possibly net-positive cognitive load though, since it makes implicit risk explicit.

**Failure-mode coverage:**
- Forgetful: footnote markers visible in source page → harder to ignore than logs.
- Adversarial: discipline-skipper still gets the integration done; just labeled differently. But the labeling persists in source page until promoted, which is harder to dismiss than a log line.

**Implementation effort:** Largest — new footnote template, migration tool, lint detection for un-promoted footnotes, doc updates across save/ingest/autoresearch/integrate. ~200 lines.

### 5. Verification-required paths (split integrate)

Two commands:
- `/vault-integrate-draft` — strikethrough only, no blockquote enrichment, no `--force` needed because it never claims to be authoritative integration.
- `/vault-integrate` — blockquote enrichment + Related update + frontmatter `integrated:` field; verification REQUIRED, no `--force`.

**Architectural depth:** Real — splits two semantically different operations the current single command bundles. Solves the "I want to record this finding in the source page without claiming it's verified" use case directly.

**Backward compat:** Net-new command + existing keeps working with stricter gate (no `--force`).

**Cost:** Zero. Lighter command does less work.

**Cognitive load:** New command name to remember. Small added decision: which integration mode? But the decision maps cleanly to "is this verified yet?"

**Failure-mode coverage:**
- Forgetful: legitimate path exists (`-draft`) so user has no incentive to invent a force-bypass.
- Adversarial: removing `--force` from the verified path eliminates the easy bypass. The skipper would have to use `-draft` (correctly labeled) — which is fine; it's truth in advertising.

**Implementation effort:** Medium — new SKILL.md for `vault-integrate-draft`, edits to existing `vault-integrate`. ~120 lines total.

### 6. Confidence-aware integration

Pages carry `confidence: <low|medium|high>` derived from `verification` + cite-density + challenge-result. Integration depth scales with confidence.

- `low` (verification:none, no challenge): strikethrough only — same as `-draft` above.
- `medium` (verification:quick, no challenge): strikethrough + brief blockquote ("[[page]] reports …").
- `high` (verification:full, challenged date present): full enrichment + Related + frontmatter integrated field.
- `--force` always coerces low.

**Architectural depth:** Highest single-axis depth — `confidence` becomes a first-class derived field that other skills (lint, query, output) can consume. Entire vault gains a coherent risk-grading vocabulary.

**Backward compat:** New derived field — old pages get computed defaults on read. No frontmatter migration required if confidence is computed lazily.

**Cost:** Zero per-integrate. Linear cost in skills that consume confidence.

**Cognitive load:** Moderate — one new concept, but it replaces a binary (verified/unverified) with a more honest gradient. Likely simpler net-net once internalized.

**Failure-mode coverage:**
- Forgetful: integration auto-tunes; no discipline needed — system surfaces uncertainty proportional to evidence.
- Adversarial: `--force` still exists but its effect is bounded (always low). The shortcut now has a real cost: claims arrive in source pages as low-confidence and visibly so.

**Implementation effort:** Largest in the design space. Touches integrate, lint, query, output, possibly autoresearch + challenge for `confidence` recomputation. ~300+ lines.

### 7. Pre-emptive challenge prompt on autoresearch end

When `/vault-autoresearch` finishes without `--challenge`, prompt: "Page produced. Run `/vault-challenge` now? (y/n)".

**Architectural depth:** Symptom-level. Closes the time-gap between creation and challenge but doesn't change the gate or `--force` semantics.

**Backward compat:** Trivial — adds one prompt at end of skill.

**Cost:** Conditional 3-5 WebFetches if user says yes. Zero if no.

**Cognitive load:** Low — one yes/no.

**Failure-mode coverage:**
- Forgetful: well-targeted. The forgetting happens between autoresearch and integrate; this prompt closes it.
- Adversarial: user says no every time and still uses `--force` later. No improvement over status quo.
- **Doesn't help `vault-save` drafts or `vault-ingest` pages** — those don't go through autoresearch. Most `--force` usage on `verification: none` is from `vault-save`, which this option ignores entirely.

**Implementation effort:** Trivial — ~10 lines in vault-autoresearch step "after page written."

## Scoring table

| # | Option | Arch depth | Bkwd compat | Cost | Cog load | Forgetful | Adversarial | Effort |
|---|---|---|---|---|---|---|---|---|
| 1 | Page-type gates | High | Strong | Zero | Low | Strong | Strong | Small |
| 2 | Auto-promote | Low | Strong | High (always) | Lowest | Strong | N/A | Medium |
| 3 | TTL bypass | High | Strong | Zero upfront | Medium | Medium | Weak | Medium |
| 4 | Soft-fork | Highest | Breaking | Zero | High | Strong | Medium | Largest |
| 5 | Split integrate | High | Strong | Zero | Low-medium | Strong | Strong | Medium |
| 6 | Confidence | High | Strong (lazy) | Zero | Medium | Strong | Strong | Largest |
| 7 | Post-research prompt | Low | Trivial | Conditional | Lowest | Targeted | None | Trivial |

Scoring legend: forgetful = forgetful user covered; adversarial = discipline-skipping user covered.

## Recommendation: best 1-2 from this angle

**Primary: #1 Page-type-specific gates.**

Rationale:
- Solves the underlying problem (gate conflates content-risk with operational-urgency) by routing `--force` only where the content-risk is actually low. Autoresearch synthesis pages are the precise case where unfalsified claims propagate damage; ingest and save pages are where they don't.
- Zero added WebFetches; backward compatible; small implementation; user mental model already maps to `source:` types.
- Fixes the adversarial case structurally — discipline-skipper cannot `--force` an unchallenged autoresearch page at all. The remaining `--force` usage is on save/ingest paths, which is exactly where it's legitimate.
- Remaining `INTEGRATE-FORCE` log entries become a clear discipline signal (because they only fire on the legitimate paths, the volume is naturally low; spikes mean something).

**Secondary, complementary: #5 Split integrate.**

Rationale:
- Removes `--force` entirely from the rigorous path by giving users a correctly-labeled lighter command. Combined with #1, this gives:
  - `vault-integrate-draft` for low-stakes / save / ingest paths (no gate).
  - `vault-integrate` for verified pages, no `--force`, page-type still routes (#1) so unverified autoresearch can never enter via this command.
- Together they push the system from "one command with an escape hatch" to "two commands that are honest about what they do." The escape hatch disappears because legitimate cases each have a correctly-shaped command.

Why not #6 confidence-aware: highest leverage single feature in the design space, but largest blast radius. Worth doing eventually but not as the first move — implement #1 and #5 first; if `--force` log entries still trend up, layer confidence on top as a refinement of the routing logic.

Why not #3 TTL: clever but reactive. Solves audit log dead-letter problem (lint surfaces forced bypasses) without solving the upstream issue (`--force` getting normalized in the first place). Would be valuable in COMBINATION with #1 to catch the residual save/ingest `--force` usage that #1 still allows.

Why not #4 soft-fork: most architecturally pure; biggest break + biggest engineering cost. Diminishing returns vs #1+#5 combined.

Why not #7: too narrow. Misses save and ingest paths where most `verification: none` pages actually originate.

## References

- `/Users/lucafuccaro/.claude/skills/vault-integrate/SKILL.md` — current gate at step 0 (lines 57-77), force-rule (line 177).
- `/Users/lucafuccaro/.claude/skills/vault-save/SKILL.md` — sets `verification: none` (line 67), DRAFT contract (line 116).
- `/Users/lucafuccaro/.claude/skills/vault-autoresearch/SKILL.md` — sets `verification: quick` (line 113), mandatory counter-evidence pass (line 99-102), optional `--challenge` round 4 (line 157-184).
- `/Users/lucafuccaro/.claude/skills/vault-ingest/SKILL.md` — sets `verification: quick` (line 80), mandatory contestation check (step 3b, line 67).
