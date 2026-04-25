# Force-Bypass: Audit-Pull / Visibility Solutions

## Problem framing

Verification gate in `/vault-integrate` refuses pages without `verification: quick | full` frontmatter (or a `challenged:` field) unless caller passes `--force "<reason>"`. Each force-bypass appends an audit line to `log.md`:

```
- <timestamp> — INTEGRATE-FORCE — [[<page>]] — <reason>
```

Mechanism is sound on paper. Failure mode is human, not technical:

1. `log.md` is append-only. No one greps it proactively.
2. After ~30 days, `--force "rushed"` becomes muscle memory. Reasons collapse to noise ("ok", "skip", "later").
3. Integration "feels" verified because page is now wikilinked in 2-3 source pages — gate already passed, so no re-prompt.
4. The audit trail exists but is invisible. Discipline drift never surfaces until something breaks (contradicting page, stale claim shipped, citation cascade).

**Angle of this research**: AUDIT-PULL / VISIBILITY. Don't add new gates (push). Surface the existing audit data so user notices the slip retrospectively. The data is already there. The job is making it impossible to ignore.

Six designs evaluated below. Scoring across detection power, friction, effort, false-positive rate, behavior change.

## Design space

### D1. New `/vault-lint` dimension — D7 force-bypass rate

Add seventh quality dimension to `/vault-lint --quality`:

```
D7 — FORCE-BYPASS-PENDING: page has INTEGRATE-FORCE log entry AND no
subsequent CHALLENGE log entry. Score: 0.0 if force-bypassed and never
challenged after, 0.5 if force-bypassed but later challenged, 1.0 if
clean integration.
```

Project-level RED if `force-bypassed pages > 20%` of integrations in last 30 days.

Detection: per-page (D7 score) AND aggregate (project rate). Fires every `/vault-lint --quality` run.

Coupling with existing skill: parses `log.md` already (for INTEGRATE entries in D6 fallback). Cheap addition.

Implementation: ~30 line edit to `vault-lint/SKILL.md`. Add D7 to dimension table, composite formula, next-move map (`D7 → "Run /vault-challenge [[<page>]] to clear force-bypass debt"`).

### D2. New skill `/vault-audit`

Standalone skill focused on bypass and discipline drift. Reports:

- Total `INTEGRATE-FORCE` count last 30 days vs. last 7 days (trend).
- Top 5 most-recent force reasons (verbatim quotes, surfaces "lazy" reasons).
- Ratio force / clean integrations. Trend over time.
- Pages still unverified after force-bypass (no subsequent `CHALLENGE` or `verification:` field added).
- "Hall of shame": force reasons under 10 chars (proxy for muscle-memory).

Output: dated `AUDIT-REPORT.md` at project root. Optional `--reasons` flag dumps every force reason verbatim for review.

Detection: very strong — explicit, focused on the failure mode.

Implementation: 1 new skill, ~150 lines markdown. Reuses `log.md` parser pattern from `vault-lint`.

### D3. SessionStart hook injection

Hook reads `log.md` on every Claude Code session start in a vault project. If `INTEGRATE-FORCE` count last 7 days > 5 (or any other threshold), inject a warning into the system context:

```
WARNING: 7 force-bypassed integrations in last 7 days. Recent reasons:
"ok", "skip", "rushed", "later", "tbd". Consider /vault-audit or
/vault-challenge backlog before integrating more.
```

Detection: aggressive — fires on every session, can't be missed.

Friction: medium. Token cost on every session start. Risk of blindness if always-on.

Implementation: hook change in `~/.claude/hooks/`. Probably ~50 lines JS. Existing hook scaffolding is already there (vault-slug.js).

### D4. Stop hook nudge

When session ends (`Stop` hook), check if any `INTEGRATE-FORCE` entry was logged THIS SESSION AND no `CHALLENGE` ran on the same pages. If yes, print:

```
Session ending. You force-bypassed: [[page-a]], [[page-b]].
Suggest: /vault-challenge [[page-a]] before next integrate.
```

Detection: high for in-session drift. Catches the "I'll do it later" pattern at the moment it forms.

Friction: low. Once per session, only when triggered.

Implementation: hook change. Needs to track session-scoped state (which pages were force-bypassed in current session). Doable via a session-scoped state file in `~/.claude/state/<session-id>.json`.

### D5. `/vault-help` shows current force-bypass count

Append to `/vault-help` output (or to its skill metadata):

```
Vault status (current project):
- 12 pages, 3 force-bypassed (last 30d), 1 unchallenged after bypass.
```

Ambient awareness. User sees count whenever they ask "what vault commands exist".

Detection: weak — only fires when user invokes help, which is rare for power users.

Friction: zero.

Implementation: ~15 line edit to `vault-help` skill.

### D6. Hot-cache injection tile

`/vault-update-hot-cache` produces compact context distillation for SessionStart hook injection. Add a tile:

```
## Discipline tile
- 7 force-bypasses last 30 days (5 still unchallenged).
- Last 5 force reasons: "ok", "skip", "rushed", "later", "tbd".
```

Lives inside the existing hot-cache file — reuses the existing injection mechanism. Fires every session that loads the hot-cache.

Detection: strong, surfaces in default warm-up context.

Friction: low. Hot-cache already injected, this just adds bytes.

Implementation: edit to `vault-update-hot-cache` skill. ~30 lines. No new hook.

## Scoring table

| ID | Design | Detection | Friction | Effort | False-positive | Behavior change | Theater? |
|---|---|---|---|---|---|---|---|
| D1 | `/vault-lint` D7 dimension | High (per-page + aggregate) | Zero (opt-in via `--quality`) | 5-min edit | Low (signal is direct) | Medium — only fires when user runs lint | No |
| D2 | New `/vault-audit` skill | Very high (focused) | Zero (opt-in) | 1 new skill (~2h) | Low | Low — same problem as logs: nobody runs it proactively | YES (if not paired with push) |
| D3 | SessionStart hook injection | Very high (every session) | Medium (token cost, blindness risk) | Hook change (~1h) | Medium (threshold tuning) | High — unavoidable warning | No |
| D4 | Stop hook nudge | High (in-session drift) | Low (once per session) | Hook change + state file (~2h) | Low (only when force happened this session) | High — fires at moment of slip | No |
| D5 | `/vault-help` ambient count | Low (only when help invoked) | Zero | 5-min edit | Low | Very low — passive, easily ignored | YES |
| D6 | Hot-cache discipline tile | High (default warm-up) | Low (bytes in cache) | 30-min edit | Low | Medium-high — visible in default context | No |

### Scoring rationale

**D1 (lint dimension)** — clean. Reuses existing surface, adds per-page granularity. Force-bypass becomes a quality penalty visible in RED/YELLOW/GREEN tally. User already runs lint; this rides the existing habit. The downside: only fires when user runs `--quality`, which they may not do for weeks. But the data lives in the report once they do — no new mechanism to forget about.

**D2 (new skill)** — solves the "I want to audit" use case but suffers the same disease as the original gate: no one invokes audit proactively. Builds a beautiful diagnostic dashboard nobody opens. Strong if PAIRED with a push (D3/D4/D6 surface the audit, D2 lets user dig in). Standalone — theater.

**D3 (SessionStart hook)** — most aggressive. Token cost is real. Threshold tuning is critical: too low → constant nag, user disables. Too high → never fires. If fired, very likely to change behavior because impossible to ignore. Risk of "warning fatigue" — if user can't act on it (e.g., mid-flight on different task), warning becomes background noise within 2-3 sessions.

**D4 (Stop hook)** — surgical. Only fires when there's actual evidence of slipping discipline IN THE CURRENT SESSION. False-positive rate near zero. Catches the moment the user forms the "I'll challenge later" thought. Strongest behavior-change candidate per dollar of friction. Implementation slightly nontrivial (session state tracking).

**D5 (vault-help)** — pure theater. Power users never run help. Ambient counts that nobody reads = log.md problem on a different surface.

**D6 (hot-cache tile)** — clever. Hot-cache is already injected by SessionStart hook for warm-up. Adding a discipline tile costs ~5 lines of context and rides the existing injection mechanism. Visible in default context every session that loads the cache — no new hook, no new opt-in. Behavior change depends on whether user reads the hot-cache; many do skim it. Probably medium-high in practice.

## Recommendation

**Best 1-2 from this angle**:

### Primary: D4 (Stop hook nudge)

Strongest signal-to-friction ratio. Fires only when discipline actually slipped IN THE CURRENT SESSION. Catches the user at the moment of "I'll challenge it later" before that thought decays into log noise. Behavioral change is direct and contextual: the suggested next-move (`/vault-challenge [[page]]`) is one keystroke away while the page is still mentally fresh.

False-positive rate is structurally low — the trigger is the user's own action in the same session, not a stale aggregate.

### Secondary: D6 (hot-cache discipline tile)

Pair with D4 for both in-session catch (D4) and cross-session ambient awareness (D6). D6 surfaces the longer-term pattern — "you've been force-bypassing for 3 weeks straight" — at the moment the user starts a new session with the project, when re-orientation is happening anyway. Reuses existing injection mechanism; no new hook. Cost is negligible (a few lines of context).

D4 + D6 = catch-in-the-act + ambient-pattern. The combination addresses both the proximate slip (D4: today's force) and the cumulative one (D6: this month's count).

### Honorable mention: D1 (lint D7)

Worth doing as a 5-minute edit because it costs almost nothing AND it surfaces force-bypass as a quality issue at the per-page level (not just aggregate). But D1 alone is theater — depends on user running `--quality`.

### Honest theater calls

- **D2 (new audit skill)**: theater unless paired with push. Building a focused dashboard nobody opens reproduces the original problem. The only path where D2 isn't theater: D3 or D6 says "discipline slipping, run /vault-audit" — then D2 is the deep-dive surface, not the discovery surface.
- **D5 (vault-help count)**: theater. Power users don't read help.

### What this angle CAN'T solve

Audit-pull surfaces past slips. It does not change the in-the-moment cost of typing `--force "ok"`. If the user is slipping because the gate is too easy, audit-pull alone won't fix it — that needs a push-side intervention (require longer reasons, randomize prompts, escalating delay, etc., which are out of scope for this angle).

The strongest audit-pull design (D4) is fundamentally a NUDGE. It assumes the user wants to maintain discipline and just needs reminding. If the user doesn't want to maintain discipline, no amount of visibility helps.

## References

- `/Users/lucafuccaro/.claude/skills/vault-integrate/SKILL.md` — verification gate definition (step 0), `INTEGRATE-FORCE` log format (step 7).
- `/Users/lucafuccaro/.claude/skills/vault-lint/SKILL.md` — quality dimensions D1-D6, composite formula, traffic-light grading. D7 would extend this. Existing log.md parser in D6 fallback path.
- `~/.claude/hooks/vault-slug.js` — existing hook infrastructure for SessionStart / Stop integration (D3, D4, D6).
- Audit trail: `log.md` per project at `~/.claude/vault/projects/<slug>/log.md`. Append-only. Format: `- <iso-timestamp> — <ACTION> — <details>`.
