#!/usr/bin/env node
// vault-source-logger — PostToolUse hook for WebFetch|WebSearch.
//
// Behavior: if the current project has an initialized knowledge base
// (~/.claude/vault/projects/<slug>/index.md exists), append one JSON line per
// URL or result to projects/<slug>/raw/sources.jsonl. Does nothing otherwise.
//
// Does NOT generate wiki pages. Raw log only — Claude must explicitly /vault-save
// or /vault-autoresearch to turn sources into synthesized pages.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveSlug } = require('./vault-slug');

const VAULT_ROOT = path.join(os.homedir(), '.claude', 'vault');
const PROJECTS_DIR = path.join(VAULT_ROOT, 'projects');

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) { return ''; }
}

// Claude Code feeds hook events as JSON on stdin. Parse defensively.
const raw = readStdinSync();
let event = {};
try { event = JSON.parse(raw); } catch (e) { process.exit(0); }

const slug = resolveSlug();
const projectDir = path.join(PROJECTS_DIR, slug);
const indexPath = path.join(projectDir, 'index.md');
if (!fs.existsSync(indexPath)) process.exit(0); // not an active project

const rawDir = path.join(projectDir, 'raw');
fs.mkdirSync(rawDir, { recursive: true });
const sourcesPath = path.join(rawDir, 'sources.jsonl');

const tool = event.tool_name || event.tool || '';
const input = event.tool_input || event.input || {};
const output = event.tool_response || event.output || event.tool_output || '';

const entries = [];
const now = new Date().toISOString();

if (tool === 'WebFetch') {
  const url = input.url || input.URL || null;
  if (url) {
    entries.push({
      ts: now, tool: 'WebFetch', url,
      prompt: typeof input.prompt === 'string' ? input.prompt.slice(0, 500) : undefined
    });
  }
} else if (tool === 'WebSearch') {
  const query = input.query || null;
  // Extract URLs from search results. Shape varies; scan for URL patterns.
  const text = typeof output === 'string' ? output : JSON.stringify(output || '');
  const urls = Array.from(new Set((text.match(/https?:\/\/[^\s"'<>)]+/g) || []).slice(0, 15)));
  entries.push({ ts: now, tool: 'WebSearch', query, result_urls: urls });
}

if (entries.length === 0) process.exit(0);

try {
  const line = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(sourcesPath, line, { mode: 0o600 });
} catch (e) { /* silent — logging is best-effort */ }
