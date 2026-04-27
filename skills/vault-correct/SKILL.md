---
name: vault-correct
description: >
  User-as-source-of-truth correction channel for the current project's vault.
  First-class override path when web sources or training distribution are
  wrong, thin, or post-cutoff. Verb-routed action dispatch (OVERRIDE, ADD,
  RETIRE, CORRECT-POLICY) with mandatory three-tier trust declaration
  (CITED / PRACTITIONER / OPINION). Every correction generates an audit
  record at corrections/<page>-<ts>-<short-id>.md, indexed in the target
  page's frontmatter, rendered in body with tier label, logged. Mechanical
  hallucination check (contradiction detection across target + 1-hop
  neighbors, discrete user options) gates every write to defend against
  sycophantic acceptance. Vendor-marketing URLs auto-demote CITED to
  PRACTITIONER. Reversible via --revoke and --supersede; history never
  silently deleted. Use when user says: /vault-correct, "correct page",
  "override claim", "fix wrong claim", "add missing context",
  "retire obsolete claim", "policy override".
---

# vault-correct

User-as-source-of-truth channel. Web claims face challenge / policy / lint pressure; user claims face nothing. Skill closes that asymmetry: tier-declared, audited, contradiction-checked corrections that downstream skills (challenge / lint / output) consume.

Three failure modes defended: honest mistake (misremembered fact contradicting existing web source), bias drift (vendor-preference corrections accumulate), sycophantic loop (Claude rubber-stamps user override without surfacing existing source disagreement; naive "are you sure?" degrades per agentic-self-critique findings). Mechanism, not vibes: tiered trust, mandatory audit, structural hallucination check, density alarms, reversibility.

## Precondition

Active project subgraph at `~/.claude/vault/projects/<slug>/index.md`. Target page must exist at `pages/<page-slug>.md` for page-targeted verbs, or topic policy must exist at `raw/policy-<topic-slug>.md` for `CORRECT-POLICY`. Abort with clear error otherwise — never write a correction targeting a missing artifact.

## Inputs

Verb-routed dispatch. Verb is positional and mandatory; bare text without verb is rejected.

- **OVERRIDE** (correct existing claim):
  ```
  /vault-correct [[page]] OVERRIDE "<claim>" --rationale "<reason>" --tier <CITED|PRACTITIONER|OPINION> [--source <url>] [--target-claim "<exact text>"]
  ```
  `--target-claim` optional; pins which existing claim is being overridden (avoids fuzzy match later).

- **ADD** (add missing context):
  ```
  /vault-correct [[page]] ADD "<missing context>" --tier <CITED|PRACTITIONER|OPINION> [--source <url>] [--rationale "<reason>"]
  ```
  `--rationale` optional for ADD only — adding context doesn't need justification, overriding does.

- **RETIRE** (mark obsolete):
  ```
  /vault-correct [[page]] RETIRE "<obsolete claim>" --rationale "<reason>" --tier <CITED|PRACTITIONER|OPINION>
  ```
  Marks original claim as superseded; original kept for audit trace.

- **CORRECT-POLICY** (edit a policy file):
  ```
  /vault-correct policy [[topic]] CORRECT-POLICY "<override>" --rationale "<reason>" --tier <CITED|PRACTITIONER|OPINION> [--source <url>]
  ```
  Routes to `raw/policy-<topic-slug>.md` instead of a page. Field changes apply to policy frontmatter; correction record stored in `corrections/`.

- **Revoke** (lifecycle):
  ```
  /vault-correct --revoke <correction-id> --rationale "<why>"
  ```
  Flips correction `status` to `revoked`, records `revoked_reason`. Body strikethrough, never silent deletion.

- **Supersede** (lifecycle):
  ```
  /vault-correct --supersede <old-id> [args of new correction]
  ```
  Chains: new correction has `supersedes: <old-id>`; old gets `superseded_by: <new-id>` and `status: superseded`. Both files persist.

Not allowed:
- Bare `/vault-correct [[page]] "text"` (no verb) → rejected with help text.
- Missing `--tier` → rejected. No default tier; no auto-classification (sycophancy vector).
- Missing `--rationale` for OVERRIDE / RETIRE / CORRECT-POLICY → rejected.

## Execution model

Main context handles structural checks (slug, args, target verify, hallucination check). User adjudication on contradictions can't be delegated, so check stays in main. Agent spawned only for file-write orchestration.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Parse args: first positional = `[[page]]` / `policy [[topic]]` / `--revoke <id>` / `--supersede <id>`. Second positional (page/policy modes) = verb. Verb required for page/policy modes.
3. Validate verb: exact-match `{OVERRIDE, ADD, RETIRE, CORRECT-POLICY}`. No fuzzy match, no synonyms.
4. Validate tier: exact-match `{CITED, PRACTITIONER, OPINION}`. Reject if missing.
5. Validate rationale: required for OVERRIDE / RETIRE / CORRECT-POLICY; optional for ADD.
6. Verify target exists: page → `pages/<page-slug>.md`; policy → `raw/policy-<topic-slug>.md`; revoke/supersede → `corrections/*-<id>.md`.
7. Tier auto-demotion (vendor-marketing defense): if `--tier CITED` AND `--source` host matches vendor-marketing list (from existing `raw/policy-*.md` whose `risk_flags` includes `hype-cycle`/`vendor-marketing-heavy`, treating those policies' `blocklist_extra` as a vendor list), demote to PRACTITIONER and surface: "Source URL <host> on vendor-marketing list per [[policy-X]]. Tier auto-demoted CITED → PRACTITIONER. Continue, or supply independent citation?" Wait for explicit confirmation.
8. Generate `<short-id>` (8-char hex; e.g. `a3f24c91`).
9. **Hallucination check** (structural, mandatory before write):
   - Read target page + 1-hop wikilinked neighbors (pages that wikilink to target, pages target wikilinks to).
   - Scan for direct contradictions with proposed correction: sentence-level negation overlap ("X true" vs "X false"); numeric contradictions ("90 days" vs "weekly"); citation contradictions (different §/section numbers of same primary source).
   - If contradictions found, present discrete options (NOT free-form "are you sure"):
     ```
     Your correction: "<correction text>"
     Tier: <tier>
     Conflicts with [[<neighbor-slug>]]: "<exact quoted claim>" (cited: <source if present>).

     Resolutions:
       (a) apply  — you're right, page is wrong; proceed.
       (b) refine — both partially right; rewrite correction text.
       (c) defer  — file as `## Open / contradicts` annotation, don't apply yet.
       (d) cancel — correction is mistaken; abort.
     ```
   - Capture choice in `contradicts_existing` + extended `reason`.
   - No contradictions → proceed silently. No soft "is this right?" follow-up. Anchor critique to mechanism, not free-form doubt.
10. Soft check (ONE question, not a loop): triggers on `--tier OPINION` + `--confidence strong`, or `--tier CITED` + URL not WebFetch-verified (spot-check 200 OK; on 4xx/5xx surface and demote to PRACTITIONER unless user supplies alternative). One question, then proceed.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-correct write phase for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Verb: <OVERRIDE|ADD|RETIRE|CORRECT-POLICY|REVOKE|SUPERSEDE>
    Target: <pages/<page-slug>.md | raw/policy-<topic-slug>.md | corrections/<file>>
    Tier: <CITED|PRACTITIONER|OPINION>
    Correction id: <short-id>
    Rationale: "<reason>" (or null for ADD)
    Source URL: "<url>" (or null)
    Target claim: "<text>" (or null)
    Hallucination check: <clean | resolved:<a|b|c|d>>
    Tier demotion: <none | CITED→PRACTITIONER:vendor-marketing>

    Follow the full procedure in the vault-correct skill (steps 5-9). Return ONLY:
    - "Correction <short-id> written. Action: <verb>/<tier>. Target: [[<target>]]. Status: <active|superseded|revoked>. Hallucination check: <result>."
  """
)
```

**After:** Echo the agent's compact result verbatim. Add nothing.

## Procedure

### 1. Validate verb (mechanical gate)

Verb must be exact-match in `{OVERRIDE, ADD, RETIRE, CORRECT-POLICY}`. No fuzzy matching; no aliases; case-sensitive. Bare text without verb (e.g. `/vault-correct [[page]] "stuff"`) is rejected with help text:

```
Verb required. /vault-correct usage:
  /vault-correct [[page]] OVERRIDE "<claim>" --rationale "..." --tier <T>
  /vault-correct [[page]] ADD "<context>" --tier <T>
  /vault-correct [[page]] RETIRE "<claim>" --rationale "..." --tier <T>
  /vault-correct policy [[topic]] CORRECT-POLICY "<override>" --rationale "..." --tier <T>
Tier ∈ {CITED, PRACTITIONER, OPINION}. Tier mandatory.
```

### 2. Validate tier (mechanical gate + vendor demotion)

Tier in `{CITED, PRACTITIONER, OPINION}`. No default; no inference from input shape. Auto-classification rejected — sycophancy vector (Claude infers the flattering tier on ambiguity).

Vendor-marketing demotion: if tier is `CITED` AND `--source` URL host is on a vendor-marketing list (sourced from any `raw/policy-*.md` whose `risk_flags` includes `hype-cycle` or `vendor-marketing-heavy`, treating those policies' `blocklist_extra` as a vendor list), demote to `PRACTITIONER`. Record demotion explicitly in correction frontmatter (`tier_demoted_from: CITED`, `demotion_reason: vendor-marketing`). Surface to user before write.

### 3. Generate `<short-id>`

8-char hex, derived from `<page-slug>-<ISO-ts>` hash or random. Format: `a3f24c91`. Used in:
- Correction filename: `corrections/<page-slug>-<ISO-ts>-<short-id>.md`.
- Frontmatter index entry on target.
- Body footnote / annotation backref.
- Log line.

### 4. Hallucination check (structural)

Already performed in main context (step 9 of "Before spawning"). Agent reads the resolved outcome from its brief. Three possible results:
- **clean** — no contradictions found; proceed to write.
- **resolved:a** — user confirmed proceed; write with `contradicts_existing: [<neighbor-id>]` populated, full conflict logged in `reason`.
- **resolved:b** — user refined correction text; write the refined version, log the refinement in `reason`.
- **resolved:c** — defer; do NOT write a correction file. Append annotation to target page's `## Open / contradicts` section only. Log this as a deferral in log.md. Skip steps 5-7.
- **resolved:d** — cancel; abort entirely. No write. Log nothing.

The check is deterministic structural detection (contradiction scan), not free-form "is this right?" critique. Per agentic-self-critique findings, naive critique loops degrade in high-confidence regions; this design anchors critique to mechanism the model cannot sycophantically skip.

### 5. Write the correction file

Path: `~/.claude/vault/projects/<slug>/corrections/<page-slug>-<ISO-ts>-<short-id>.md` (or `<topic-slug>-...` for policy targets).

Defensively `mkdir -p ~/.claude/vault/projects/<slug>/corrections` before writing.

```markdown
---
id: <page-slug>-<ISO-ts>-<short-id>
timestamp: <ISO-8601>
action: <OVERRIDE|ADD|RETIRE|CORRECT-POLICY>
target: <pages/<page-slug>.md | raw/policy-<topic-slug>.md>
target_section: <synthesis | key-facts | frontmatter:<field> | full-page>
text: "<correction text verbatim>"
target_claim: "<exact text being overridden>" | null
original_text: "<text being replaced if applicable>" | null
rationale: "<reason>" | null   # null only allowed for ADD
tier: <CITED | PRACTITIONER | OPINION>
tier_demoted_from: <CITED | null>
demotion_reason: <vendor-marketing | null>
source: <url | null>
practitioner_context: "<1-2 sentences>" | null   # required for PRACTITIONER
confidence: <strong | weak | preference> | null   # required for OPINION
status: active
supersedes: <old-id | null>
superseded_by: null
revoked_reason: null
revoked_by: null
expiry_check: <ISO date>   # +6mo CITED, +12mo PRACTITIONER, null OPINION
contradicts_existing: [<neighbor-id> | ...] | []
challenged: null
author: user
---

## Original
> <original_text quoted, or null if pure addition>

## Correction
<correction text — full version, not truncated>

## Why
<rationale — full version. For ADD without rationale, write "User-supplied context, no rationale required for ADD verb.">

## Provenance
- Tier: <tier>
- Source: <url or "user (no external source)">
- Practitioner context: <text or n/a>
- Confidence: <strong|weak|preference or n/a>
- Tier demotion: <CITED→PRACTITIONER (vendor-marketing) or n/a>
- Hallucination check: <clean | resolved:a | resolved:b | resolved:c>
- Contradicts: [[<neighbor-slug>]] (claim: "<text>") | none
```

Field rules:
- `rationale: null` allowed ONLY when `action: ADD`. All other actions: rationale mandatory, write step aborts if missing.
- `source: <url>` required for `tier: CITED` (one of source/source_doc); skill aborts if absent.
- `practitioner_context` required for `tier: PRACTITIONER`; skill prompts if missing in args.
- `confidence` required for `tier: OPINION`; skill prompts if missing.
- `expiry_check` set mechanically by tier: CITED → today + 6mo, PRACTITIONER → today + 12mo, OPINION → null (no auto-expiry; preferences age but don't expire).

### 6. Update target frontmatter `corrections:` index

Append to target page's (or policy file's) frontmatter `corrections:` array. Two-part storage: index here, full record in `corrections/`.

```yaml
corrections:
  - id: <short-id>
    action: <verb>
    tier: <tier>
    timestamp: <ISO-8601>
    status: active
```

If field absent, create it. Never overwrite existing entries; always append. On supersede, the old entry's `status` flips to `superseded` in-place (do not delete the index line).

### 7. Insert / update target body section

Render correction visibly in target page body. Tier-specific format (display rules):

**CITED** → inline footnote at the relevant claim:
```markdown
<existing or replacement claim text>. [^c-<short-id>]

[^c-<short-id>]: Per [[corrections/<id>]] — user-cited correction (<source-url-host>, <date>).
```

**PRACTITIONER** → labeled annotation block:
```markdown
> **Practitioner note** ([[corrections/<id>]] · user · <date>): <correction text>
```

**OPINION** → dedicated `## Per-author preferences` section at end of page:
```markdown
## Per-author preferences

- ([[corrections/<id>]] · user · <date> · confidence: <strong|weak|preference>) <correction text>
```

Auto-render top 5 active corrections in `## User corrections` section near the top of the page (below `## Synthesis`):
```markdown
## User corrections

- (<verb> · <tier> · <date>) <correction text> — [[corrections/<id>]]
- ...
```
List newest 5 active entries. Older / superseded / revoked entries live in their correction files only, not in the body summary.

For RETIRE: original claim wrapped with `(RETIRED <date> per [[corrections/<id>]])` strikethrough; original text never deleted, only annotated.

### 8. Update index.md `## Corrections` section

Mirror the Hypotheses / Probes / Analogies pattern. Create section if missing.

```markdown
## Corrections

- [[corrections/<id>]] — <verb>/<tier> — [[<target-slug>]] — <YYYY-MM-DD>
- ...
```

MANDATORY: do not skip. Past bug across vault skills: orphaned files from missed index updates.

### 9. Append log.md

```
- <ISO-8601 timestamp> — CORRECT — [[<target-slug>]] — <verb>/<tier> — <short-id>
```

For revoke: `- <ts> — REVOKE — [[corrections/<id>]] — reason: <one-line summary>`.
For supersede: `- <ts> — SUPERSEDE — [[corrections/<old-id>]] → [[corrections/<new-id>]]`.

### 10. Return compact summary

```
Correction <short-id> written. Action: <verb>/<tier>. Target: [[<target>]]. Status: <active|superseded|revoked>. Hallucination check: <result>.
```

## Trust tier expiry + lifecycle

`/vault-lint` reads `expiry_check` timestamps and surfaces stale corrections:
- **CITED**: 6-month default. URLs rot, RFCs revise. Past expiry → YELLOW lint flag.
- **PRACTITIONER**: 12-month default. Lived experience drifts. Past expiry → YELLOW.
- **OPINION**: never expires. Always low-trust by tier; staleness is moot.

User runs `/vault-correct --revalidate <id>` (deferred to v2; until then user runs `--supersede` or `--revoke` with rationale "expired").

## Adversarial defenses

### Tier marking visible everywhere

Every output surface (page body, frontmatter index, /vault-output artifacts) carries the tier label. CITED gets footnote, PRACTITIONER gets labeled block, OPINION lives in dedicated section. No invisibility, no laundering surface. The reader sees "this is one person's claim, not researched evidence" without reading git log.

### Vendor-marketing auto-demote

CITED with `--source` host on a vendor-marketing list (per `risk_flags: hype-cycle` / `vendor-marketing-heavy` from existing policies) auto-demotes to PRACTITIONER. User notified before write. Demotion captured in `tier_demoted_from` + `demotion_reason`. Cannot be silently bypassed.

### Density alarms (read by /vault-lint, not enforced here)

- **Per-page**: > 5 active corrections on a single page → /vault-lint YELLOW. Structural smell of bias drift.
- **Per-vendor**: > 3 active corrections mentioning the same vendor across the vault without independent web sources of equal weight → /vault-lint YELLOW.
- **Per-tier**: > 50% of a page's active corrections are OPINION → /vault-lint YELLOW (page is becoming preference-heavy, not evidence-heavy).

This skill writes the corrections; `/vault-lint` reads them and flags. Never enforce density limits at write time — user authority stays absolute, lint surfaces the smell.

### /vault-challenge against CITED corrections

CITED corrections are testable claims; `/vault-challenge` pulls active CITED corrections from the page's `corrections:` index and runs them through the same falsification loop as web-sourced claims. PRACTITIONER and OPINION skip default challenge (can't web-falsify lived experience or preference) but get a softer "any web contradiction?" check.

When challenge weakens a correction: correction's frontmatter gets `challenged: <ISO-date>`, source page's `## Adversarial challenge` notes the weakening. User decides revoke vs qualify. /vault-correct itself does NOT auto-run /vault-challenge — re-challenge is a separate user action.

### Tier-mandatory; no auto-classification

Skill aborts if `--tier` missing. No default. No inference. The one-line cost (`--tier <name>`) preserves the discipline-forcing function of declaring "is this evidence or just preference?"

## Revocation

```
/vault-correct --revoke <correction-id> --rationale "<why>"
```

Process:
1. Read `corrections/*-<id>.md`. If not found, abort.
2. Update frontmatter: `status: revoked`, `revoked_reason: <rationale>`, `revoked_by: user` (or `web-evidence:<url>` if rationale references one).
3. Update target page's `corrections:` index entry: `status: revoked`.
4. Update target page body: wrap the correction's body annotation with strikethrough HTML (`<del>...</del>`) — leaves audit visible. Do NOT delete the annotation.
5. Append log.md: `- <ts> — REVOKE — [[corrections/<id>]] — reason: <one-line summary>`.

History never destroyed. Vault must answer "what did we believe at time T?" Even revoked corrections persist on disk; status flag distinguishes from active.

## Supersedes

```
/vault-correct --supersede <old-id> [args of new correction]
```

Process:
1. Read `corrections/*-<old-id>.md`. If not found, abort.
2. Run full new-correction flow (validate verb, tier, hallucination check, etc.) for the new correction args. Generate new `<short-id>`.
3. New correction frontmatter: `supersedes: <old-id>`.
4. Old correction frontmatter: `status: superseded`, `superseded_by: <new-id>`.
5. Target page body: old correction's annotation gets `(SUPERSEDED by [[corrections/<new-id>]] on <date>)` suffix; new correction rendered fresh per tier rules.
6. Both files persist on disk. Neither deleted.
7. Log.md: `- <ts> — SUPERSEDE — [[corrections/<old-id>]] → [[corrections/<new-id>]]`.

## Rules

- Verb mandatory. Bare text rejected with help. No fuzzy matching, no aliases.
- Tier mandatory. No default, no auto-classification. `{CITED, PRACTITIONER, OPINION}` exact match.
- Rationale mandatory for OVERRIDE / RETIRE / CORRECT-POLICY. Optional for ADD only — adding context doesn't need justification, overriding does.
- Never delete original page content. OVERRIDE annotates; RETIRE strikethroughs; revoke flips status without removing. Vault answers "what did we believe at time T".
- Corrections are TESTABLE claims, not gospel. `/vault-challenge` still runs against CITED corrections. User authority is strong default, not absolute truth.
- Vendor URL on `--tier CITED` → auto-demote to PRACTITIONER. Captured explicitly in `tier_demoted_from`. User notified before write.
- Hallucination check on every write. Structural contradiction detection across target + 1-hop neighbors. Discrete user options (apply / refine / defer / cancel) — never free-form "are you sure?". Mechanical, deterministic, sycophancy-resistant.
- Soft check is ONE question, not a loop. Triggers: OPINION + confidence:strong, or CITED + unverified URL. Then proceed.
- Two-part storage: full record at `corrections/<page>-<ts>-<short-id>.md`, lightweight index at target's frontmatter `corrections:` array. Audit case dominates over filesystem-simplicity.
- Display rules per tier (footnote / labeled block / dedicated section) — never strip the marker. /vault-output preserves tier labels in every artifact format.
- `expiry_check` set mechanically by tier (6mo / 12mo / null). /vault-lint reads timestamps; auto-expiry never enforced at write time.
- Density alarms surfaced by /vault-lint (per-page > 5, per-vendor > 3, per-tier > 50% OPINION) — never enforced here. User authority stays absolute; lint reveals smell.
- Revoke and supersede preserve history. No silent deletion. Both old and new files persist; status flags distinguish.
- Index update under `## Corrections` heading is non-skippable. Orphaned correction files break /vault-lint enumeration.
- /vault-correct does NOT auto-run /vault-challenge. Re-challenge is a separate user action.
- /vault-correct does NOT propagate corrections across pages. Multi-target propagation deferred to v2; users manually re-correct related pages until pattern proves out.
