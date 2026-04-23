#!/usr/bin/env node
// vault-session — SessionStart hook for the Claude Knowledge Vault.
//
// Behavior: if cwd (via git root → basename) has an initialized project subgraph
// at ~/.claude/vault/projects/<slug>/index.md, emit its index + overview + recent
// log entries as hidden session context. Otherwise exit silently.
//
// Keeps the injection bounded (~few KB) regardless of vault size.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveSlug } = require('./vault-slug');

const VAULT_ROOT = path.join(os.homedir(), '.claude', 'vault');
const PROJECTS_DIR = path.join(VAULT_ROOT, 'projects');
const LOG_TAIL_LINES = 5;
const MAX_INDEX_BYTES = 8 * 1024;    // 8 KB
const MAX_OVERVIEW_BYTES = 12 * 1024; // 12 KB

function readCapped(file, maxBytes) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(maxBytes);
      const n = fs.readSync(fd, buf, 0, maxBytes, 0);
      const { size } = fs.fstatSync(fd);
      const s = buf.slice(0, n).toString('utf8');
      return size > maxBytes ? s + `\n\n[...truncated, file is ${size} bytes]` : s;
    } finally { fs.closeSync(fd); }
  } catch (e) { return null; }
}

function tailLines(file, n) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-n).join('\n');
  } catch (e) { return null; }
}

const slug = resolveSlug();
const projectDir = path.join(PROJECTS_DIR, slug);
const indexPath = path.join(projectDir, 'index.md');
const hotCachePath = path.join(projectDir, '.hot-cache.md');

// Silent exit if project knowledge base isn't initialized.
if (!fs.existsSync(indexPath)) {
  process.exit(0);
}

const header = [
  `CLAUDE VAULT — active knowledge base for project: ${slug}`,
  `Location: ${projectDir}`,
  ``,
  `Treat the contents below as existing knowledge about this project. Reference wiki pages by their wikilinks when relevant. To add: /vault-save (chat → page), /vault-ingest (source → page), /vault-autoresearch (topic → 3-round loop). Health: /vault-lint. Refresh: /vault-update-hot-cache.`,
  `Raw sources auto-logged to raw/sources.jsonl on every WebFetch/WebSearch.`,
  ``,
];

// Prefer hot-cache if present — it's pre-distilled and token-bounded (< 2 KB).
// The LLM-curated hot-cache beats mechanically-truncated index+overview.
if (fs.existsSync(hotCachePath)) {
  const hot = readCapped(hotCachePath, 4 * 1024); // 4 KB ceiling even if cache grew
  if (hot && hot.trim()) {
    process.stdout.write(header.concat(['--- .hot-cache.md ---', hot]).join('\n'));
    process.exit(0);
  }
}

// Fallback: index + overview + log tail (full-fidelity but token-heavier).
const parts = header.concat(['--- index.md ---']);

const index = readCapped(indexPath, MAX_INDEX_BYTES);
if (index) parts.push(index);

const overviewPath = path.join(projectDir, 'overview.md');
if (fs.existsSync(overviewPath)) {
  const overview = readCapped(overviewPath, MAX_OVERVIEW_BYTES);
  if (overview && overview.trim()) {
    parts.push('', '--- overview.md ---', overview);
  }
}

const logPath = path.join(projectDir, 'log.md');
if (fs.existsSync(logPath)) {
  const tail = tailLines(logPath, LOG_TAIL_LINES);
  if (tail && tail.trim()) {
    parts.push('', `--- last ${LOG_TAIL_LINES} log entries ---`, tail);
  }
}

process.stdout.write(parts.join('\n'));
