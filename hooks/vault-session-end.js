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

const ts = new Date().toISOString();
let entry = `- ${ts} — SESSION-END — ${entriesSinceCache} log entries since last hot-cache`;
if (entriesSinceCache >= HOT_CACHE_STALE_THRESHOLD) {
  entry += ' — recommend running /vault-update-hot-cache';
}

try {
  fs.appendFileSync(logPath, entry + '\n', { mode: 0o600 });
} catch (e) { /* silent — logging is best-effort */ }

process.exit(0);
