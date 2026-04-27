---
title: /vault-correct — scope and granularity
created: 2026-04-23
angle: what does /vault-correct correct, and at what granularity
status: research-only
---

# /vault-correct: scope and granularity

## Problem framing

Vault is web-bounded. `/vault-autoresearch`, `/vault-challenge`, `/vault-policy`, `/vault-lint` reason from public-web sources or from Claude's training distribution. Both have systematic blind spots:

- **Lived practitioner knowledge.** "We rotate weekly because nobody listens to RFC cadence in real ops." Web doesn't carry this. Training doesn't either.
- **Paid-database knowledge.** Bloomberg, Westlaw, FactSet. Programmatic-blocked, training-thin.
- **Post-cutoff developments.** Things shipped after Jan 2026 are not in training. May or may not be on the web yet, depending on indexability.
- **Insider info.** Internal company practice, regulator grey-zone behavior, "what really happened" vs. what got published.

Current vault has no clean override path. User can:
- Edit a page manually — not durable, lint doesn't see why, challenge ignores it.
- Add a `corrections:` block ad-hoc — not standardized, no schema, downstream skills don't know to read it.
- Run `/vault-challenge` and hope dissent surfaces it — won't, if dissent itself is web-bound.
- Override `/vault-policy` with `--topic-class X` flags — patches policy generation, doesn't correct synthesized pages.

What's missing: **user-as-source-of-truth mechanism.** A first-class "I know this, override the web" channel. The question is what that channel corrects (page content? policy? frontmatter?) and how granular (whole page? per-claim? per-field?).

This research designs scope + granularity. Sister pieces (storage format, authority semantics, propagation rules) are out of scope here — pinned to where /vault-correct writes and what other skills must do with it, but not depth-explored.

## Design space

Seven shapes evaluated.

### 1. Page-level corrections (coarse blob)

Shape. `/vault-correct [[page]] "<correction text>"` appends a `corrections:` frontmatter array (or `## User corrections` section) with timestamp + free-text user note.

```yaml
corrections:
  - date: 2026-04-23
    text: "90-day rotation cadence is wrong — in practice we rotate weekly."
    source: user
```

Plus `## User corrections` section in markdown body.

User burden. Very low. One command, one quoted string. No mental model needed beyond "say what's wrong."

Downstream complexity. Low. Consumers read `corrections:` array, surface in challenge / lint. Parsing is trivial (timestamped text blobs).

Auditability. Good. Timestamp + user-as-source is explicit. But the correction is unstructured, so "which claim does this correct" is fuzzy.

Failure modes. **Correction drift.** User says "90-day is wrong, we do weekly" — but the page also has a bullet "key rotation must clear cipher state" which is unrelated and stays valid. Future readers can't tell which content the correction targets. Stale corrections accumulate; no mechanism marks them obsolete when the page is rewritten.

Composes with /vault-challenge. Awkwardly. Challenge has to read `corrections:` and decide: do I treat the correction as ground-truth and exclude the original claim from challenge, or treat the page as is and let challenge re-derive? Without per-claim mapping, default is "include correction as additional ground-truth context, challenge as usual" — which can produce confused output (challenge re-affirms the 90-day claim that user just corrected).

Composes with /vault-policy. Doesn't. Page-level corrections are page content; policy is a separate file.

### 2. Claim-level corrections (per-claim diff)

Shape. `/vault-correct [[page]] --claim "<original claim text>" --correction "<replacement>"`. Stored as structured map.

```yaml
corrections:
  - claim: "Rotate signing keys every 90 days per NIST SP 800-57"
    correction: "In practice high-traffic JWT issuers rotate weekly to limit blast radius."
    rationale: "I've run JWT key rotation at 3 companies. NIST is the floor, not the norm."
    date: 2026-04-23
```

User burden. Medium. User must locate the exact claim text (tedious for long pages). Two arguments per call. CLI shape gets verbose.

Downstream complexity. Medium-high. Consumers must:
- Match `claim` text to actual page content (fuzzy match? regex? exact substring?). Brittle.
- Decide whether to render the correction inline (replace claim) or footnote-style (claim with strikethrough + correction below).
- Handle the case where the original claim text was edited / the page was re-synthesized — claim string no longer matches.

Auditability. Excellent. Each correction is precisely scoped. Easy to diff: "what did user override on this page."

Failure modes. **String-match brittleness.** Page rewrites break corrections silently. Mitigation: store claim hash + claim text; lint flags orphaned corrections when match fails. **Verbosity.** User has to type the exact original claim — friction kills adoption.

Composes with /vault-challenge. Cleanly. Challenge sees per-claim correction, removes corrected claim from challenge pool (or treats user correction as the to-be-challenged claim, reversing the polarity). Crisp behavior.

Composes with /vault-policy. Doesn't. Claim-level corrections are scoped to page claims.

### 3. Policy corrections (override policy fields)

Shape. `/vault-correct policy [[topic]] "<correction>"` or `/vault-correct policy [[topic]] --add-domain latacora.com --reason "..."`. Edits `raw/policy-<topic-slug>.md` frontmatter directly.

```
/vault-correct policy "JWT signing key rotation" --add-domain latacora.com --reason "Authoritative practitioner-side dissent on rotation cadence."
```

Result. Patches `authoritative_domains` in policy file. Records rationale in policy's `## User corrections` section. Bumps `policy_schema_version` or appends `corrections_version`.

User burden. Low-medium. Field-aware flags require user to know policy schema (`--add-domain`, `--remove-domain`, `--add-risk-flag`, `--set-recency-weight`). Free-text version (`/vault-correct policy [[topic]] "<text>"`) easier but loses the ability to mechanically apply.

Downstream complexity. Low. Policy file parses normally, consumers don't change. Just sees an edited policy.

Auditability. Excellent. Policy diff is visible (old vs. new domains). User rationale recorded.

Failure modes. **Override loss on /vault-policy --refresh.** If user runs refresh, the LLM-generated policy will likely re-omit Latacora. Mitigation: refresh must read existing corrections and re-apply (or surface them as user-overrides that survive regen). Spec gap in current policy skill — overrides apply at write-time but corrections don't.

Composes with /vault-challenge. Indirectly. Challenge reads policy; corrected policy steers challenge differently. No special-casing needed.

Composes with /vault-policy. Yes — policy is the target. Refresh must respect overrides.

### 4. Frontmatter overrides (single field)

Shape. `/vault-correct [[page]] --field <name> --value <value>`. Direct edit of one frontmatter field.

```
/vault-correct [[jwt-key-rotation]] --field verification --value full
/vault-correct [[jwt-key-rotation]] --field confidence --value low
/vault-correct [[jwt-key-rotation]] --field tags --add ops-practice
```

User burden. Low for advanced users (knows fields). High for novices (must know the schema).

Downstream complexity. Zero. Same fields, same parsers.

Auditability. Medium. Field changes leave no trace by default — would need a `corrections_log:` to record (field, old_value, new_value, date, rationale).

Failure modes. **Silent semantics drift.** Setting `verification: full` when there's no actual verification fakes audit trail. Mitigation: any frontmatter override must carry `--reason "<text>"` that gets logged.

Composes with /vault-challenge. Indirectly. Different frontmatter steers challenge differently; no new logic.

Composes with /vault-policy. Limited. Policy is a separate file; frontmatter override is scoped to one page's frontmatter.

### 5. Pure annotation (text only)

Shape. `/vault-correct [[page]] "<note>"`. Appends timestamped note to `## User notes` section. No semantic effect — just text downstream consumers MAY read.

User burden. Very low. Free-form.

Downstream complexity. Zero. Optional read.

Auditability. Good. Timestamps + user-source explicit.

Failure modes. **No behavioral effect.** User says "rotate weekly" — `/vault-challenge` still re-confirms 90-day cadence and never sees the note. Lint scores the page on cite-density without ever consuming the correction. Pure annotation is the lowest-friction option but has near-zero teeth.

Composes with /vault-challenge. Doesn't (unless challenge is updated to read annotations as side context).

Composes with /vault-policy. Doesn't.

### 6. Action-typed corrections (verb-prefix vocabulary)

Shape. `/vault-correct [[page]] <VERB> "<text>"` with controlled verb set.

```
/vault-correct [[jwt-key-rotation]] OVERRIDE "90-day cadence wrong, we rotate weekly"
/vault-correct [[jwt-key-rotation]] ADD "JWK fallback variant in alg-confusion missing"
/vault-correct [[jwt-key-rotation]] RETIRE "claim about RS256 default no longer current"
/vault-correct policy "jwt" CORRECT-POLICY "add latacora.com to authoritative"
```

Verbs. `OVERRIDE` (correct existing claim), `ADD` (add missing context), `RETIRE` (mark obsolete), `CORRECT-POLICY` (route to policy file edit).

Storage. Each correction goes into `corrections:` frontmatter with `action:` field:

```yaml
corrections:
  - action: OVERRIDE
    text: "90-day cadence wrong, we rotate weekly"
    rationale: "Run JWT rotation at 3 companies; NIST is the floor."
    date: 2026-04-23
  - action: ADD
    text: "JWK fallback variant in alg-confusion missing"
    date: 2026-04-23
```

User burden. Low. Verb is one short word; user picks from 4-5 options.

Downstream complexity. Medium. Each verb implies behavior:
- `OVERRIDE` → challenge skips this claim, lint trusts it.
- `ADD` → render as supplementary section, challenge can probe it.
- `RETIRE` → challenge marks original as superseded, freshness re-scored.
- `CORRECT-POLICY` → routes to policy file (composite skill).

Consumers must dispatch on `action`. ~20 lines per skill.

Auditability. Excellent. Action-typed log is human-readable and machine-dispatchable. `## User corrections` section rendered as: `(OVERRIDE 2026-04-23): 90-day cadence wrong...`

Failure modes. **Verb taxonomy can be wrong.** If `RETIRE` and `OVERRIDE` semantically overlap users get confused. Mitigation: 4 verbs max, each with a clear example in `/vault-correct --help`. **Action-claim coupling.** OVERRIDE without naming which claim is ambiguous — solved if OVERRIDE always takes the original claim as second positional arg (`OVERRIDE "<orig>" "<correction>"`). Pushes UX back toward option 2.

Composes with /vault-challenge. Cleanly. Challenge dispatches on `action`:
- `OVERRIDE` claim removed from challenge pool, marked as user-anchored.
- `ADD` claim treated as new claim, challengeable like a researched one.
- `RETIRE` original claim demoted, freshness flagged.

Composes with /vault-policy. Yes via `CORRECT-POLICY` verb. Routes to policy file.

### 7. Multi-target (page + policy + propagation)

Shape. Single command corrects page AND policy AND propagates downstream.

```
/vault-correct [[jwt-key-rotation]] --propagate
  OVERRIDE "rotation cadence" "weekly not 90-day"
  POLICY "add latacora authoritative"
```

Skill walks all related pages (cross-linked from corrected page), surfaces them, asks user which to also correct.

User burden. High mental model. User must understand propagation semantics and confirm propagation per related page.

Downstream complexity. High. Skill must:
- Walk wikilink graph from corrected page.
- Identify which related pages contain the same claim.
- Show diff per page, ask confirm.
- Apply corrections atomically.

Auditability. Good if all corrections share a `correction_id` linking them. Hard otherwise.

Failure modes. **Propagation drift.** Same factual correction applied to 5 pages with slightly different phrasing — corrections diverge over time on each page. **Atomic-write hazard.** If 3 of 5 page-edits succeed and 2 fail, vault is inconsistent. **User overwhelm.** "Confirm correction on each of 7 related pages?" — high friction.

Composes with /vault-challenge. Yes but challenge needs to know which pages share a `correction_id`.

Composes with /vault-policy. Yes — multi-target is the only shape that does this cleanly.

## Scoring table

| # | Shape | User burden | Downstream complexity | Auditability | Failure modes | Composes with /challenge | Composes with /policy |
|---|---|---|---|---|---|---|---|
| 1 | Page-level blob | Very low | Low | Medium | Drift (no claim-target) | Awkward | No |
| 2 | Claim-level diff | Medium | Medium-high | Excellent | String-match brittle | Cleanly | No |
| 3 | Policy override | Low-med | Low | Excellent | Lost on --refresh | Indirect | Yes (target) |
| 4 | Frontmatter override | Low (advanced) | Zero | Med (without log) | Silent semantics drift | Indirect | Limited |
| 5 | Pure annotation | Very low | Zero | Good | No teeth | No | No |
| 6 | Action-typed verbs | Low | Medium | Excellent | Verb taxonomy risk | Cleanly | Yes (CORRECT-POLICY) |
| 7 | Multi-target | High | High | Good | Propagation drift, atomic-write | Yes (with id) | Yes |

Impact ÷ friction ranking:
1. **Action-typed verbs (#6)** — low burden, structured, dispatches cleanly to challenge + policy via verb routing.
2. **Page-level blob (#1)** — coarsest viable; lowest barrier; downstream compatibility OK if challenge learns to read corrections as ground-truth.
3. **Claim-level diff (#2)** — best auditability but verbosity friction kills adoption for ad-hoc use.
4. **Policy override (#3)** — solves the policy-correction sub-problem cleanly; orthogonal to page corrections.
5. **Frontmatter override (#4)** — useful as ESCAPE HATCH (`--field`) but should not be the default.
6. **Pure annotation (#5)** — fallback when nothing else fits; near-zero teeth.
7. **Multi-target (#7)** — too ambitious for v1; defer.

## Worked examples

### Example A — practitioner correction on cadence

User says: "the 90-day rotation cadence claim is wrong, in practice we rotate weekly."

- **#1 page-level**: `/vault-correct [[jwt-key-rotation]] "90-day cadence is wrong, in practice we rotate weekly"` — easy but doesn't pin which claim. Challenge may re-confirm 90-day.
- **#2 claim-level**: `/vault-correct [[jwt-key-rotation]] --claim "Rotate signing keys every 90 days per NIST SP 800-57" --correction "In practice high-traffic issuers rotate weekly"` — precise but verbose. User has to copy-paste the original claim.
- **#6 action-typed (RECOMMENDED)**: `/vault-correct [[jwt-key-rotation]] OVERRIDE "rotate weekly, not 90-day" --rationale "Run JWT rotation at 3 companies; NIST is the floor."` — short, semantically rich. Challenge dispatches on `OVERRIDE`, removes 90-day from challenge pool, marks user-anchored.

Winner: #6. If second positional arg is an optional claim selector (`OVERRIDE "rotate weekly, not 90-day" --target-claim "90-day"`), it converges with #2 when precision needed and stays terse when not.

### Example B — policy correction on authoritative domain

User says: "Auth0 docs are not authoritative, please prefer Latacora."

- **#1 page-level**: doesn't fit — policy isn't a page.
- **#3 policy override (RECOMMENDED)**: `/vault-correct policy "JWT signing key rotation" --remove-domain "auth0.com" --add-domain "latacora.com" --reason "Auth0 is vendor-marketing; Latacora is practitioner-side authoritative."` — direct policy edit. Survives `/vault-policy --refresh` if refresh re-applies user overrides.
- **#6 action-typed**: `/vault-correct policy "JWT signing key rotation" CORRECT-POLICY "remove auth0, add latacora" --reason "..."` — verb-routed equivalent of #3. Cleaner if /vault-correct becomes the universal correction entry-point.

Winner: #6 with `CORRECT-POLICY` verb routing to a policy-edit dispatcher. Composes with #3's storage format.

### Example C — content addition (missing context)

User says: "the alg-confusion section misses the JWK fallback variant."

- **#1 page-level**: `/vault-correct [[jwt-alg-confusion]] "missing JWK fallback variant — fetched from URL the JWT specifies"` — works, but where does the addition slot in the page? Challenge can probe but rendering is unclear.
- **#6 action-typed (RECOMMENDED)**: `/vault-correct [[jwt-alg-confusion]] ADD "JWK fallback variant: signature verification falls back to a key fetched from URL specified in JWT header"` — explicitly ADD, rendered as `## Additions (user)` section, challengeable like any other claim.
- **#7 multi-target**: overkill — single page addition.

Winner: #6 ADD verb. Renders cleanly, gets challenged on next /vault-challenge run, no string-match brittleness because there's no original claim being modified.

## Recommendation

**Best 1-2 shapes: ship #6 (action-typed verbs) as the primary command and #3 (policy override) as one of its routed actions.**

Rationale.

- **#6 covers the page-correction surface area.** Four verbs (`OVERRIDE`, `ADD`, `RETIRE`, `CORRECT-POLICY`) span what users actually want to do. Verb taxonomy is small enough to not overwhelm. Verb is positional, so command stays terse.
- **#3 fits inside #6 as the `CORRECT-POLICY` verb.** No separate skill — `/vault-correct policy [[topic]] CORRECT-POLICY "<change>"` routes through the same dispatcher.
- **#4 (frontmatter override) is the escape hatch.** Add `--field <name> --value <val>` flag. Used rarely. Logged via `corrections_log:` so changes aren't silent.
- **#1, #2, #5, #7 are subsumed or deferred.** #1 is what #6 collapses to without the verb (degraded mode); #2 is what #6 OVERRIDE becomes when `--target-claim` is supplied; #5 is what /vault-correct without action is (rejected — force the verb); #7 is v2.

### Concrete invocation syntax

```
/vault-correct [[page]] <VERB> "<text>" [--target-claim "<orig>"] [--rationale "<reason>"] [--source <user|expert|primary>]
/vault-correct policy [[topic]] CORRECT-POLICY "<text>" [--add-domain X] [--remove-domain Y] [--add-risk-flag Z] [--rationale "<reason>"]
/vault-correct [[page]] --field <name> --value <val> --reason "<reason>"   (escape hatch)
```

Verbs (controlled vocab):
- `OVERRIDE` — correct an existing claim. Optional `--target-claim` for precision.
- `ADD` — add missing context. Renders as `## Additions (user)` section.
- `RETIRE` — mark a claim obsolete. Page section gets `## Retired claims` block; original kept for trace.
- `CORRECT-POLICY` — edit a policy file. Routes to policy dispatcher.

### Concrete storage format

In page frontmatter:

```yaml
corrections:
  - id: corr-2026-04-23-1
    action: OVERRIDE
    text: "rotate weekly, not 90-day"
    target_claim: "Rotate signing keys every 90 days per NIST SP 800-57"
    rationale: "Run JWT rotation at 3 companies; NIST is the floor."
    source: user
    date: 2026-04-23
  - id: corr-2026-04-23-2
    action: ADD
    text: "JWK fallback variant: verification falls back to URL-specified key"
    rationale: "Common bypass; missing from current page"
    source: user
    date: 2026-04-23
```

In page body:

```markdown
## User corrections

### OVERRIDE — 2026-04-23

> "rotate weekly, not 90-day"

Targets: "Rotate signing keys every 90 days per NIST SP 800-57"
Rationale: Run JWT rotation at 3 companies; NIST is the floor.
Source: user. Correction id: corr-2026-04-23-1.

### ADD — 2026-04-23

> "JWK fallback variant: signature verification falls back to a key fetched from URL specified in JWT header"

Rationale: Common bypass; missing from current page.
Source: user. Correction id: corr-2026-04-23-2.
```

In policy file (when `CORRECT-POLICY` used):

```yaml
corrections:
  - id: corr-2026-04-23-3
    action: CORRECT-POLICY
    field_changes:
      authoritative_domains:
        added: ["latacora.com"]
        removed: ["auth0.com"]
    rationale: "Auth0 is vendor-marketing; Latacora is practitioner-side authoritative."
    source: user
    date: 2026-04-23
```

### Downstream skill changes

- **/vault-challenge** reads `corrections:`. Dispatches per action:
  - OVERRIDE: skip the corrected claim from challenge pool. Mark as user-anchored in output ("HELD UP — user override, not challenged").
  - ADD: treat as new claim, challenge it like a researched one.
  - RETIRE: mark original as superseded, do not challenge it.
  - CORRECT-POLICY: read updated policy as steering signal (no special handling).
- **/vault-lint** quality dimensions:
  - D3 never-challenged: corrections do NOT count as a challenge. User assertion is not adversarial scrutiny.
  - New flag: pages with corrections older than 90 days that have not been re-challenged get YELLOW (corrections aged but never tested).
  - New rule: orphaned corrections (target_claim no longer matches page text) flagged RED.
- **/vault-policy --refresh**: must read existing `corrections:` from the policy file. Re-apply field changes after LLM regeneration. Surface conflict if regen contradicts a correction (user picks).

### Auditability + safety

- Every correction has unique `id`. Wikilinkable: `[[corr-2026-04-23-1]]`. Lint can flag a correction as orphaned, contradictory, or stale.
- `--rationale` REQUIRED for OVERRIDE, RETIRE, CORRECT-POLICY. Optional for ADD. (Adding context doesn't need justification; overriding does.)
- `--source` defaults to `user`. Other values: `expert <name>` (when correcting on behalf of cited expert), `primary <citation>` (when user is invoking a non-web primary source).
- Corrections never delete original content. OVERRIDE marks the original claim as user-anchored but keeps it visible in the synthesis; the page renders `(USER CORRECTED 2026-04-23)` next to the affected claim.
- /vault-correct itself does NOT auto-run /vault-challenge. Re-challenge is a separate user action.

### What's deferred (v2)

- **Multi-target propagation (#7).** Punt. Hard to do atomically; users can manually re-correct related pages until pattern proves out.
- **Cross-page correction graphs.** When two pages share a corrected claim, they should share a correction_id. v1 leaves this as user discipline; v2 can auto-detect via wikilink graph.
- **Correction expiry / TTL.** Some corrections age (post-cutoff developments may eventually appear in web). v2 adds `expires:` field; lint flags when corrections become testable on web.
- **Correction conflict resolution.** Two users correcting same page differently — out of scope (single-user vault).
- **/vault-correct --review [[page]]** read-only mode. Trivial; ship in v1 if cheap, defer if not.

### Anti-patterns to avoid

- **Auto-applying corrections without an audit trail.** Every change must log to `log.md` and be visible in page body, not just frontmatter.
- **Letting corrections silently override challenge.** Even OVERRIDE-marked claims should be re-challengeable on user request — corrections are strong defaults, not absolute truth.
- **Free-text without verb.** Force the verb. `/vault-correct [[page]] "stuff"` (no verb) is rejected with help text. Without verb, semantics are unrecoverable downstream.
- **Allowing CORRECT-POLICY to invent new policy fields.** Policy schema is fixed; corrections may only patch existing fields. Otherwise schema drift kills downstream consumers.

## Implementation-ready summary

Ship: `/vault-correct` as a single skill with verb-routed action dispatch. Verbs: `OVERRIDE | ADD | RETIRE | CORRECT-POLICY`. Storage: `corrections:` frontmatter array (page or policy file) + rendered `## User corrections` section with `(action — date)` headers. Each correction has an `id`, `rationale` (required for non-ADD), `source` (defaults `user`). Downstream changes: ~20 LOC each in /vault-challenge (action dispatch in step 4 classification), /vault-lint (new D3 carve-out + orphan-correction flag), /vault-policy --refresh (re-apply field changes after regen). Frontmatter `--field` flag is the escape hatch. Multi-target propagation deferred to v2.
