---
description: Project development pipeline — idea → brainstorm → deep review → ratify → execute → ship. Runs ONE stage per invocation, then you /clear and re-run.
argument-hint: "<idea, project name, or GitHub URL> | status | audit"
---

# /project — the pipeline

You are the stage dispatcher for the development pipeline. You run EXACTLY ONE stage this
invocation, then stop with a footer telling the user to /clear and re-run. Never chain stages.

**Skill suppression:** during a /project run, do NOT invoke any other planning, brainstorming,
or TDD skill (e.g. superpowers:brainstorming, superpowers:test-driven-development,
superpowers:writing-plans, everything-claude-code planners). This pipeline IS the planning system.

Argument: **$ARGUMENTS**

## Shared contract

- Registry: `~/.claude/pipeline/registry.json` — projects map, Airtable ids
  (`airtable.baseId/projects/phases/events/fieldIds`), and the `outbox`.
- **Files are truth; JSON is cache.** If registry/state.json disagree with a project's markdown
  files: trust the files, repair the JSON, append an Events payload Type="Drift".
- Airtable writes: use claude.ai Airtable MCP tools (load with ToolSearch if needed) with the ids
  from the registry. If tools are unavailable or a write fails: append the payload
  `{table, op, recordId?, fields, ts}` to registry `outbox` and continue — never block on Airtable.
- Timestamps: local time, ISO format.
- Airtable "Stop Flag" choice names use SPACES: `HUMAN TEST`, `CLARIFICATION`, `None`
  (PROGRESS.md frontmatter uses underscores: HUMAN_TEST). Map when writing.

## Step 0 — housekeeping (every invocation)

1. Read the registry.
2. If `outbox` is non-empty and Airtable tools are reachable: replay payloads in order, clear outbox.
3. If `~/.claude/pipeline/audit-report.md` exists and lists stalled projects:
   print one banner line: `⚠ stalled: <slug> (<n>d), ...`

## Step 1 — special arguments

- `status` → print a compact table from the registry (slug — stage — phase — updatedAt), plus any
  stop flags found in each project's PROGRESS.md frontmatter. Then stop.
- `audit` → read and follow `~/.claude/pipeline/stages/audit.md`. Then stop.

## Step 2 — resolve the project

1. `$ARGUMENTS` matches a registered slug (or unambiguous prefix) → that project.
2. cwd is inside a registered project path → that project.
3. `$ARGUMENTS` is a GitHub URL or free-text idea → UNREGISTERED: the stage is Idea (intake).
4. Empty/ambiguous → print the registered projects with their stages and ask which one (or what
   new idea). Then stop and wait.

## Step 3 — detect the stage (from FILES, in the project dir)

Check in this order — first match wins:

| Evidence | Stage file to run |
|---|---|
| PROGRESS.md frontmatter `stop_flag` ≠ null | Surface the stop FIRST: print `stop_detail`, ask the user to resolve. HUMAN_TEST resolved → clear the flag, tick the gate, continue that phase via `stages/5-execute.md`. CLARIFICATION resolved → clear flag; if it invalidates the plan, rerun `stages/3-deep-review.md` on the affected phase; else continue `5-execute.md`. |
| Unregistered, or registered with no `idea.md` (or `idea.md` not `locked`) | `stages/1-idea.md` |
| `idea.md` status: locked, no `proposed-plan.md` | `stages/2-brainstorm.md` |
| `proposed-plan.md` status: draft | `stages/3-deep-review.md` |
| `proposed-plan.md` status: vetted, no PLAN.md | `stages/4-promote.md` |
| PLAN.md + PROGRESS.md with any phase not `done` | `stages/5-execute.md` (lowest non-done phase) |
| All phases done, `shipped: false` | `stages/6-human-review.md` |
| `shipped: true` | Print "✅ <slug> shipped — nothing to do." Suggest `/project <new idea>`. Stop. |

If frontmatter is missing/corrupted (user deleted the `---` block): fall back to file existence,
tell the user what's broken, and ask before guessing.

## Step 4 — dispatch

Read EXACTLY ONE file: `~/.claude/pipeline/stages/<detected>.md` and follow it
to the letter. Do not read the other stage files. When the stage's footer is printed — STOP.
