---
research_angle: in-flow friction (raise cost of --force at moment of invocation)
problem: vault-integrate --force becomes muscle memory; bypass gate defeated by habit
date: 2026-04-23
scope: design space evaluation, no implementation
---

# Force-Bypass: In-Flow Friction Solutions

## Problem framing

`/vault-integrate` has a verification gate. Pages without `verification: quick | full`
or a `challenged:` field get refused. Escape hatch: `--force "<reason>"` with a free-text
string. The reason field accepts anything — "smoke test", "in a hurry", "trusted source".

Failure mode is not the gate's logic. Logic works. Failure mode is **human**: free-text
reason has zero structural cost. Typing 3 words to bypass is faster than running
`/vault-challenge`. After ~30 days of use, the typing pattern becomes muscle memory.
Gate exists in code, defeated in practice.

This research focuses on **in-flow friction** — interventions that fire AT the moment
`--force` is invoked, raising the in-the-moment cost so habit formation is harder.
Out-of-scope: out-of-flow audits (lint reports), social/team interventions,
architectural redesigns of the gate itself.

The question is not "should --force exist" — it should, edge cases are real. The question
is "how do we make using it require thought every time, not just the first time."

## Design space (7 candidates)

### 1. Required justification template

Replace free-text `--force "<reason>"` with structured prompt. On invoke, ask:

- (a) why can't this page be challenged now? (text)
- (b) when WILL it be challenged? (date, mandatory ISO format)
- (c) what evidence would change your mind? (text)

Stored in page frontmatter as `force_pending:` block:
```yaml
force_pending:
  reason: "smoke test for downstream consumer"
  challenge_by: 2026-05-15
  falsifier: "if downstream emits warnings at parse time, page is wrong"
  forced_at: 2026-04-23T14:22:00Z
```

Pages with stale `force_pending` (past `challenge_by`) get flagged by lint, surfaced on
session start, etc. The structure forces the user to commit to a future obligation.

**Friction:** HIGH. Three required fields, one structured. Cannot be banged out in 3 words.
**User burden:** medium-high. Ten extra seconds per force. Genuine cost.
**Implementation:** medium. Add prompt flow to skill, add frontmatter schema, lint reads stale field.
**Effectiveness on Day-30 muscle memory:** STRONG. Muscle memory drives short patterns
(typing one canned phrase). Three structured prompts break the pattern — user can't autocomplete.
The `challenge_by` date is the killer field: forces a future commitment that becomes a debt.
**Tool fatigue risk:** medium. If user genuinely is in a hurry 5x in a row, they may abandon.
But honest: if you're force-bypassing 5x in a row, the tool is right to push back.

### 2. Force budget per session

First `--force` per session: easy (current free-text reason).
Second: requires reason >20 words AND must reference the prior bypass slug.
Third: blocked unless prior 2 bypasses have `force_pending.challenge_by` set in future.

Tracks force usage in session state (e.g. `~/.claude/vault/.session-state.json`).

**Friction:** progressive. Low for one-offs, high for streaks.
**User burden:** ZERO for legitimate single use. Crushing for spam-force pattern.
**Implementation:** medium-high. Need session state tracking, increment counter, decay
over session boundary. Plus the longer-reason validator. Plus the prior-bypass cross-check.
Lots of moving parts.
**Effectiveness:** TARGETED. Catches the failure mode directly — muscle memory IS streak
behavior. First force may be considered; tenth is reflex. Budget caps reflex.
**Tool fatigue risk:** low if budget thresholds reasonable. High if too tight.
Risk of users learning to "reset" by starting new session — need to detect that
(timestamp-based decay rather than session-id-based).

### 3. Double-confirmation with 7-day recap

On `--force`, before integrating: print recap of last 7 days of force-bypasses,
prompt for explicit "yes I understand" string (not just `y`).

```
You have used --force 6 times in the last 7 days:
  2026-04-22 — [[jwt-rotation]] — "smoke test"
  2026-04-21 — [[oauth-pkce]] — "trusted source"
  2026-04-21 — [[crl-revocation]] — "downstream needs it"
  ...

Type 'yes I understand the risk' to proceed:
```

**Friction:** LOW-MEDIUM. Recap is informational. Confirmation string is one extra line.
**User burden:** low (~5 seconds), but the recap is the actual intervention — visibility.
**Implementation:** low. Read log.md, grep INTEGRATE-FORCE entries from last 7 days, print.
Add stdin read for confirmation string.
**Effectiveness:** WEAK against muscle memory. The recap creates awareness once or twice.
By Day-30, user types `yes I understand the risk` as fast as `--force`. Confirmation string
becomes part of the muscle pattern.
**Tool fatigue risk:** low.
**Verdict:** mostly theater. Awareness without structural cost. Useful as augmentation,
not as primary defense.

### 4. Force categories (--force quick vs --force deep)

Two flag variants:
- `--force quick "<reason>"` — low-risk bypass (e.g. trivial page, cosmetic fix). Logged
  but minimal extra prompts.
- `--force deep "<reason>"` — explicit acknowledgment that bypass is high-risk. Triggers
  the structured-justification flow from option 1.

User self-selects category. Idea: forces conscious classification, may itself be the gate.

**Friction:** depends on category. Quick = low. Deep = high.
**User burden:** depends on user honesty. The trap: users will always pick `quick`.
**Implementation:** medium (two flag paths, two log markers).
**Effectiveness:** WEAK. Self-selection of risk level by the person doing the bypass is
the dark-pattern equivalent of "are you sure you're an adult? click yes." The lazy user
picks `quick` every time. Effectiveness depends entirely on the category being
*verified*, not self-reported. Without verification (e.g. page content scan to detect
contested claims), categories are an honor system that the muscle-memory failure mode
will defeat trivially.
**Tool fatigue risk:** low.
**Verdict:** structurally weak unless paired with auto-classification of page risk.

### 5. Inverted default

Make `--force` the default. Require `--no-force` or `--challenge-first` for the strict path.

**Friction (for force):** ZERO. That's the point — but inverted.
**Friction (for strict path):** opt-in tax.
**User burden:** Strict-path users now pay every time. Bypass users pay nothing.
**Implementation:** trivial flag rename.
**Effectiveness:** NEGATIVE. This is an honest dark-pattern test of "would users opt INTO
discipline" — answer is almost certainly no. Users do not opt into friction. The whole
point of the gate is that the *default* is the safe path; inversion sells out the gate's
purpose for cheap UX.
**Tool fatigue risk:** none — but the gate is now decorative.
**Verdict:** PURE THEATER. Useful only as a thought experiment. Inversion of defaults
is the entire failure mode of gate design — once defaulted to bypass, the gate doesn't
exist. Reject.

### 6. Time-cost (10-second pause)

On `--force`, print:
```
Force-bypassing verification gate for [[<slug>]].
Consider /vault-challenge first.
Proceeding in 10... 9... 8...
```

User can ctrl-C. No logic, just artificial delay.

**Friction:** real but mechanical. 10 seconds is enough to interrupt a flow but not
enough to make the user reconsider after Day-30.
**User burden:** medium. Ten seconds × N forces per week = real time cost.
**Implementation:** trivial. `setTimeout`/sleep + countdown print.
**Effectiveness:** MEDIUM short-term, WEAK long-term. Fresh users may ctrl-C and reconsider.
By Day-30, users tab away, do something else for 10 seconds, return. The pause becomes
a coffee break, not a friction event. Worse: users may train themselves to invoke `--force`
and switch tasks, returning later — which is the *opposite* of in-flow friction.
**Tool fatigue risk:** medium-high. Time-cost without information value is the most
hated friction class. Users feel punished, not informed.
**Verdict:** theater with negative externalities. Reject.

### 7. Diff-show before force (surface what's being ignored)

Even with `--force`, before writing: scan the page for contested/weakened/unfalsified
markers (from `## Adversarial challenge` if present, or claim-density heuristics if not).
Show them inline:
```
You are force-integrating [[jwt-rotation]] which has:
  - 2 WEAKENED claims (rotation cadence, JWKS schema compatibility)
  - 1 UNFALSIFIED claim (90-day baseline as universal)
  - No /vault-challenge run yet

Proceeding will integrate these into source pages. Continue? (y/N)
```

If page has *no* contested content, message is just: "No contested claims detected.
Proceeding."

**Friction:** INFORMATION-DENSE. The friction is the content, not the gate.
**User burden:** low — usually just a glance and `y`. The cost is psychological:
seeing the list of weak claims before merging them.
**Implementation:** medium-high. Need to parse `## Adversarial challenge` section,
extract HELD UP / WEAKENED / UNFALSIFIED labels. For pages without challenge sections,
need a fallback heuristic (e.g. flag claims without citations, count "may"/"might"/"likely"
hedge words).
**Effectiveness:** HIGH. This attacks the muscle-memory failure mode at its weakest
point — muscle memory works when the action is opaque. Surfacing what's being ignored
makes the action visible. Day-30 user typing `--force "trusted source"` now sees
"3 WEAKENED claims you're about to merge into 4 pages" and has to either dismiss it
consciously or back out. The information itself is the friction.
**Tool fatigue risk:** low. Information has positive value; friction is meaningful.
**Verdict:** STRUCTURAL. Aligns gate enforcement with information surfacing.

## Scoring table

| # | Solution | Friction | Burden | Impl effort | Day-30 effectiveness | Fatigue risk | Theater vs Structural |
|---|---|---|---|---|---|---|---|
| 1 | Required justification template (incl. challenge_by date) | High | Med-High | Medium | Strong | Medium | Structural |
| 2 | Force budget per session | Progressive | Zero→High | Med-High | Targeted | Low-Med | Structural |
| 3 | Double-confirmation with 7-day recap | Low-Med | Low | Low | Weak | Low | Theater (with awareness value) |
| 4 | Force categories (quick / deep) | Variable | Self-imposed | Medium | Weak (honor system) | Low | Theater unless auto-classified |
| 5 | Inverted default | Zero (force) | Inverted | Trivial | Negative | None | Anti-pattern. Reject |
| 6 | Time-cost pause | Mechanical | Medium | Trivial | Weak long-term | Med-High | Pure theater |
| 7 | Diff-show before force | Information | Low | Med-High | High | Low | Structural |

## Recommendation

**Best 1: Diff-show before force (#7).**
Best structural fit for the muscle-memory failure mode. Muscle memory thrives on opacity;
diff-show makes the action transparent. Information surfaced is genuinely useful — not a
punishment, a context window. Implementation is medium effort but the parsing piece
(`## Adversarial challenge` section) leverages an existing convention. The fallback
heuristic for un-challenged pages is the only real engineering risk.

**Best 2: Required justification template with challenge_by (#1).**
Complementary to #7, not redundant. #7 surfaces what's being ignored; #1 forces commitment
to addressing it. The `challenge_by` date is the structural innovation — every force
becomes a future debt with a due date. Lint can read these dates and surface stale
debts on session start. Free-text reason becomes a *structured* obligation. Combined
with #7, this is the strongest in-flow friction stack.

**Stack: #7 + #1.** Diff-show on invoke (the information layer) → structured prompt
including challenge_by date (the commitment layer) → write with `force_pending:` block
(the audit layer). All three layers fire in-flow at the moment of bypass.

**Honest theater calls:**
- #5 (inverted default): pure anti-pattern. Reject.
- #6 (time-cost pause): pure theater with fatigue risk. Reject.
- #3 (double-confirm with recap): theater, but the *recap* portion has independent value
  if surfaced once-per-session at session start (out-of-flow). Don't put it on every force.
- #4 (categories): honor system unless auto-classification is added. If implemented,
  the auto-classification IS just a worse version of #7. Reject in favor of #7.
- #2 (force budget): targeted but operationally complex. Could work as a v2 layer on top
  of #7 + #1 if usage data shows the stack alone isn't catching streak-bypassers. Defer.

## References

- /Users/lucafuccaro/.claude/skills/vault-integrate/SKILL.md (current force-flag impl,
  esp. step 0 verification gate at lines 57-76 and rule at line 177)
- /Users/lucafuccaro/.claude/skills/vault-integrate/SKILL.md line 72 — current
  log marker `INTEGRATE-FORCE — [[<research-slug>]] — <reason>` is the audit anchor
  any in-flow solution would extend
- Sibling research:
  /Users/lucafuccaro/Desktop/CRDP/research/vault-autoresearch-parallel-design.md
  /Users/lucafuccaro/Desktop/CRDP/research/vault-lint-quality-design.md
  (for lint integration of stale `force_pending` debts — out-of-flow companion to #1)
