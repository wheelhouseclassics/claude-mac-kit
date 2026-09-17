---
name: decision-note
description: >-
  Record a meaningful decision into the second-brain vault so the choice and its
  reasoning survive across sessions. Use this WHENEVER a real decision gets made
  or locked in — triggers include the user saying "let's go with", "we decided",
  "I've decided", "let's commit to", "final answer", "decision:", "we'll use X
  instead of Y", "going with", "let's not do X", or the moment a discussion of
  options resolves into a chosen direction (architecture, tooling, scope,
  strategy, naming, vendor, approach). Capture the decision, WHY it was made, and
  the alternatives rejected. Skip trivial moment-to-moment choices; capture
  durable ones worth remembering later. Appends to decisions.md in the current
  project, archives an immutable dated copy into the vault, and refreshes the
  vault's transient decision.md.
---

# Decision Note

Record a meaningful decision the moment it's made, capturing not just *what* was
decided but *why* and *what was rejected*. Decisions without their reasoning rot
fast — six weeks later nobody remembers why X beat Y, and the debate reopens. The
rationale is the whole point; capture it while it's fresh.

This mirrors the `thought-note` skill, but decisions carry more structure because
the *why* and the *alternatives* are what make them worth keeping.

## What counts as a meaningful decision

Capture decisions that are **durable and consequential** — ones a future session
would benefit from knowing: architecture and design choices, tool/library/vendor
selections, scope cuts ("we're not building X"), strategy calls, naming
conventions, process changes, trade-offs accepted.

Do **not** file every micro-choice (which variable name, which line to edit
next) — that's noise. If you're unsure whether it's durable, lean toward
capturing it but keep the entry short. A decision the user explicitly flags
("decision:", "let's lock this in") always counts.

Distinguish from a **thought** (floated, not committed — use `thought-note`) and a
**task** (do it now). A decision has been *settled*.

## The three writes

When triggered, perform all three.

### 0. Gather the pieces (run once)

```bash
DATE=$(date +%F)                    # 2026-06-23
STAMP=$(date '+%Y-%m-%d %H:%M')     # 2026-06-23 14:32
PROJECT=$(basename "$(pwd)")        # working project dir name
```

- `PROJECT` is the basename of the current working directory; if cwd is the home
  directory (the home folder) or not a real project, use `general`.
- `SLUG` is a short kebab-case summary of the decision (3–6 words, e.g.
  `n8n-over-zapier`, `drop-desktop-autocapture`).
- `SURFACE` is `code` in Claude Code (default here) or `desktop` in Claude
  Desktop.

Before writing, make sure you actually have the three substantive pieces. If the
**why** or the **alternatives** aren't clear from the conversation, infer them
from context where you safely can; only ask the user if a core piece is genuinely
missing and the decision would be useless without it.

### 1. Append to the project's `decisions.md`

Path: `./decisions.md` (current working project directory). Create it with a
`# Decisions` header if absent, then append. Never rewrite existing entries.

Entry format:

```markdown
## [<STAMP>] <the decision, one line>
- **Why:** <rationale>
- **Instead of:** <alternatives rejected, and why they lost>
```

### 2. Archive an immutable dated copy in the vault

Path: `~/second-brain/raw-sources/Decisions/decision-<SURFACE>-<PROJECT>-<DATE>-<SLUG>.md`

Immutable like all `raw-sources/` — never overwrite. On name collision append
`-2`, `-3`, etc.

File contents:

```markdown
---
source: claude-<SURFACE>
type: decision
project: <PROJECT>
date: <DATE>
session_surface: Claude Code
tags:
  - decision
  - decision/<SURFACE>
  - project/<PROJECT>
---

# Decision — <the decision, one line>

## What
<the decision, stated plainly>

## Why
<the reasoning — what made this the right call>

## Instead of
<alternatives considered and why they were rejected>

*Decided <STAMP> in <PROJECT>.*
```

### 3. Refresh the vault's transient `decision.md`

Path: `~/second-brain/decision.md`

The "latest decision" view — transient, overwritten every time (only ever one
active), mirroring `handoff.md` at the vault root. Overwrite wholesale:

```markdown
---
type: decision
project: <PROJECT>
date: <DATE>
---

# Latest Decision

**<the decision, one line>**

- **Why:** <rationale>
- **Instead of:** <alternatives rejected>

*Decided <STAMP> in <PROJECT>.*
Archived: [[decision-<SURFACE>-<PROJECT>-<DATE>-<SLUG>]]
```

### 4. Append a line to the vault log

Path: `~/second-brain/wiki/log.md`

Append-only chronological record, same convention the handoff skill uses. Add a
single line at the end (don't rewrite anything above it):

```markdown
## [<DATE>] decision | <SURFACE> | <PROJECT> | <the decision, one line>
```

## After capturing

Confirm in one line — e.g. `Logged. → decisions.md + vault (decision-code-<project>-<date>-<slug>).`
Then continue with whatever the decision was about.
