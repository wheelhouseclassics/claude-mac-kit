---
name: thought-note
description: >-
  Capture a fleeting thought or half-formed idea into the second-brain vault.
  Use this WHENEVER the user voices something they want remembered for later —
  triggers include "I had a thought", "I have a thought", "make a note", "note
  this", "jot this down", "thought:", "random thought", "side thought", "remind
  me later", "for later", or any aside where they float an idea, observation,
  concern, or reminder — even if they never say the word "thought". When in
  doubt, capture it; a missed thought is worse than an extra file. Appends the
  thought to thoughts.md in the current project, archives an immutable dated copy
  into the second-brain vault, and refreshes the vault's transient thought.md.
---

# Thought Note

Capture a passing thought in two places at once: a lightweight running log inside
the project the user is working in, and the shared second-brain vault so the
thought survives across sessions and surfaces (Claude Code + Claude Desktop).

The point is friction-free capture. The user is mid-flow and doesn't want to stop
and file something — you do the filing. Get the thought down faithfully, then put
it where it belongs. Don't interrogate the user or ask them to reformat; capture
what they said in their words.

## What counts as a thought

A thought is anything the user floats to be kept, not acted on right now: an idea,
an observation, a worry, a "we should maybe…", a reminder to self, a connection
they noticed. It is distinct from a **decision** (something they've committed to —
that's the `decision-note` skill) and from a **task** they want done immediately.

If the user is clearly asking you to *do* something now, do it — don't just file
it. If they're flagging something for later, capture it.

## The three writes

When triggered, perform all three. They are cheap and the whole value is that the
thought lands everywhere at once.

### 0. Gather the pieces (run once)

```bash
DATE=$(date +%F)                    # 2026-06-23
STAMP=$(date '+%Y-%m-%d %H:%M')     # 2026-06-23 14:32
PROJECT=$(basename "$(pwd)")        # working project dir name
```

- `PROJECT` is the basename of the current working directory. If the cwd is the
  user's home directory (the home folder) or otherwise not a real project, use
  `general`.
- `SLUG` is a short kebab-case summary you compose from the thought (3–6 words,
  e.g. `trail-stop-per-symbol`). Keep it descriptive enough to recognize later.
- `SURFACE` is `code` in Claude Code (the default here) or `desktop` in Claude
  Desktop. Mirror it in frontmatter as `source: claude-<surface>`.

### 1. Append to the project's `thoughts.md`

Path: `./thoughts.md` (in the current working project directory). If it doesn't
exist, create it with a `# Thoughts` header first, then append. Never rewrite
existing entries — only add to the bottom.

Entry format:

```markdown
## [<STAMP>] <one-line gist>
<the thought, in the user's words>
```

### 2. Archive an immutable dated copy in the vault

Path: `~/second-brain/raw-sources/Thoughts/thought-<SURFACE>-<PROJECT>-<DATE>-<SLUG>.md`

This folder is immutable like all `raw-sources/` — never overwrite an existing
archive. If the name collides, append `-2`, `-3`, etc.

File contents:

```markdown
---
source: claude-<SURFACE>
type: thought
project: <PROJECT>
date: <DATE>
session_surface: Claude Code
tags:
  - thought
  - thought/<SURFACE>
  - project/<PROJECT>
---

# Thought — <one-line gist>

<the thought, in the user's words>

*Captured <STAMP> from <PROJECT>.*
```

### 3. Refresh the vault's transient `thought.md`

Path: `~/second-brain/thought.md`

This is the "latest thought" view — transient, overwritten every time (only ever
one active), exactly mirroring how `handoff.md` works at the vault root. Overwrite
it wholesale:

```markdown
---
type: thought
project: <PROJECT>
date: <DATE>
---

# Latest Thought

> <the thought, in the user's words>

*Captured <STAMP> from <PROJECT>.*
Archived: [[thought-<SURFACE>-<PROJECT>-<DATE>-<SLUG>]]
```

### 4. Append a line to the vault log

Path: `~/second-brain/wiki/log.md`

Append-only chronological record, same convention the handoff skill uses. Add a
single line at the end (don't rewrite anything above it):

```markdown
## [<DATE>] thought | <SURFACE> | <PROJECT> | <one-line gist>
```

## After capturing

Confirm in one line — e.g. `Noted. → thoughts.md + vault (thought-code-<project>-<date>-<slug>).`
Don't editorialize or expand on the thought unless the user asks. The job is to
catch it and keep moving.
