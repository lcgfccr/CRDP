---
name: vault-save
description: >
  Save the current conversation (or a specific turn/idea from it) as a wiki page
  in the current project's Claude Knowledge Vault subgraph. Updates the project's
  index.md and appends a log entry. Use when user says: /vault-save,
  "save this conversation", "file this as a note", "save to the vault",
  "add this to the knowledge base".
---

# vault-save

Turn the current conversation into a durable wiki page inside the active project's subgraph.

## Precondition

The current folder must have an active knowledge base — i.e., `~/.claude/vault/projects/<slug>/index.md` must exist. If it doesn't, tell the user to run `/vault-init` first. Do NOT create the subgraph implicitly.

## Execution model

Runs in an isolated subagent — main conversation sees only the confirmation.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Capture title if user supplied one in the invocation; otherwise the agent will auto-generate.
3. Distill the conversation to save into a compact 3-6 sentence summary — the agent cannot read the full conversation history, so this summary is its only input for synthesis.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-save for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Title: <user-supplied title | "auto-generate">
    Conversation summary:
    <3-6 sentence distillation of the conversation — key insight, context, details, open questions>

    Follow the full procedure in the vault-save skill. Return ONLY:
    - File path written
    - Pages cross-linked (with wikilinks)
    - Any unresolvable wikilinks (candidates for new pages)
  """
)
```

**After:** Echo the agent's output verbatim. Add nothing.

## Procedure

1. **Identify active project**. Resolve slug via `node ~/.claude/hooks/vault-slug.js --resolve`. Verify `~/.claude/vault/projects/<slug>/index.md` exists.

2. **Determine title — default to auto-generated, no question asked**:
   - If the user passed a title in the invocation (e.g., `/vault-save webhook-idempotency`), use it.
   - Otherwise, auto-generate a title by distilling the conversation: pick a concise, specific noun phrase that names the durable idea (2-5 words, lowercase, slugified). Examples: "jwt-refresh-tokens", "retry-policy-tradeoffs", "postgres-row-estimate-bug". Do NOT ask the user to confirm — just pick a good title and report it. If the file would collide with an existing page, append a short disambiguator (e.g., `-v2`, `-2026-04`) rather than asking.
   - If the conversation is too short or generic to name ("hello", smalltalk only, no substance), THEN stop and warn the user instead of picking a bad title.

3. **Synthesize the page**. Do NOT dump the raw conversation. Write a clean, structured wiki page distilled from the conversation, following this template:

   ```markdown
   ---
   title: <title>
   created: <ISO-8601 date>
   source: conversation
   tags: [<extracted topic tags>]
   verification: none
   ---

   # <title>

   ## Summary

   <2-4 sentences — the key insight from the conversation>

   ## Context

   <why this came up, what problem it solves>

   ## Details

   <structured body — use subsections if the conversation covered multiple angles. Keep code snippets exact. Preserve URLs.>

   ## Open questions

   <anything that surfaced but wasn't resolved>

   ## Related

   <wikilinks to other pages, e.g., [[existing-page]], or "(none yet)">
   ```

4. **Choose a filename**. Slugify the title → `projects/<slug>/pages/<title-slug>.md`. If a file with that name already exists, ask the user: overwrite, append, or pick a new name?

5. **Update index.md**: add a line under the `## Pages` section:
   ```
   - [[<title-slug>]] — <one-line description>
   ```
   Keep the index alphabetically sorted within the Pages section.

6. **Append to log.md**:
   ```
   - <ISO-8601 timestamp> — SAVE — [[<title-slug>]] — <one-line description>
   ```

7. **Scan for wikilink opportunities**. Before finishing, check if terms in the new page appear in other pages' titles within this project's `pages/` dir. If so, convert those mentions into `[[wikilinks]]` both in the new page AND add backlinks (a "Related" line) to the other pages when appropriate. Touch at most 5 other pages per save — anything more should go through /vault-lint later.

8. **Confirm to user**: report the file path, the pages cross-linked, and any wikilinks not yet resolvable (candidates for new pages).

## Rules

- Never save secrets, tokens, or credentials that appeared in the conversation.
- Keep technical content verbatim (code, error strings, URLs).
- If the conversation is short or trivial, warn the user before saving — not every chat deserves a wiki page.
- Default to minimum viable — a 3-paragraph page beats a 10-paragraph page of filler.
- Conversation-saved pages are DRAFTS. They ship with `verification: none` and stay drafts until they pass `/vault-challenge` (which sets `verification: full` + `challenged: <date>`) or are explicitly `--force`-integrated via `/vault-integrate`. `/vault-integrate` refuses unverified pages by default.
