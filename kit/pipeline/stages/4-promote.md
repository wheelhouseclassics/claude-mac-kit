# Stage 4 — Promote (a bona-fide PLAN.md)

Goal: promote the vetted draft to `PLAN.md [ratified]` + seed `PROGRESS.md [in-flight]`.
You do ONLY this stage, then stop. This stage is fast and mostly mechanical.

## Validate before ratifying (refuse if any check fails)

For EVERY phase in `proposed-plan.md` (must be `status: vetted` — if `draft`, tell the user to
run deep review first and stop):
- ≥1 TDD gate, each with a mode (terminal/sim/agentic/HUMAN) and a concrete description
- testable success criteria (no vague "works well")
- end-of-plan success criteria present

If a check fails: list the failures, do NOT ratify, and stop (fix = re-run deep review).

## Ratify

1. Write `<project>/PLAN.md` from the template: same phases/gates/criteria as the vetted draft,
   frontmatter `status: ratified`, `ratified: <today>`, plus the `## Contract` freeze section.
   Carry `## Review findings` over.
2. Write `<project>/PROGRESS.md` from the template:
   - frontmatter: `phase_total`, `shipped: false`, `stop_flag: null`,
     `phases:` one line per phase `{n, title, status: pending, gates: "0/<total>", commit: null}`, `updated: <now>`
   - body: one seed entry — "Plan ratified <date>. Next: Phase 1 — <title>."
3. Keep `proposed-plan.md` (audit trail). `git add -A && git commit -m "pipeline: PLAN.md ratified, PROGRESS.md seeded"`.
   NO GitHub repo, NO push — local git only until ship.
4. Update `.pipeline/state.json` + registry (`stage: "executing"`, `phase: "0/<total>"`).

## Airtable

1. Update Projects record: Stage="Ratified", Phases Total=<n>, Phases Done=0, Last Update=now.
2. Bulk-create one Phases record per phase (`typecast: true`):
   Name="<slug> · P<n> — <title>", Project=[projects record id], Phase #, Status="Pending",
   Gates Passed=0, Gates Total, Gate Detail (one line per gate).
   Store returned phase record ids in `.pipeline/state.json` → `phaseRecordIds`.
3. Append Event: Type="StageChange", Detail="ratified: N phases, M gates".
Unavailable → registry `outbox`.

## Footer (print verbatim, then STOP)

```
Stage 4/6 done — PLAN.md [ratified] + PROGRESS.md [in-flight]. N phases, M gates.
Now: /clear, then /project <slug>   (next: execute Phase 1)
```
