# Stage 6 — Human Review (the last gate before GitHub)

Goal: the human physically verifies the feature, then — and only then — the project ships to GitHub.
This stage is a conversation + a checklist, not autonomous work.

## Present the review packet

1. From PLAN.md + PROGRESS.md, print a compact ship report:
   - the end-of-plan success criteria, each with the evidence that satisfies it
   - every phase: title, gates passed, commit hash
   - any HUMAN gates and their outcomes
   - exact steps for the human to run/see the feature themselves (commands, URL, what to look for)
2. Ask the human to confirm THREE things (AskUserQuestion or plain confirmation):
   - ✅ feature actually works (they saw it themselves)
   - ✅ every TDD gate passed
   - ✅ clear to push

Do NOT proceed on anything less than explicit confirmation. If they find a problem:
set `stop_flag: CLARIFICATION` with their feedback, point them to re-run `/project <slug>`
(deep review of the affected phase), and stop.

## Ship (only after confirmation)

1. Create a **private** GitHub repo: `gh repo create <slug> --private --source . --push`
   (fallback: GitHub MCP create_repository + git remote add + push).
   If repo creation fails: stay local, log the error in PROGRESS.md, tell the user, retry next run.
2. Update PROGRESS.md frontmatter: `shipped: true`, `updated: <now>`; log entry "SHIPPED <date> → <repo url>".
3. `git add -A && git commit -m "pipeline: shipped" && git push`.
4. Update registry (`stage: "shipped"`).

## Airtable

Projects record: Stage="Shipped", GitHub URL, Last Update=now.
Event: Type="StageChange", Detail="shipped → <repo url>".
Unavailable → outbox.

## Footer (print verbatim)

```
🚢 SHIPPED — <slug> → <repo url>. Pipeline complete.
```
