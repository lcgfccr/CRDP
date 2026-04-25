#!/usr/bin/env node
// vault-session-end — Stop hook for the Claude Knowledge Vault.
//
// Runs when the Claude Code session ends. If the current project's vault
// subgraph is active, append a SESSION-END log entry noting how many new
// entries accumulated during the session, and nudge the user to refresh the
// hot-cache if enough has changed.
//
// Silent no-op if no active KB. Does NOT synthesize or mutate page content.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveSlug } = require('./vault-slug');

const VAULT_ROOT = path.join(os.homedir(), '.claude', 'vault');
const PROJECTS_DIR = path.join(VAULT_ROOT, 'projects');
const HOT_CACHE_STALE_THRESHOLD = 5; // log entries since last HOT-CACHE to trigger nudge

const slug = resolveSlug();
const projectDir = path.join(PROJECTS_DIR, slug);
const indexPath = path.join(projectDir, 'index.md');
const logPath = path.join(projectDir, 'log.md');

if (!fs.existsSync(indexPath) || !fs.existsSync(logPath)) process.exit(0);

let log;
try { log = fs.readFileSync(logPath, 'utf8'); } catch (e) { process.exit(0); }

const lines = log.split('\n').filter(l => l.trim());

// Idempotence: if the last log entry is already a SESSION-END, nothing
// meaningful happened in this session — don't append another one. Prevents
// the log from filling up with consecutive SESSION-END noise when the user
// opens and closes sessions without doing vault work.
const lastLine = lines[lines.length - 1] || '';
if (lastLine.includes(' SESSION-END ')) process.exit(0);

// Find last HOT-CACHE entry — count non-HOT-CACHE entries after it.
let lastHotCacheIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes(' HOT-CACHE ')) { lastHotCacheIdx = i; break; }
}
const entriesSinceCache = lastHotCacheIdx === -1 ? lines.length : (lines.length - 1 - lastHotCacheIdx);

// FORCE-NUDGE check: scan for INTEGRATE-FORCE entries in the current session
// window that have no subsequent CHALLENGE entry for the same page. Append up
// to 3 nudge lines BEFORE the SESSION-END line so the user sees a reminder to
// /vault-challenge any force-bypassed page they didn't get back to.
//
// Session window:
//  - if a prior SESSION-END exists, start at the line right after it
//  - else fall back to the last 6 hours of entries (best-effort)
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const NUDGE_CAP = 3;

let sessionStartIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes(' SESSION-END ')) { sessionStartIdx = i + 1; break; }
}
if (sessionStartIdx === -1) {
  const cutoffMs = Date.now() - SIX_HOURS_MS;
  sessionStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- (\S+)\s+—/);
    if (m) {
      const t = Date.parse(m[1]);
      if (!Number.isNaN(t) && t >= cutoffMs) { sessionStartIdx = i; break; }
    }
  }
}

const sessionLines = lines.slice(sessionStartIdx);
const forceEntries = []; // { page, idxInSession }
const challengeEntries = []; // { page, idxInSession }
for (let i = 0; i < sessionLines.length; i++) {
  const line = sessionLines[i];
  if (line.includes(' INTEGRATE-FORCE ')) {
    const m = line.match(/\[\[([^\]]+)\]\]/);
    if (m) forceEntries.push({ page: m[1], idx: i });
  } else if (line.includes(' CHALLENGE ')) {
    const m = line.match(/\[\[([^\]]+)\]\]/);
    if (m) challengeEntries.push({ page: m[1], idx: i });
  }
}

// For each force-bypassed page, check if a CHALLENGE for the same page came
// after it in the session. Keep most-recent N unchallenged entries.
const unchallenged = [];
for (let i = forceEntries.length - 1; i >= 0; i--) {
  const fe = forceEntries[i];
  const subsequentChallenge = challengeEntries.some(ce => ce.page === fe.page && ce.idx > fe.idx);
  if (!subsequentChallenge && !unchallenged.some(u => u.page === fe.page)) {
    unchallenged.push(fe);
    if (unchallenged.length >= NUDGE_CAP) break;
  }
}

const ts = new Date().toISOString();
const nudgeLines = unchallenged.map(u =>
  `- ${ts} — FORCE-NUDGE — force-bypassed [[${u.page}]] not challenged this session — consider /vault-challenge [[${u.page}]]`
);

let entry = `- ${ts} — SESSION-END — ${entriesSinceCache} log entries since last hot-cache`;
if (entriesSinceCache >= HOT_CACHE_STALE_THRESHOLD) {
  entry += ' — recommend running /vault-update-hot-cache';
}

try {
  const out = (nudgeLines.length ? nudgeLines.join('\n') + '\n' : '') + entry + '\n';
  fs.appendFileSync(logPath, out, { mode: 0o600 });
} catch (e) { /* silent — logging is best-effort */ }

process.exit(0);
