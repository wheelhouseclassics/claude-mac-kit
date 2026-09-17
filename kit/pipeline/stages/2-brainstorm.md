# Stage 2 — Brainstorm (you + agent draft the plan)

Goal: turn the locked `idea.md` into `proposed-plan.md [draft]`. You do ONLY this stage, then stop.
The idea's success criteria are ALREADY locked (stage 1) — do NOT re-open the clarity gate here.
If `idea.md` is missing or `status` ≠ `locked`, stop and send the user back to the Idea stage.

## Load the locked idea

1. Read `<project>/idea.md`. It holds the what, the done demo, the crystal success criteria, the
   scope boundaries, the data sources, and any open dependencies. This is your contract — the plan
   must satisfy every success criterion in it.
2. For existing/cloned projects: build a COMPACT repo map (README, entrypoints, structure — narrow
   reads only). The plan is scoped against what already exists.

## Draft the plan together (collaborative — this stage is a conversation)

1. Carry the **idea + success criteria** forward from idea.md verbatim (do not water them down).
2. Propose an **execution path**: your recommended approach + at least one alternative you rejected and why.
3. Shape into **phases** (typically 2–8). Each phase gets: goal, difficulty (low/medium/high),
   success criteria, and 1+ TDD gates. Gate modes:
   - `terminal` — a test runnable with a shell command (pytest, node --test, curl...)
   - `sim` — exercised against a simulator/replay/mock environment
   - `agentic` — you drive the real app/UI/API and observe the result
   - `HUMAN` — only the human can physically verify (hardware, audio, real-world). Use SPARINGLY.
   Scope rigor to difficulty — a `low` phase gets 1 simple gate, no bloat.
   Every success criterion in idea.md must be provable by at least one phase's gates.
4. List **assumptions to interrogate** (A1, A2, …): everything the plan takes on faith —
   library capabilities, API behavior, data availability, performance, user intent.

## Write the artifact

1. Copy `~/.claude/pipeline/templates/proposed-plan.md` structure into
   `<project>/proposed-plan.md`, filled in, frontmatter `status: draft`, `phases_count` correct.
   Include the idea's done demo + success criteria at the top so deep review has the contract.
2. `git add -A && git commit -m "pipeline: proposed-plan draft"` in the project dir.
3. Update `<project>/.pipeline/state.json`: `stage: "deep-review-pending"`, append event `{ts, "brainstorm-complete"}`.
4. Update registry entry (`stage: "brainstorm-done"`, `updatedAt`).

## Airtable

Upsert the Projects record (ids in registry `airtable`): Stage="Brainstorm", Local Path, Last Update=now.
Append an Events record: Type="StageChange", Detail="brainstorm → draft plan written".
If Airtable tools are unavailable or ids are null: append the write payloads to registry `outbox` instead.

## Footer (print verbatim, then STOP — do not continue to deep review)

```
Stage 2/6 done — proposed-plan.md [draft] written.
Now: /clear, then /project <slug>   (next: deep review interrogates every assumption)
```
