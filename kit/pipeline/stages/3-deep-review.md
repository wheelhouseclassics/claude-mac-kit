# Stage 3 — Deep Review (interrogate every assumption)

Goal: adversarially vet `proposed-plan.md` with one subagent per phase, fold findings, flip to
`status: vetted`. You do ONLY this stage, then stop. You are the MASTER: stay high-level,
let subagents spend the context.

## Orchestrate

1. Read `<project>/proposed-plan.md`. Parse phases and the assumptions list.
2. Spawn **one subagent per phase, in parallel** — all Agent calls in a SINGLE message,
   subagent_type "Explore" (read-only). Cap 5 concurrent; if more phases, batch.
3. Each subagent prompt must contain:
   - the FULL text of its phase + the global success criteria + the assumptions list
   - the project path (read-only exploration of the codebase is allowed and encouraged)
   - the review rules:
     * interrogate every assumption touching this phase — verify against the actual codebase/docs where possible
     * success criteria must exist and be testable for this phase AND contribute to the end-state criteria
     * every change needs a TDD gate; prefer terminal > sim > agentic; HUMAN only if physically unavoidable
     * scope rigor to phase difficulty — flag test bloat on simple steps as a required edit
     * hunt for: missing prerequisite work, wrong ordering, hidden dependencies on other phases, unverifiable criteria
   - the required output — a fenced YAML verdict, nothing else:
     ```yaml
     phase: N
     verdict: sound | needs_changes | blocked
     assumptions: [{id: A1, claim: "...", status: verified|unverified|false, evidence: "..."}]
     required_edits: ["..."]
     tdd_gates: [{id: GN.1, mode: terminal|sim|agentic|HUMAN, desc: "..."}]
     rigor: low|medium|high
     risks: ["..."]
     ```

## Fold (master work — cohesive, not mechanical)

1. Collect all verdicts. If ANY verdict is `blocked`: do NOT vet. Write the blocking questions into
   `## Review findings`, set nothing else, surface them to the user as a CLARIFICATION list, and stop.
2. Apply `required_edits` cohesively — you may merge, split, or reorder phases if the findings demand it.
   Keep the plan minimal (YAGNI): review findings that ADD scope need user confirmation first.
3. Replace each phase's TDD gates with the vetted gate list. Ensure end-of-plan success criteria still hold.
4. Record every finding under `## Review findings`, keyed to assumption ids (A1: verified — evidence...).
5. Update frontmatter: `status: vetted`, correct `phases_count`.
6. `git commit -am "pipeline: proposed-plan vetted (deep review)"`.
7. Update `.pipeline/state.json` + registry (`stage: "vetted"`).

## Airtable

Update Projects record: Stage="Vetted", Last Update=now.
Append Event: Type="StageChange", Detail="deep review: N phases vetted, M edits applied".
Unavailable → registry `outbox`.

## Footer (print verbatim, then STOP)

```
Stage 3/6 done — proposed-plan.md [vetted]. X assumptions interrogated, Y edits folded in.
Now: /clear, then /project <slug>   (next: promote to ratified PLAN.md)
```
