#!/usr/bin/env bash
# CRDP — Claude Research & Development Plugin
# Installs: caveman (lite), GSD, and the Claude Knowledge Vault.
# Run: bash install.sh

set -e

CLAUDE_DIR="$HOME/.claude"
VAULT_DIR="$CLAUDE_DIR/vault"
SKILLS_DIR="$CLAUDE_DIR/skills"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS="$CLAUDE_DIR/settings.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo "CRDP — Claude Research & Development Plugin"
echo "============================================"
echo ""

# ── Prerequisites ────────────────────────────────────────────────────────────

command -v node >/dev/null 2>&1 || fail "node not found — install Node.js first"
command -v git  >/dev/null 2>&1 || fail "git not found"
command -v claude >/dev/null 2>&1 || fail "claude CLI not found — install Claude Code first"

mkdir -p "$SKILLS_DIR" "$HOOKS_DIR"

# ── 1. Caveman ───────────────────────────────────────────────────────────────

echo "── Step 1: Caveman (JuliusBrussee/caveman) ──"

# Install via Claude Code plugin system (github:JuliusBrussee/caveman)
if claude plugin list 2>/dev/null | grep -q "caveman"; then
  warn "caveman already installed — skipping"
else
  claude plugin add github:JuliusBrussee/caveman 2>/dev/null \
    && ok "caveman installed" \
    || warn "could not auto-install caveman — run: claude plugin add github:JuliusBrussee/caveman"
fi

# Apply lite config
CAVEMAN_CONFIG_DIR="$HOME/.config/caveman"
mkdir -p "$CAVEMAN_CONFIG_DIR"
cp "$SCRIPT_DIR/patches/caveman-config.json" "$CAVEMAN_CONFIG_DIR/config.json"
ok "caveman config set to lite mode"

# Append CLAUDE.md snippet if not already present
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"
if [ ! -f "$CLAUDE_MD" ] || ! grep -q "caveman lite" "$CLAUDE_MD"; then
  echo "" >> "$CLAUDE_MD"
  cat "$SCRIPT_DIR/patches/claude-md-snippet.md" >> "$CLAUDE_MD"
  ok "caveman lite instruction added to CLAUDE.md"
else
  warn "caveman lite instruction already in CLAUDE.md — skipped"
fi

# ── 2. GSD ───────────────────────────────────────────────────────────────────

echo ""
echo "── Step 2: GSD ──"

# Install via Claude Code plugin system
if claude plugin list 2>/dev/null | grep -q "gsd\|get-shit-done"; then
  warn "GSD already installed — skipping"
else
  claude plugin add github:gsd-build/get-shit-done 2>/dev/null \
    && ok "GSD installed" \
    || warn "could not auto-install GSD — run: claude plugin add github:gsd-build/get-shit-done"
fi
ok "GSD ready"

# ── 3. Vault skills ──────────────────────────────────────────────────────────

echo ""
echo "── Step 3: Claude Knowledge Vault ──"

for skill_dir in "$SCRIPT_DIR"/skills/vault-*/; do
  skill_name=$(basename "$skill_dir")
  dest="$SKILLS_DIR/$skill_name"
  mkdir -p "$dest"
  cp "$skill_dir/SKILL.md" "$dest/SKILL.md"
  ok "skill: $skill_name"
done

# ── 4. Vault hooks ───────────────────────────────────────────────────────────

for hook in vault-slug.js vault-session.js vault-session-end.js vault-source-logger.js; do
  cp "$SCRIPT_DIR/hooks/$hook" "$HOOKS_DIR/$hook"
  chmod +x "$HOOKS_DIR/$hook"
  ok "hook: $hook"
done

# ── 5. settings.json ─────────────────────────────────────────────────────────

echo ""
echo "── Step 4: settings.json ──"

if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

# Use node to safely merge settings
node - <<'EOF'
const fs = require('fs');
const path = require('path');
const settingsPath = path.join(process.env.HOME, '.claude', 'settings.json');
const raw = fs.readFileSync(settingsPath, 'utf8');
const s = JSON.parse(raw || '{}');

// env
s.env = s.env || {};
s.env.CAVEMAN_DEFAULT_MODE = 'lite';

// hooks
s.hooks = s.hooks || {};

// SessionStart
s.hooks.SessionStart = s.hooks.SessionStart || [];
const sessionHook = { type: 'command', command: `node ${process.env.HOME}/.claude/hooks/vault-session.js` };
if (!s.hooks.SessionStart.some(h => h.command && h.command.includes('vault-session.js'))) {
  s.hooks.SessionStart.push(sessionHook);
}

// PostToolUse (source logger)
s.hooks.PostToolUse = s.hooks.PostToolUse || [];
const sourceHook = {
  matcher: 'WebFetch|WebSearch',
  hooks: [{ type: 'command', command: `node ${process.env.HOME}/.claude/hooks/vault-source-logger.js` }]
};
if (!s.hooks.PostToolUse.some(h => JSON.stringify(h).includes('vault-source-logger'))) {
  s.hooks.PostToolUse.push(sourceHook);
}

// Stop
s.hooks.Stop = s.hooks.Stop || [];
const stopHook = { type: 'command', command: `node ${process.env.HOME}/.claude/hooks/vault-session-end.js` };
if (!s.hooks.Stop.some(h => h.command && h.command.includes('vault-session-end'))) {
  s.hooks.Stop.push(stopHook);
}

fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), { mode: 0o600 });
console.log('settings.json updated');
EOF
ok "settings.json patched"

# ── 6. Vault directory scaffold ──────────────────────────────────────────────

echo ""
echo "── Step 5: Vault scaffold ──"

mkdir -p "$VAULT_DIR/projects"
mkdir -p "$VAULT_DIR/shared/pages"
mkdir -p "$VAULT_DIR/shared/raw"

if [ ! -f "$VAULT_DIR/shared/index.md" ]; then
  cat > "$VAULT_DIR/shared/index.md" << 'MDEOF'
# Shared — Knowledge Base

Cross-project pages shared across all vault subgraphs.

## Pages

(none yet)
MDEOF
fi

# .obsidianignore — scaffold entry for shared/raw; projects add their own on /vault-init
OBSIDIAN_IGNORE="$VAULT_DIR/.obsidianignore"
if [ ! -f "$OBSIDIAN_IGNORE" ]; then
  echo "shared/raw" > "$OBSIDIAN_IGNORE"
  ok ".obsidianignore created"
elif ! grep -q "shared/raw" "$OBSIDIAN_IGNORE"; then
  echo "shared/raw" >> "$OBSIDIAN_IGNORE"
  ok ".obsidianignore updated"
else
  warn ".obsidianignore already has shared/raw — skipped"
fi

ok "vault scaffold ready at ~/.claude/vault/"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo -e "${GREEN}CRDP installed.${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code (hooks take effect on next session)"
echo "  2. Open Obsidian → File → Open folder as vault → ~/.claude/vault"
echo "  3. In a project folder: /vault-init"
echo "  4. /vault-help for the full command reference"
echo ""
