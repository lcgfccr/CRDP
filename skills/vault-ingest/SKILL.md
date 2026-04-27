---
name: vault-ingest
description: >
  Read an external source (local file path or URL) and synthesize a wiki page
  for it in the current project's vault subgraph. Updates index, log, and
  cross-links to existing pages. Use when user says: /vault-ingest,
  "ingest this paper", "read this PDF and add to vault", "file this article
  into the knowledge base", "/vault-ingest <path-or-url>".
---

# vault-ingest

Turn an external source into a durable wiki page in the current project's subgraph.

## Precondition

Project's knowledge base must exist at `~/.claude/vault/projects/<slug>/index.md`. If not, tell the user to run `/vault-init` first.

## Accepted inputs

- **Local file path**: `.md`, `.txt`, `.pdf` (use Read), `.html`, source code
- **URL**: use WebFetch
- **Paste**: user paste a block of text in the prompt and asks to ingest it
- **Multiple**: `/vault-ingest all of these: ...` → iterate over each, produce one page per source, link them under a common parent page if thematically related

## Execution model

Runs in an isolated subagent — main conversation sees only the confirmation.

**Before spawning (main context):**
1. `node ~/.claude/hooks/vault-slug.js --resolve` → capture `<slug>`. Verify `index.md` exists.
2. Capture the source(s): URL, local path, or pasted text.
3. If source looks low-value (social media, marketing page), warn the user and confirm before spawning.

**Spawn:**
```
Agent(
  subagent_type: "general-purpose",
  prompt: """
    Caveman lite: drop filler, hedging, pleasantries. Keep all technical substance exact.

    Execute vault-ingest for project '<slug>' at ~/.claude/vault/projects/<slug>/.
    Source: <URL | local path | "pasted text below">
    <pasted text if applicable>

    Follow the full procedure in the vault-ingest skill. Return ONLY:
    - Page path written
    - Pages cross-linked (with wikilinks)
    - Any unresolvable wikilinks (candidates for new pages or /vault-autoresearch seeds)
  """
)
```

**After:** Echo the agent's output verbatim. Add nothing.

## Procedure (single source)

1. **Identify active project**. Compute slug (git root basename → slugify, fallback cwd basename). Verify index.md exists.

2. **Read the source**.
   - File → Read tool
   - URL → WebFetch with prompt "Extract the main arguments, key facts, authors/sources cited, and any primary data or benchmarks. Preserve technical terms and URLs exactly."
   - Paste → use the text as-is

3. **Extract structured metadata**. Title, author(s), publication date, source type (paper/article/blog/thread/code), primary URL or local path, tags (extracted topic terms), estimated reading time or length class (short/medium/long).

3a.5. **Resolve quality policy + auto-classify source**.
   - Read project's policies: scan `raw/policy-*.md` for any matching topic tags from this ingest's frontmatter.
   - If matching policy found, set `quality_policy: <topic-slug>` in ingested page frontmatter. Else `quality_policy: none`.
   - Auto-classify the source URL/file by domain into `source_class:` field — heuristic:
     * `.gov` / `.mil` → `regulatory`
     * `arxiv.org` / `*.edu` / `ssrn.com` → `academic`
     * `ietf.org` / `nist.gov` / `*.iso.org` → `standards-body`
     * `medium.com` / `substack.com` / personal blogs → `practitioner`
     * `nytimes.com` / `wsj.com` / `theverge.com` → `journalism`
     * vendor domains → `vendor`
     * `reddit.com` / `news.ycombinator.com` / forums → `forum`
   - If source URL matches policy's `blocklist_extra`, halt ingest with warning to user.

3b. **Contestation check (mandatory)**. Run 1 `WebSearch` to test whether the source's central claims are contested in the field: `"<central claim> contested"`, `"<central claim> debunked"`, `"critique of <author/claim>"`, `"<claim> failure cases"`. If credible counter-evidence surfaces, capture the dissenting source URL — it will annotate the relevant Key claim inline as `(contested by [source](url))`.

4. **Synthesize a wiki page** at `projects/<slug>/pages/<source-slug>.md`:

   ```markdown
   ---
   title: <title>
   ingested: <ISO-8601 date>
   source: <URL or file://path>
   source_type: <paper|article|blog|thread|code|paste>
   author(s): <if known>
   published: <date if known>
   tags: [...]
   verification: quick
   ---

   # <title>

   ## Summary

   <3-6 sentences — what the source argues and what's novel or useful about it>

   ## Key claims

   - <claim 1 with page/section reference if available> <if contested per step 3b: `(contested by [source](url))`>
   - <claim 2>
   - ...

   ## Data, examples, or evidence

   <distill the concrete evidence the source offers — numbers, benchmarks, examples. Skip filler.>

   ## Open / contradicts

   <anything the source leaves open, or claims that contradict other pages in the vault>

   ## Verbatim worth keeping

   <up to 3 short exact quotes when the phrasing is load-bearing>

   ## Related

   <wikilinks to existing pages this touches; candidates for new pages>
   ```

5. **Optional raw copy**. For local files, the user already has the original. For URLs, save a snapshot to `projects/<slug>/raw/<source-slug>.original.md` containing the WebFetch'd content — useful as a citable record in case the URL rots.

6. **Cross-link pass**. Scan titles of other pages in `pages/` for name overlap with the new page's content. Add bidirectional wikilinks (new page → related pages, and add a "Related" line in up to 5 existing pages).

7. **Update index.md**: insert alphabetically under `## Pages`:
   ```
   - [[<source-slug>]] — <one-line description>
   ```

8. **Append log.md**:
   ```
   - <timestamp> — INGEST — [[<source-slug>]] — <source type> — <URL or path>
   ```

9. **Report to user**: file written, pages cross-linked, any unresolved wikilinks (candidates for new pages or `/vault-autoresearch` seeds).

## Procedure (batch: "ingest all of these: <list>")

1. For each source, run the single-source procedure.
2. After all are ingested, write a **parent summary page** at `projects/<slug>/pages/<batch-topic>-overview.md` that synthesizes across the batch:
   - What do these sources collectively argue?
   - Where do they agree vs disagree?
   - What's the union of open questions?
3. Link the parent page to each child page and vice versa.

## Rules

- Never overwrite an existing page silently. If `<source-slug>.md` exists, ask: append, replace, or `<source-slug>-v2`.
- Don't ingest obviously low-value sources (social-media posts without substance, marketing pages). Warn the user and confirm before proceeding.
- Strip unsafe paths. Reject `../` in user-supplied paths.
- Keep the Summary under ~6 sentences. Detail belongs in Key claims + Evidence sections.
- URLs and code must be preserved verbatim.
