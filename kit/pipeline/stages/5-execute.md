# Stage 5 — Execute (grind ONE phase)

**You will complete EXACTLY ONE phase — the lowest-numbered non-done phase in PROGRESS.md
frontmatter — then stop.** Never continue into the next phase, even if this one finished quickly.
The /clear between phases IS the context budget.

## Start

1. Read `<project>/PROGRESS.md` fully — the body is the previous agent's handoff letter.
   Read the target phase's section of `PLAN.md` (not the whole file unless needed).
2. If `stop_flag` is set: do not work. Surface the stop to the user and stop (the command should
   have caught this already).
3. Mark the phase `in_progress` in PROGRESS.md frontmatter, `updated: <now>`.
4. Airtable: update the phase's record Status="In Progress"; Projects record Stage="Executing".
   Unavailable → outbox.

## Work the phase — strict TDD, gate by gate

For each unchecked gate, in order:
1. **Write the failing test first.** Run it. Confirm it fails for the RIGHT reason.
2. Implement the minimum to pass. Run it. Confirm pass.
3. Test escalation order: `terminal` first; `sim` if the behavior needs an environment;
   `agentic` if you must drive the real app and observe. Never skip down the ladder.
4. **HUMAN gates are never attempted.** If the phase cannot complete without one:
   set `stop_flag: HUMAN_TEST`, `stop_detail: <exact instructions — what to do, what to observe,
   what result means pass>`, update PROGRESS.md, commit, print the STOP footer, stop.
5. Ambiguity you cannot resolve from PLAN.md + the codebase: set `stop_flag: CLARIFICATION`,
   `stop_detail: <the precise questions>`, commit, print the STOP footer, stop.
   These are the ONLY two legal stop reasons.
6. After EVERY passed gate: tick it in PROGRESS.md (`gates: "x/y"`), append one line to the log.

## Context-budget checkpoint (the fresh-agent handoff)

Checkpoint NOW if any of these hit:
- ~20+ significant tool cycles this run
- you catch yourself re-reading files you already read
- the phase is <50% done and clearly large

Checkpoint = update PROGRESS.md body with: done so far, the EXACT next step (file, function, command),
gotchas/decisions → `git add -A && git commit -m "wip(phase-N): checkpoint"` → print:
```
Phase N checkpoint (gates x/y, context budget). Now: /clear, then /project <slug> — a fresh agent resumes.
```
→ STOP.

## Phase complete

1. All gates ticked + phase success criteria verified. Update PROGRESS.md: phase `status: done`,
   `commit` filled after committing, log entry with what shipped.
2. `git add -A && git commit -m "phase-N: <title> [gates y/y]"` — local only, NO push.
3. Put the short commit hash into the phase line in PROGRESS.md frontmatter via a FOLLOW-UP commit
   ("pipeline: stamp phase-N commit hash"). Never --amend for this — amending changes the hash you
   just recorded.
4. Airtable: phase record Status="Done", Gates Passed, Commit, Completed At=now;
   Projects record Phases Done+1, Last Update. Event: Type="PhaseDone", Detail="P<n> — <title>".
   Unavailable → outbox.
5. Update registry (`phase: "<done>/<total>"`; if all done → `stage: "human-review"`).

## Footer (print verbatim, then STOP)

If phases remain:
```
Phase N/T done (gates y/y, commit <hash>). Now: /clear, then /project <slug>
```
If this was the last phase:
```
Phase T/T done — all phases complete. Now: /clear, then /project <slug>   (next: YOUR human review — the last gate)
```
If stopped on a flag:
```
STOPPED — <HUMAN_TEST|CLARIFICATION>. See PROGRESS.md stop_detail. Resolve, then /project <slug>.
```
