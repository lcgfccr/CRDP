# /vault-correct: propagation contract design

Scope: research only. Designs how user corrections flow through the 7 consuming vault skills.

---

## 1. Problem framing

`/vault-correct` lets the user inject ground-truth knowledge or override wrong claims on a vault page. Without a propagation contract, corrections are decorative — they sit in frontmatter while downstream skills (challenge, integrate, lint, output, autoresearch) read original page text and ignore them. Three failure modes:

- **Silent ignore** — challenge stress-tests a corrected claim as if uncorrected. Outputs cite stale assertions. Lint penalizes pages whose policy gaps the user already filled.
- **Cascade staleness** — page A corrected, but pages B/C/D that integrated A's findings still carry pre-correction blockquotes. Compound loop becomes regression.
- **Conflict opacity** — autoresearch finds counter-evidence to a correction. Integrate proposes an edit that contradicts a correction. No mechanism flags it; user trust erodes.

The contract must specify, per skill, exactly which fields get read, what behavior changes, and how conflicts resolve. Silent acceptance ("corrections override everything") is unsafe — corrections can be wrong (user mis-remembered, mis-typed). Silent rejection ("corrections are notes, not data") makes the feature useless.

### Assumed correction shape

From scope research, expect frontmatter on the page:

```yaml
corrections:
  - id: c-2026-04-22-01
    timestamp: 2026-04-22T15:30:00Z
    author: user
    action: OVERRIDE  # OVERRIDE | ADD | RETIRE | CORRECT-POLICY
    target: "claim-quoted-text-or-section-anchor"
    text: "what the user says is true instead"
    rationale: "optional one-line why"
    supersedes: null  # or prior c-id if user revised an earlier correction
```

Action semantics:
- **OVERRIDE** — replace a wrong claim. The original is wrong; treat correction as ground-truth.
- **ADD** — add knowledge the page is missing. Augments, doesn't replace.
- **RETIRE** — claim is no longer applicable (deprecated tech, superseded fact). Page should mark it dead.
- **CORRECT-POLICY** — applies to a `raw/policy-*.md` file: user contradicts the policy's assessment (wrong authoritative_domains, wrong evidence_standard, etc.).

### YOUR ANGLE recap

Each consuming skill needs: (a) which correction fields to read, (b) what behavior changes vs default, (c) default-on or flag-controlled, (d) trust-risk audit (user error injection).

---

## 2. Propagation per skill

### 2.1 /vault-challenge — adversarial falsification

**Default behavior change**: read `corrections:` before extracting claims from `## Synthesis` / `## Key facts`.

Per action-type:

- **OVERRIDE** — skip the original wrong claim. Substitute the correction text as the claim under test. The user's correction is itself a claim; stress-testing it is the right call. Annotate result: `## Adversarial challenge` entry says `claim source: user correction <c-id> <ts>` rather than `from ## Synthesis`.
- **ADD** — augment the claim list. Treat as claims #4 / #5 etc., subject to the 5-claim cap. Adversarial search runs normally.
- **RETIRE** — remove the claim from the testable set. Skip entirely; the user has declared it dead. Note in frontmatter `challenged_skipped: [<retired-claim-anchors>]`.
- **CORRECT-POLICY** — N/A; CORRECT-POLICY targets policy files, not synthesis pages.

**Counter-evidence vs ground-truth ambiguity**: corrections are stress-testable. A user can be wrong. Default = test the corrected version, not the original. Do not skip-without-test on OVERRIDE — that grants user infallibility. Test the new claim with the same rigor.

**`--respect-corrections` flag**: NOT default-on for skip behavior. Argument for default-on: corrections are user ground-truth, the whole point is they're authoritative. Argument for default-off: user might mis-correct; challenge is the safety net that catches it. **Recommendation**: default = test the correction (ground-truth-for-substitution but not for skip). Add `--trust-corrections` flag that skips OVERRIDE-corrected claims entirely without testing — escape hatch for explicitly trusted corrections (regulatory, expert-domain).

**Trust risk**: medium. User can OVERRIDE with hallucinated authority; challenge defaults catch it. RETIRE is the dangerous one — silently removes claims from oversight. Mitigate: surface RETIREd claims in challenge output as `## Retired by user (not tested)`.

**Behavior-change cost**: ~30 lines of skill text. New step "0.5 read corrections" before claim extraction; new action-typed routing in claim list assembly; new annotation in output section.

---

### 2.2 /vault-lint — D8 quality scoring

**Default behavior change**: corrections become a quality signal. Two integration options.

**Option A — D9 new dimension `D9_user_validated`**:
- Score: presence of `corrections:` with at least one OVERRIDE or ADD entry → 1.0; only RETIRE → 0.5; absent → 0.0.
- Weight: 0.05–0.10 stolen from existing dimensions.
- Penalty risk: pages without corrections get penalized for not having user attention, which is wrong — most pages won't have corrections.
- **Reject this option**. Corrections are sparse signal; adding D9 would dock pages for the absence of a thing most pages legitimately lack.

**Option B — D8 boost on CORRECT-POLICY**:
- If a policy file has CORRECT-POLICY corrections, the user has filled the policy gap. D8 calculation reads `policy_overrides:` and merges them into authoritative_domains / dissent_classes_required at compute time.
- Pages whose `quality_policy:` points to a corrected policy benefit from the corrected fields. No new dimension; existing D8 just becomes correction-aware.

**Option C — corrected pages exempt from RED on D8**:
- If a page has OVERRIDE corrections targeting the exact claim that failed D8 (e.g., wrong domain, wrong evidence type), suppress D8 demotion. Treat correction as user-validation that the policy mismatch is acceptable.
- Risk: user can OVERRIDE-bypass D8 demotion via hallucinated correction. Mitigate: only suppress demotion if correction has `rationale:` field non-empty (forces user to articulate why).

**Recommendation**: Option B + bounded Option C. Default-on for both. No D9. Lint reports show `(D8 adjusted: <N> policy corrections applied)` in `## Quality scores`.

**Trust risk**: medium. Option C is the load-bearing one — user can game compliance via correction. Mitigation via mandatory rationale + lint surfaces the suppression explicitly so audits can review.

**Behavior-change cost**: ~40 lines. New D8 sub-step reading `policy_overrides:`; new suppression rule in traffic-light demotion logic; new line in report format.

---

### 2.3 /vault-integrate — folding research into source pages

**Default behavior change**: when the research page being integrated contradicts a correction on the target source page, integrate refuses silently OR flags loudly.

**Conflict detection**: for each proposed edit on source page X, check X's `corrections:` field. If the new blockquote text contradicts an OVERRIDE correction (semantic check, not keyword) → conflict.

Three handling options:

**A. Refuse to integrate the contradicting claim**:
- Skip just that edit; integrate the rest.
- User-friendly: respects user authority by default.
- Risk: research with genuinely better evidence gets blocked silently. The whole point of research is updating beliefs.

**B. Integrate but flag with warning blockquote**:
```
> **Updated:** <finding text>. ⚠ Note: this contradicts user correction <c-id> from <ts> ("<correction text>"). Reconcile manually.
> See [[<research-slug>]].
```
- Both versions visible. User decides on next read.
- Risk: page becomes self-contradictory; trust in the page degrades.

**C. Show conflict, demand user decision per edit**:
- Diff display gains a new field: `CONTRADICTS user correction: ...` next to the edit.
- Confirmation prompt becomes: `Apply, skip, retire correction, or reconcile?`
- Most explicit, highest friction.

**Recommendation**: C (default) + B as fallback if user picks `apply` despite the conflict. Show the user the contradiction at the diff stage; if they apply anyway, the warning blockquote stays inline as an audit trail. Refuse-silent (A) is wrong — opacity is the failure mode.

**Cascade through compound loop**: when page A (corrected) is integrated into page B, the correction does NOT auto-propagate to B. B gets the research blockquote without the correction. Two design choices:

- **Pull-on-read**: B doesn't store the correction; future integrations affecting B re-check A's corrections at integration time. Stateless. Slow if A → B → C → D chains.
- **Push-on-correct**: when /vault-correct is run on A, scan integrated pages and flag downstream blockquotes referencing A. Add `> ⚠ Source [[A]] was corrected on <ts>; review this blockquote.` to B's section.

**Recommendation**: push-on-correct. /vault-correct knows which pages integrated A (read A's `integrated:` frontmatter). Walk the downstream graph one hop and flag. Don't auto-edit B's content — just annotate.

**Trust risk**: low-medium. Refusing to integrate contradicting research is the bigger risk (epistemic regression). Default to surfacing conflict, not blocking.

**Behavior-change cost**: ~50 lines. New step 0.5 (read source-page corrections); new conflict detection in step 3; new diff-display field; new push-on-correct step inside /vault-correct that walks downstream.

---

### 2.4 /vault-output — consumer-grade artifacts

**Default behavior change**: corrections take precedence in source-text extraction. Original page text is read but corrections supersede where they OVERRIDE.

**Per format**:
- **report**: findings are the load-bearing claims. OVERRIDE corrections substitute the original Key facts entry. Cite as `[[page-slug]] (per user correction <c-id>)`.
- **study-guide**: definitions and Q&A. ADD corrections become extra Q&A entries (`Q: <topic>` from correction text). OVERRIDE substitutes definitions.
- **comparison**: matrix cells. OVERRIDE substitutes; conflict if two pages' corrections disagree on the same dimension → flag in `## Where they differ` as `(corrections disagree)`.
- **timeline**: dated claims. RETIRE marks events as `~~struck through~~ — retired per user correction <c-id>`. ADD adds new events.
- **glossary**: term definitions. OVERRIDE substitutes; flag conflicts inline.

**Author notes section**: if any input page has corrections, output gains a top-of-document section:
```markdown
## Author notes

This output reflects user corrections on input pages:
- [[page-a]]: 2 corrections (1 OVERRIDE, 1 ADD) as of <ts>
- [[page-b]]: 1 correction (RETIRE) as of <ts>

See source pages for full correction history.
```

This is the consumer-grade transparency move. Reader knows the artifact embeds user-curated edits, not just web research.

**Citation format**: `(per user correction <ts>)` inline next to the substituted claim. Argument for: transparency. Argument against: clutter, weakens the reader's confidence (looks like the page is unstable). **Recommendation**: include for `--style detailed`, omit for `--style brief`, opt-in for standard via `--show-corrections` flag.

**Trust risk**: low. Output is read-only on the vault, doesn't write back. Worst case: a corrected output cites a hallucinated correction; reader can verify from source page.

**Behavior-change cost**: ~60 lines. New extraction step per format reading corrections; new `## Author notes` block; new citation-format flag.

---

### 2.5 /vault-autoresearch — multi-round research

**Default behavior change**: corrections become starting context AND verification target.

**Round 0.6 — read existing corrections** (after policy resolution):
- If topic overlaps with existing pages, read their `corrections:` frontmatter.
- OVERRIDE entries → treat as user-asserted ground-truth that the research must engage with. Not citeable as a source (user is not a citation), but informs query design.
- ADD entries → treat as known-knowns; don't waste rounds re-discovering.
- RETIRE entries → treat as known-deprecated; don't surface as live findings.

**Round 3 counter-evidence pass — corrections as candidate evidence**:
- For each strong claim the synthesis will rest on, check if any existing-page correction contradicts it. If so, that correction is counter-evidence. Cite as `(contradicted by user correction on [[page]] <ts>)` in `## Tensions & contradictions`.
- Distinct from web counter-evidence (which gets URL citations); user corrections get a special citation form.

**Refine `dissent_likely_locations`**: if user CORRECT-POLICY entries on a related policy file say "the policy missed X authoritative domain", autoresearch should add X to its dissent allowlist for that round.

**Verify research output against corrections before finalizing**: Round 3 step ~3.5: read all corrections from related pages. If any synthesis claim directly contradicts an OVERRIDE correction, the agent must either:
- Cite the correction in `## Tensions & contradictions` and explain why it's overridden, OR
- Revise the claim, OR
- Flag explicitly: `## Tensions & contradictions: this synthesis contradicts user correction <c-id> — research disagrees with user assertion.`

Don't silently override. Don't silently capitulate.

**Trust risk**: medium. Treating corrections as sticky "this is true" can ossify wrong assertions. Mitigate: round 3 verification step is defensive (forces explicit reconciliation, not silent agreement).

**Behavior-change cost**: ~70 lines. New round 0.6; new corrections-as-evidence step in round 3; new verification step before write.

---

### 2.6 /vault-policy — corrections to policy files

**The hardest case**. CORRECT-POLICY is the action-type that targets policy files specifically. Two design positions:

**A. Corrections are edits to the policy itself**:
- Stored inline in the policy's frontmatter as edits.
- `/vault-policy --refresh` regenerates the policy and discards corrections.
- Wrong: forces the user to re-correct after every refresh.

**B. Corrections are annotations alongside, persisted across regenerations**:
- Frontmatter field `policy_overrides:` survives refresh. Refresh writes new policy fields but preserves `policy_overrides:` with original timestamps.
- At policy-consumption time (autoresearch, lint D8, challenge), the consuming skill MERGES base policy + overrides:
  ```
  effective_authoritative_domains = base.authoritative_domains UNION overrides.add_authoritative
                                                                MINUS overrides.remove_authoritative
  ```
- Refresh detects when correction targets a field the new policy already covers (e.g., user added a domain in the override that the regenerated policy now includes natively) → `policy-refresh.md` summary suggests retiring the now-redundant correction.

**Recommendation**: B. Corrections as overrides preserved across regenerations. The policy is auto-generated; the corrections are user IP. Never destroy user IP on regeneration.

**Effective fields shape**:
```yaml
policy_overrides:
  add_authoritative_domains: ["foo.gov", "bar.org"]
  remove_authoritative_domains: ["spam.com"]
  evidence_standard_override: "peer-reviewed"  # supersedes base
  dissent_classes_required_add: ["regulatory"]
  rationale: "user knows from domain expertise that..."
  timestamp: 2026-04-22T...
```

**Trust risk**: low. Policy overrides are local to one project's policy file. Worst case: user mis-overrides, autoresearch uses wrong domain allowlist, returns thin results, escalation kicks in (already handled).

**Behavior-change cost**: ~80 lines. New frontmatter schema; new merge logic at policy-read time (in autoresearch, challenge step 2.5, lint D8); new `/vault-policy --refresh` preservation step.

---

### 2.7 /vault-help — surface area documentation

**Behavior change**: minor. /vault-help reference lists `/vault-correct` and notes its propagation contract in a one-liner. Add a "## Correction propagation" sub-section explaining what each skill does with corrections, so users understand the surface area.

**Trust risk**: zero. Read-only doc.

**Behavior-change cost**: ~20 lines. New section in vault-help.

---

## 3. Display in /vault-output and on-page reading

Two UX positions:

**A. Corrections visible to a reader of the page** (rendered as a `## User corrections` section):
- Argument for: transparency. Reader sees the edit history. Trust through visibility.
- Argument against: clutter; pages become noisy. Long-correction-history pages bury the synthesis under user notes.

**B. Hidden in frontmatter, surfaced only by tools** (lint reports, output `## Author notes`):
- Argument for: clean reading experience. Frontmatter is the audit trail; tools synthesize.
- Argument against: invisibility breeds distrust. Reader doesn't know the page is curated.

**Recommendation**: hybrid. Frontmatter is the canonical store. Page body gets a SHORT `## User notes` section auto-rendered from corrections (action + target + 1-line text + ts), max 5 entries shown, "see frontmatter for full history" if more. Auto-maintained by /vault-correct when corrections are added; never hand-edited.

This gives readers visibility without burying the synthesis.

---

## 4. Conflict resolution

### 4.1 Two corrections contradict each other (user changed mind)

Three options:

**A. Latest wins (timestamp-sorted)**:
- Simple. Implicit retirement.
- Risk: history loss. User can't recall what they used to think.

**B. Both visible, marked as superseded**:
- `supersedes:` field links new correction to old. Old is rendered struck-through in `## User notes`.
- All consuming skills read only non-superseded entries.
- Audit trail intact.

**C. Force user to retire old correction explicitly**:
- /vault-correct refuses if a new correction conflicts with an existing one until user runs `/vault-correct --retire <c-id>` first.
- Highest friction. Best correctness.

**Recommendation**: B by default + C for the OVERRIDE→OVERRIDE case (most likely user-changed-mind). New correction MUST set `supersedes: <prior-c-id>` if its target overlaps an existing correction. /vault-correct detects overlap and prompts: "this conflicts with c-2026-04-22-01. Retire that one (supersedes), or run alongside (parallel)? (s/p)".

### 4.2 Cascade conflicts (page A corrected, A integrated into B, B's blockquote now stale)

Already covered in 2.3. Push-on-correct annotation; never auto-edit downstream pages.

### 4.3 Correction conflicts with research (autoresearch contradicts a correction)

Already covered in 2.5. Round 3 verification step forces explicit reconciliation.

### 4.4 Multiple users (future) / multi-author corrections

Out of scope for v1. `author:` field exists in correction shape but not load-bearing. If multi-author becomes a thing, conflicts resolve via additional `author:`-aware rules (e.g., later author wins, or per-author trust score). Not designed now.

---

## 5. Concrete propagation table

| Skill | Reads | Default behavior | Flag-controlled | Trust risk | Skill-text cost |
|---|---|---|---|---|---|
| /vault-challenge | `corrections:` (target page) | OVERRIDE → substitute claim, test it. ADD → add to claim list. RETIRE → skip-with-note. | `--trust-corrections` skips OVERRIDE without testing | Medium (RETIRE removes claims from oversight) | ~30 lines |
| /vault-lint --quality | `corrections:` (all pages); `policy_overrides:` (policy files) | Option B: merge `policy_overrides:` into D8 calculation. Option C: suppress D8 demotion if OVERRIDE has rationale. | None default; `--no-correction-credit` to disable | Medium (D8 gameable via correction) | ~40 lines |
| /vault-integrate | `corrections:` (source pages); research page's `corrections:` if any | Detect conflict at diff stage; demand per-edit user decision; warning blockquote on `apply` | `--ignore-corrections` to disable conflict check | Low-medium (refuse-silent is the worse failure) | ~50 lines |
| /vault-output | `corrections:` (all input pages) | OVERRIDE substitutes; `## Author notes` block at top if any corrections; per-claim citation in detailed mode | `--show-corrections` toggle for inline citations | Low (read-only) | ~60 lines |
| /vault-autoresearch | `corrections:` (related pages); `policy_overrides:` (policy file) | Round 0.6 reads corrections as starting context; round 3 verifies output against corrections | `--no-correction-priors` to skip 0.6 | Medium (corrections can ossify) | ~70 lines |
| /vault-policy | `policy_overrides:` (own file) | Preserved across `--refresh`; merged at consumption time | `--refresh-discard-overrides` (rare, destructive) | Low (project-local impact) | ~80 lines |
| /vault-help | none | Documents the contract | none | Zero | ~20 lines |

**Total skill-text cost**: ~350 lines across 7 skills. Cost is real but bounded; concentrated changes in 4 skills (lint, integrate, autoresearch, policy).

---

## 6. Contract spec

### 6.1 Canonical correction schema

```yaml
corrections:
  - id: c-<YYYY-MM-DD>-<NN>     # stable id, monotonic per page
    timestamp: <ISO-8601>
    author: user                 # reserved for multi-author
    action: OVERRIDE | ADD | RETIRE | CORRECT-POLICY
    target: "<exact claim text>" | "<section anchor>" | "<frontmatter field>"
    text: "<correction content>"
    rationale: "<one-line why>"  # optional, but mandatory for D8 demotion suppression
    supersedes: c-<id> | null    # links to retired prior correction
```

### 6.2 Policy-overrides schema (separate from `corrections:`)

```yaml
policy_overrides:
  - id: po-<YYYY-MM-DD>-<NN>
    timestamp: <ISO-8601>
    author: user
    add_authoritative_domains: [...]
    remove_authoritative_domains: [...]
    evidence_standard_override: "<value>" | null
    dissent_classes_required_add: [...]
    dissent_classes_required_remove: [...]
    confidence_in_assessment_override: "<high|medium|low>" | null
    rationale: "<one-line why>"
    supersedes: po-<id> | null
```

Stored alongside `corrections:` on policy files. `corrections:` on a policy file uses `action: CORRECT-POLICY` and points to a `policy_overrides:` entry by id (so the user-facing log is in `corrections:` while the structured data is in `policy_overrides:`).

### 6.3 Skill behavior matrix (default vs flag)

| Behavior | Default | Override flag |
|---|---|---|
| challenge tests OVERRIDE claims | yes | `--trust-corrections` skips |
| challenge skips RETIRE claims | yes | `--no-skip-retired` tests them anyway |
| lint D8 reads policy_overrides | yes | `--no-correction-credit` ignores |
| lint suppresses D8 demotion on rationale | yes | `--no-correction-credit` |
| integrate detects correction conflicts | yes | `--ignore-corrections` |
| integrate annotates downstream on correct | yes (push-on-correct) | none — always-on annotation |
| output renders `## Author notes` | yes if any corrections | `--no-author-notes` to suppress |
| output cites corrections inline | only `--style detailed` | `--show-corrections` for any style |
| autoresearch round 0.6 reads corrections | yes | `--no-correction-priors` |
| autoresearch round 3 verifies vs corrections | yes | none — always-on (safety) |
| policy --refresh preserves overrides | yes | `--refresh-discard-overrides` (destructive) |
| /vault-correct page renders `## User notes` | yes (top 5) | `--hide-on-page` per correction |

### 6.4 Conflict resolution rules

1. **Two corrections same page, overlapping target**: new must `supersedes: <old>`. /vault-correct prompts on overlap detection. Default: supersedes (B); fallback: parallel (B-side-by-side).
2. **Correction vs research finding (integrate)**: surface conflict at diff stage. User decides per edit. If applied, warning blockquote stays inline.
3. **Correction vs autoresearch synthesis**: round 3 verification forces explicit reconciliation in `## Tensions & contradictions`.
4. **Correction vs lint policy compliance**: if rationale field non-empty, suppress D8 demotion. Audit trail in lint report.
5. **Cascade staleness**: push-on-correct annotation walks `integrated:` graph one hop. Doesn't auto-edit downstream blockquotes.

### 6.5 Trust-risk audit summary

Highest risk: RETIRE corrections (silently remove claims from oversight). Mitigation: challenge surfaces RETIREd claims as `## Retired by user (not tested)`; lint reports retire counts.

Second-highest: D8 demotion suppression via Option C. Mitigation: mandatory rationale; lint report shows `(D8 suppressed via correction <c-id>: <rationale>)`.

Third: cascade staleness. Mitigation: push-on-correct annotations.

All other risks: bounded by the explicit-reconciliation steps in challenge / autoresearch / integrate.

---

## 7. Recommendation

Ship the contract above with these defaults:

1. **Single canonical schema** — `corrections:` on every page, `policy_overrides:` only on policy files. Action-typed (OVERRIDE / ADD / RETIRE / CORRECT-POLICY) drives per-skill routing.
2. **Default-on propagation across all 7 skills** — corrections are useless if they require flags. The escape hatches are flags, not the propagation.
3. **Always-on safety**: round 3 autoresearch verification, integrate diff-stage conflict surfacing, policy-refresh override preservation. These three are non-negotiable. Other behaviors get flags.
4. **Push-on-correct cascade annotation** — /vault-correct walks `integrated:` graph one hop, annotates downstream blockquotes. No auto-edit; just a visible flag.
5. **`## User notes` rendered section** — top 5 corrections visible on page; full history in frontmatter. Hybrid UX.
6. **Mandatory `rationale:` for D8 suppression** — single mitigation that prevents the most likely abuse vector (game compliance via fake correction).
7. **`supersedes:` for conflict tracking** — both old and new visible; old is struck through. /vault-correct prompts on overlap.
8. **/vault-help documents the contract** — surface area is discoverable.

The propagation contract is the half of /vault-correct that gives the feature value. The capture half (/vault-correct itself writing corrections) is the easy part; this is where the design effort lives. Without this contract, /vault-correct is decorative.

Total estimated skill-text addition: ~350 lines across 7 skills. Concentrated in lint, integrate, autoresearch, policy. Single new dimension is **rejected** (D9 user-validated would penalize uncorrected pages, which is wrong).

End of design.
