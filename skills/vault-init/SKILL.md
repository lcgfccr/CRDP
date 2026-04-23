---
name: vault-init
description: >
  Initialize a per-project Claude Knowledge Vault subgraph for the current folder.
  Creates ~/.claude/vault/projects/<slug>/ with index.md, log.md, overview.md, pages/, raw/.
  After running this, the vault's SessionStart hook auto-injects the project's
  knowledge base on every subsequent Claude Code session in this folder.
  Use when user says: /vault-init, "start a knowledge base for this project",
  "init vault here", "set up research vault".
---

# vault-init

Bootstrap a per-project knowledge-vault subgraph for the current working directory.

## Procedure

1. **Determine default slug**. The canonical resolution is handled by the shared slug resolver:
   ```
   node ~/.claude/hooks/vault-slug.js --resolve
   ```
   That command prints the currently-resolved slug for cwd (registry lookup → git root basename → cwd basename). Use this as the suggested default.

2. **Confirm or override slug with the user**. Show the user the resolved default. If the default is generic (e.g., `folder`, `code`, `project`, `desktop`, `src`, `tmp`) OR the user asks to override, ask for a better slug.

   - If the user keeps the default AND the default came from git root basename or cwd basename (not from the registry), no registry entry is needed — hooks will derive the same slug.
   - If the user picks a slug different from the default, you **MUST** write a registry entry so hooks can resolve it on every future session:
     ```
     node ~/.claude/hooks/vault-slug.js --write <chosen-slug>
     ```
     This prints the registry key used (the absolute path of the git root, or cwd if not a git repo). The registry lives at `~/.claude/vault/registry.json` — central, not littered in user project folders.

3. **Check for existing subgraph**. If `~/.claude/vault/projects/<slug>/index.md` already exists, STOP and tell the user — they may want to pick a different slug or use the existing subgraph.

4. **Create scaffold**:
   ```
   ~/.claude/vault/projects/<slug>/
   ├── index.md      # populated below
   ├── log.md        # populated below
   ├── overview.md   # populated below
   ├── pages/        # empty dir
   └── raw/          # empty dir (sources.jsonl auto-created by PostToolUse hook)
   ```

   Also ensure `~/.claude/vault/.obsidianignore` exists and contains `projects/<slug>/raw` (with the actual slug substituted) — this keeps raw round-notes and source snapshots out of the Obsidian graph view. Create the file if missing; append the line if the file exists but doesn't already contain it. Use explicit slug paths, not wildcards — Obsidian does not reliably support `*` in `.obsidianignore`.

5. **Populate seed files**. Ask the user ONE question: "In one sentence, what is this project about?" Then write:

   **index.md**:
   ```
   # <Project Name> — Knowledge Base

   <one-line answer>

   Scope: this subgraph accumulates everything Claude researches, reads, or synthesizes while working on this project. Update this index whenever a page is created or significantly changed.

   ## Pages

   (none yet — created via /vault-save, /vault-autoresearch, or explicit wiki-style authoring)

   ## Open questions

   - <let the user add these later, or seed with one if the user mentioned anything>
   ```

   **overview.md**: 2-3 sentences of evolving thesis that will be revised as knowledge accumulates. Seed it with the one-sentence description expanded.

   **log.md**:
   ```
   # Log

   - <ISO-8601 timestamp> — INIT — subgraph created for <slug> at <cwd>
   ```

6. **Confirm to user**: print the slug, registry key used (if any), vault path, and next-step commands:
   - `/vault-save [title]` — save current conversation as a wiki page
   - `/vault-ingest <path-or-url>` — synthesize an external source into a page
   - `/vault-autoresearch <topic>` — run a 3-round research loop
   - `/vault-query "<question>"` — disciplined Q&A against vault only
   - Open the vault in Obsidian: `open -a Obsidian ~/.claude/vault` (then File → Open folder as vault if first time)

## Safety rules

- NEVER overwrite an existing `index.md` or `overview.md` without explicit user confirmation.
- NEVER create the subgraph outside `~/.claude/vault/projects/` — reject `..` or symlink escape attempts.
- If cwd is already inside `~/.claude/vault/`, abort (can't nest a vault inside the vault).
- The registry write command is idempotent; re-running `--write <slug>` for the same cwd updates the entry.

## On token budget

This skill's job is only to CREATE the scaffold. Don't dump long content into the seed files. The initial overview.md should be ~3 sentences. Pages accumulate over time via other commands.
