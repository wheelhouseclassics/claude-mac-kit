# Stage 1 — Idea (you bring the "what"; the gate locks it)

Goal: turn the user's raw idea into a locked `idea.md` — a crystal statement of what "done" looks like.
This stage is a conversation. You do ONLY this stage, then stop. **You may not draft any plan here** —
that is Brainstorm (stage 2). Nothing advances until the 95% clarity gate passes.

## Intake (register the project)

1. Determine intake mode from the user's input:
   - **New idea** (free text): derive a kebab-case slug (short, memorable). Confirm the slug with the user.
     Create `~/projects/<slug>/`, run `git init` in it.
   - **Existing local project** (a path or a name matching a dir in `~/projects/`): use that dir.
     If it has no `.git`, run `git init`.
   - **GitHub URL**: `git clone <url> ~/projects/<slug>` (slug = repo name, kebab-cased).
2. Register in `~/.claude/pipeline/registry.json` → `projects.<slug> = {path, airtableId: null, stage: "idea", phase: null, updatedAt: <now>}`.
3. For existing/cloned projects: build a COMPACT repo map first (README, entrypoints, structure — narrow reads
   only, per the user's context discipline). The idea will be scoped against what already exists.

## THE 95% CLARITY GATE — the hard gate to leave the Idea stage

This is the ADVANCEMENT GATE. You may NOT write idea.md as `locked`, and you may NOT print the footer
that sends the user to Brainstorm, until you are ≥95% confident on ALL of:
- **Purpose** — why this exists, what pain it kills
- **The done demo** — the exact scene the user will perform to accept it ("I sit down, say X, see Y")
- **Success criteria** — each one testable. Attack vague words ("nice", "fast", "works well",
  "important", "Jarvis-like", "mirrors the screenshot") until they become observable behaviors
  with numbers or a concrete pass/fail check
- **Scope boundaries** — what it explicitly does NOT do in v1
- **Data sources & constraints** — where every panel/feature gets its data; hardware/cost limits

Ask BATCHED questions (AskUserQuestion, up to 4 per round, as many rounds as needed) until the
gate passes. Fewer than ~2 rounds on a non-trivial idea is a red flag that you are guessing.
If the user answers "you decide", decide and record it under the relevant section as a master decision.

**GATE CHECK (print before writing idea.md):** restate the done demo in one sentence, then list every
success criterion with the concrete test that proves it and the exact data source behind it. If any
line still holds a vague word or an unpinned source, the gate is NOT passed — ask another round.
Only after a clean GATE CHECK may you write idea.md as `locked` and print the footer.

## Write the artifact

1. Copy `~/.claude/pipeline/templates/idea.md` structure into `<project>/idea.md`,
   filled in, frontmatter `status: locked`.
2. `git add -A && git commit -m "pipeline: idea locked (95% clarity gate passed)"` in the project dir.
3. Write `<project>/.pipeline/state.json`: `{"slug", "stage": "brainstorm-pending", "airtableId": null, "phaseRecordIds": {}, "events": [{ts, "idea-locked"}]}`.
4. Update registry entry (`stage: "idea-done"`, `updatedAt`).

## Airtable

Upsert the Projects record (ids in registry `airtable`): Name, Slug, Stage="Idea",
Success Criteria (the checklist as text), Local Path, Last Update=now.
Append an Events record: Type="StageChange", Detail="idea → success criteria locked".
Store the returned record id in registry `projects.<slug>.airtableId` and in state.json.
If Airtable tools are unavailable or ids are null: append the write payloads to registry `outbox` instead.

## Footer (print verbatim, then STOP — do not draft the plan)

```
Stage 1/6 done — idea.md [locked]. Crystal success criteria + what "done" looks like are pinned.
Now: /clear, then /project <slug>   (next: brainstorm drafts the execution path + phases)
```
