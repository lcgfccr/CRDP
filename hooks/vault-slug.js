// vault-slug — shared slug-resolution logic for all vault hooks.
//
// Resolution order:
//   1. Registry lookup — ~/.claude/vault/registry.json maps absolute path → slug.
//      Tries the git root first (stable across cd into subdirs), then cwd.
//   2. Git root basename, slugified.
//   3. Cwd basename, slugified.
//
// The registry is maintained by the /vault-init skill. Hooks are read-only
// against it and silent-fail on any corruption.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const VAULT_ROOT = path.join(os.homedir(), '.claude', 'vault');
const REGISTRY_PATH = path.join(VAULT_ROOT, 'registry.json');

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function gitRoot(cwd) {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8'
    }).trim();
    return root || null;
  } catch (e) { return null; }
}

function readRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.projects && typeof data.projects === 'object') return data.projects;
  } catch (e) { /* no registry or corrupt — fall through */ }
  return {};
}

function resolveSlug(cwd) {
  cwd = cwd || process.cwd();
  let realCwd;
  try { realCwd = fs.realpathSync(cwd); } catch (e) { realCwd = cwd; }

  const root = gitRoot(realCwd);
  const realRoot = root ? (() => { try { return fs.realpathSync(root); } catch (e) { return root; } })() : null;

  // 1. Registry lookup — try git root first, then cwd.
  const registry = readRegistry();
  const tryKeys = [realRoot, realCwd].filter(Boolean);
  for (const key of tryKeys) {
    const entry = registry[key];
    if (entry && entry.slug) return slugify(entry.slug);
  }

  // 2. Git root basename.
  if (realRoot) return slugify(path.basename(realRoot));

  // 3. Cwd basename.
  return slugify(path.basename(realCwd));
}

function writeRegistryEntry(cwd, slug) {
  // Used by /vault-init indirectly (via bash). Not called by hooks.
  // Kept here so the slug-normalization is colocated.
  const realCwd = (() => { try { return fs.realpathSync(cwd); } catch (e) { return cwd; } })();
  const key = gitRoot(realCwd) ? fs.realpathSync(gitRoot(realCwd)) : realCwd;
  let data = { version: 1, projects: {} };
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') data = parsed;
    if (!data.projects || typeof data.projects !== 'object') data.projects = {};
    if (!data.version) data.version = 1;
  } catch (e) { /* start fresh */ }
  data.projects[key] = { slug: slugify(slug), updated: new Date().toISOString() };
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  const tmp = REGISTRY_PATH + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, REGISTRY_PATH);
  return key;
}

module.exports = { resolveSlug, slugify, gitRoot, readRegistry, writeRegistryEntry, REGISTRY_PATH };

// CLI mode for the /vault-init skill to invoke from bash:
//   node vault-slug.js --resolve               → prints resolved slug for cwd
//   node vault-slug.js --write <slug>          → writes registry entry for cwd with slug, prints the key used
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--resolve') {
    process.stdout.write(resolveSlug(process.cwd()));
  } else if (arg === '--write' && process.argv[3]) {
    const key = writeRegistryEntry(process.cwd(), process.argv[3]);
    process.stdout.write(key);
  } else {
    process.stderr.write('usage: vault-slug.js --resolve | --write <slug>\n');
    process.exit(2);
  }
}
