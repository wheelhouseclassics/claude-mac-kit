# LLM Wiki

A pattern for building personal knowledge bases using LLMs.

This is an idea file, it is designed to be copy pasted to your own LLM Agent (e.g. OpenAI Codex, Claude Code, OpenCode / Pi, or etc.). Its goal is to communicate the high level idea, but your agent will build out the specifics in collaboration with you.

## The core idea

Most people's experience with LLMs and documents looks like RAG: you upload a collection of files, the LLM retrieves relevant chunks at query time, and generates an answer. This works, but the LLM is rediscovering knowledge from scratch on every question. There's no accumulation. Ask a subtle question that requires synthesizing five documents, and the LLM has to find and piece together the relevant fragments every time. Nothing is built up. NotebookLM, ChatGPT file uploads, and most RAG systems work this way.

The idea here is different. Instead of just retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files that sits between you and the raw sources. When you add a new source, the LLM doesn't just index it for later retrieval. It reads it, extracts the key information, and integrates it into the existing wiki — updating entity pages, revising topic summaries, noting where new data contradicts old claims, strengthening or challenging the evolving synthesis. The knowledge is compiled once and then *kept current*, not re-derived on every query.

This is the key difference: **the wiki is a persistent, compounding artifact.** The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read. The wiki keeps getting richer with every source you add and every question you ask.

You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it. You're in charge of sourcing, exploration, and asking the right questions. The LLM does all the grunt work — the summarizing, cross-referencing, filing, and bookkeeping that makes a knowledge base actually useful over time. In practice, I have the LLM agent open on one side and Obsidian open on the other. The LLM makes edits based on our conversation, and I browse the results in real time — following links, checking the graph view, reading the updated pages. Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.

## Architecture

There are three layers:

**Raw sources** — your curated collection of source documents. Articles, papers, images, data files. These are immutable — the LLM reads from them but never modifies them. This is your source of truth.

**The wiki** — a directory of LLM-generated markdown files. Summaries, entity pages, concept pages, comparisons, an overview, a synthesis. The LLM owns this layer entirely. It creates pages, updates them when new sources arrive, maintains cross-references, and keeps everything consistent. You read it; the LLM writes it.

**The schema** — this CLAUDE.md file that tells the LLM how the wiki is structured, what the conventions are, and what workflows to follow when ingesting sources, answering questions, or maintaining the wiki. This is the key configuration file — it's what makes the LLM a disciplined wiki maintainer rather than a generic chatbot. You and the LLM co-evolve this over time as you figure out what works for your domain.

## Folder structure

```
second-brain/
├── raw-sources/        # Drop source material here. Never modify these files.
│   ├── Handoffs/       # Dated session handoffs (immutable archive)
│   ├── Thoughts/       # Dated captured thoughts (immutable archive)
│   └── Decisions/      # Dated captured decisions (immutable archive)
├── wiki/
│   ├── index.md        # Catalog of all wiki pages (update on every ingest)
│   └── log.md          # Append-only record of ingests, queries, health checks
├── handoff.md          # Transient "latest handoff" (overwritten each time)
├── thought.md          # Transient "latest thought" (overwritten each time)
├── decision.md         # Transient "latest decision" (overwritten each time)
└── CLAUDE.md           # This file
```

## Operations

**Ingest.** You drop a new source into raw-sources/ and tell the LLM to process it. The LLM reads the source, discusses key takeaways with you, writes a summary page in the wiki, updates the index, updates relevant entity and concept pages across the wiki, and appends an entry to the log. A single source might touch 10–15 wiki pages.

**Query.** You ask questions against the wiki. The LLM reads index.md first to find relevant pages, drills into them, and synthesizes an answer with citations. Save good answers back into the wiki as new pages — they compound just like ingested sources.

**Lint.** Periodically ask the LLM to health-check the wiki. Look for: contradictions between pages, stale claims superseded by newer sources, orphan pages with no inbound links, concepts mentioned but lacking their own page, missing cross-references. The LLM logs fixes to wiki/lint-report.md.

## Handoff workflow

Handoffs capture a session's state so it can be resumed later — on either surface (Claude Desktop or Claude Code). They are produced on demand by the `handoff` skill (trigger: `/handoff` or "hand this off").

**What gets written on each handoff:**

- A working `handoff.md` at the vault root — transient, overwritten each time (only ever one active).
- A dated archive in `raw-sources/`, named `handoff-<surface>-<project>-<YYYY-MM-DD>[-<slug>].md`.
- An append line in `wiki/log.md`: `## [YYYY-MM-DD] handoff | <surface> | <project> | <topic>`.

**Conventions:**

- `<surface>` is `desktop` (Claude Desktop / Cowork) or `code` (Claude Code) — this is how the two are differentiated. Mirrored in frontmatter as `source: claude-<surface>`.
- `<project>` is the project name (repo / connected-folder name, or inferred from the conversation); falls back to `general`. Mirrored in frontmatter as `project:` and tag `project/<project>`.
- Every handoff carries a `date:` in frontmatter and in the filename.
- Archive frontmatter: `source`, `type: handoff`, `project`, `date`, `session_surface`, plus `handoff`, `handoff/<surface>`, `project/<project>` tags.
- Archives are immutable like other raw-sources — never overwrite; if a name collides, append `-2`, `-3`.

**Cross-surface memory:** because both surfaces archive into the same `raw-sources/`, a handoff written in one is available to the other. To resume: "read the latest `handoff-<surface>-<project>-*` in raw-sources and continue." Optionally, claude-mem's `mcp-search` MCP server lets Claude Desktop also query the Claude Code SQLite memory DB at `~/.claude-mem/claude-mem.db`.

## Thought & decision capture

Two lightweight capture workflows mirror the handoff mechanism for in-the-moment notes. They are produced by the global `thought-note` and `decision-note` skills (Claude Code), which fire automatically when the user floats a thought ("I had a thought", "make a note") or locks in a decision ("let's go with X", "we decided").

- **Thoughts** — fleeting ideas/observations/reminders, *floated* not committed. Archive: `raw-sources/Thoughts/thought-<surface>-<project>-<date>[-<slug>].md`.
- **Decisions** — choices that have been *settled*, captured with their rationale and the rejected alternatives. Archive: `raw-sources/Decisions/decision-<surface>-<project>-<date>[-<slug>].md`.

**What gets written on each capture (same shape as a handoff):**

- An append to `<type>s.md` in the *current working project directory* (e.g. `thoughts.md` / `decisions.md`) — a running per-project log, created if absent.
- A dated immutable archive in the matching `raw-sources/` subfolder, frontmatter mirroring handoffs (`source`, `type: thought|decision`, `project`, `date`, `session_surface`, tags `<type>`, `<type>/<surface>`, `project/<project>`).
- The transient `thought.md` / `decision.md` at the vault root — overwritten each time, only ever one active.
- An append line in `wiki/log.md`: `## [YYYY-MM-DD] thought|decision | <surface> | <project> | <gist>`.

Conventions (`<surface>`, `<project>`, immutability, collision handling) are identical to the handoff workflow above. These archives are ordinary raw-sources and can be ingested into the wiki like any other source.

## Programmatic source feeds

Beyond manual drops, several raw-source streams are generated automatically. A good feed is atomic, dated, immutable, project-tagged, machine-generated, and signal-dense. Current feeds:

- **Handoffs** (`raw-sources/Handoffs/`) — session state, on demand via the `handoff` skill. See "Handoff workflow" above.
- **Thoughts / Decisions** (`raw-sources/Thoughts/`, `raw-sources/Decisions/`) — in-the-moment captures mirroring the handoff process; each carries a `project/<name>` tag.
- **Sessions** (`raw-sources/Sessions/`) — claude-mem session summaries, pulled from the local worker by `scripts/pull_claude_mem_summaries.py` (one dated md per summary id, idempotent). Requires the claude-mem worker running; reads its port from `~/.claude-mem/settings.json`. Pulls *summaries only*, not raw observations (query those live via `mcp-search`). See `scripts/README-claude-mem-sync.md`.
- **Projects** (`raw-sources/Projects/<project>/`) — a stable `project-profile.md` anchor per project plus append-only dated event files (`<YYYY-MM-DD>-<slug>.md`: milestones, status snapshots, metric dumps). These give project pages a time-series to synthesize. See `raw-sources/Projects/README.md`.

Candidate future feeds: git-log digests per project, call/meeting transcripts (Fireflies/Zoom), web clippings, scheduled activity digests. Avoid feeding raw chat transcripts or raw claude-mem observations — too noisy; they inflate ingest cost without adding signal.

All feeds are ordinary raw-sources: immutable, ingested into the wiki like any other source, and logged in `wiki/log.md`.

## Indexing and logging

**index.md** is content-oriented. A catalog of every wiki page — link, one-line summary, optional metadata. Organized by category (entities, concepts, sources, etc.). Update it on every ingest. The LLM reads it first when answering queries.

**log.md** is chronological. Append-only. Each entry starts with a consistent prefix:
```
## [YYYY-MM-DD] ingest | Source Title
## [YYYY-MM-DD] query | Question asked
## [YYYY-MM-DD] lint | Health check
## [YYYY-MM-DD] handoff | <surface> | <project> | <topic>
## [YYYY-MM-DD] thought | <surface> | <project> | <gist>
## [YYYY-MM-DD] decision | <surface> | <project> | <gist>
```

## Wiki page conventions

- One markdown file per topic, entity, or concept
- Use `[[wiki-link]]` format for cross-references between pages
- Add YAML frontmatter with tags and date: `tags: [concept, entity, source]`
- Each page cites its sources inline
- Never delete pages — deprecate with a note and redirect

## Ingest command (run from vault root in Claude Code)

```
claude -p "I just added a file to /raw-sources/. Read it, extract key ideas, write a summary page to /wiki/, update index.md with a link and one-line description, update any existing concept pages that connect to this source. Log what you changed to log.md. Show me every file you touched." --allowedTools Bash,Write,Read
```

## Query command

```
claude -p "Based on everything in wiki/, [your question here]. Read index.md first, then drill into relevant pages. Cite sources." --allowedTools Read
```

## Context Navigation

When you need to understand this vault or answer questions:
1. Read `wiki/index.md` first — it's the entrypoint for all wiki pages
2. Only read `raw-sources/` files if explicitly asked to look at source material
3. Use `[[wiki-link]]` cross-references to drill into specific pages

## Weekly health check

```
claude -p "Read every file in /wiki/. Find: contradictions between pages, orphan pages with no inbound links, concepts mentioned repeatedly but with no dedicated page, claims that seem outdated based on newer files in /raw-sources/. Write a health report to /wiki/lint-report.md with specific fixes." --allowedTools Bash,Write,Read
```
