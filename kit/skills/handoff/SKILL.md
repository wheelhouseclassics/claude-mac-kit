---
name: handoff
description: Summarize the current session into a dated handoff file so the conversation can be cleared or handed off without losing key context, AND drop a copy into the Obsidian vault. Differentiates Claude Desktop vs Claude Code handoffs. Use when the user types /handoff, asks to "hand off" or "summarize for next session", or before clearing/compacting context.
---

# Handoff

Produce a concise handoff that captures everything a fresh session needs to pick up this work, then archive a dated, source-tagged copy into the Obsidian vault.

## When to use
- User types `/handoff` or asks for a session handoff.
- Before `/clear`, `/compact`, or starting a new session on the same task.
- Mid-task checkpoint where progress should be captured before context is lost.

## Step 1 — Determine the surface, project, and date
Decide which surface this session is running on:
- **Claude Code** (terminal/CLI session, inside a project working tree) → surface = `code`
- **Claude Desktop / Cowork** (desktop app session) → surface = `desktop`

Determine the **project name** (there usually is one):
- **Claude Code**: use the working-tree / repo folder name (e.g. basename of the project root, or the git repo name).
- **Claude Desktop / Cowork**: use the connected folder name, or infer the project from the conversation's subject.
- If there is genuinely no project, use `general` and note it.

If unsure about surface or project, ask the user one short question. Get today's date as `YYYY-MM-DD` (run `date +%F` if a shell is available).

## Step 2 — Write the working handoff
Write `handoff.md` in the current working directory (project root). Overwrite if it exists — there is only ever one active working handoff.

## Step 3 — Archive a dated copy to the Obsidian vault
Also write a dated, source-tagged copy into the vault so handoffs accumulate over time:

```
<VAULT_RAW_SOURCES>/handoff-<surface>-<project>-<YYYY-MM-DD>[-<short-slug>].md
```

- `<VAULT_RAW_SOURCES>` default: `~/second-brain/raw-sources/Handoffs`
- `<surface>` is `desktop` or `code` (from Step 1) — this is how Desktop and Code handoffs are differentiated.
- `<project>` is the project name from Step 1 (kebab-case), e.g. `second-brain`.
- `<short-slug>` is a 2–4 word kebab-case topic (e.g. `memory-sync`). Include it so multiple handoffs on the same day/project don't collide.
- Never overwrite an existing dated archive copy — if the exact name exists, append `-2`, `-3`, etc.

The archived copy must begin with YAML frontmatter:

```yaml
---
source: claude-<surface>        # claude-desktop or claude-code
type: handoff
project: <project>
date: <YYYY-MM-DD>
session_surface: <Claude Desktop (Cowork) | Claude Code>
tags:
  - handoff
  - handoff/<surface>
  - project/<project>
---
```

Followed by the handoff body. Then append one line to `<VAULT>/wiki/log.md` (if that file exists):

```
## [<YYYY-MM-DD>] handoff | <surface> | <project> | <short topic>
```

## Required skeleton
Use these section headings, in this order. Keep each section short and concrete. (For Desktop sessions, "Files in flight", "Changed", and "Failed attempts" are often empty — omit any section with genuinely nothing to report.)

```markdown
# Goal
<1–3 sentences: what we're trying to build and why it matters>

## Current State
<Where the work stands right now — what's working, what's not, what's verified>

## Files in flight
<Active files currently being modified — relative paths, one per line, with a half-line note on each>

## Changed
<What's already been touched this session — paths + brief note per file (committed or not)>

## Failed attempts
<What didn't work and why — so the next session doesn't repeat them>

## Next step
<The single next thing to try — one specific, actionable item>
```

## Authoring rules
- Pull only from this session's conversation and the working tree — do not speculate or invent context.
- Be specific: name files (with paths), functions, commands run, exact error messages.
- Prefer concrete paths and identifiers over prose.
- "Next step" must be a single actionable item, not a roadmap. If multiple things are needed, pick the one that unblocks the rest.
- Omit a section only if there is genuinely nothing to report — do not pad with "N/A" or "None".
- Do not include secrets, tokens, or full file contents. Reference paths instead.
- Do not commit `handoff.md` unless the user explicitly asks. It is a working artifact, not a deliverable. (The dated vault copy IS meant to persist.)

## After writing
Tell the user both paths you wrote (working `handoff.md` and the dated vault archive) and a one-line summary of the "Next step" so they can verify before clearing context.