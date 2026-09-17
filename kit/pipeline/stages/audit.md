# Audit (daily agent + /project audit)

Goal: reconcile reality (files) with the registry and Airtable; flag stalled projects.
Read-only toward project code — the only writes are registry/state/Airtable/report.

## Per registered project (registry.json → projects)

1. **Orphan check**: path missing → mark `stage: "missing"` in registry, log Event Type="Drift".
2. **Recompute stage from files** (same detection rules as /project):
   no idea.md→Idea, idea.md locked + no proposed-plan→Idea, proposed-plan draft→Brainstorm,
   vetted→Vetted, PLAN+PROGRESS non-done phases→Executing, all done + shipped:false→Human Review,
   shipped:true→Shipped.
3. **Drift**: recomputed stage ≠ registry/Airtable stage → repair registry, update Airtable
   Projects record, Event Type="Drift" with before→after.
4. **Stalled**: stage is active (anything between Brainstorm and Human Review) AND
   PROGRESS.md (or proposed-plan.md if earlier) mtime older than **4 days** →
   Airtable Stalled=true + Event Type="Stalled" (detail: days idle). Otherwise ensure Stalled=false.
   **Exception — paused:** if the registry project entry has `paused: true` (owner
   intentionally parked it), SKIP the stalled flag entirely, ensure Stalled=false, and
   report it as `paused (Nd)` instead of stalled. Do not nag or Event a paused project.
5. **Stop flags**: `stop_flag` set in PROGRESS.md → make sure Airtable Stop Flag matches.

## Adoption sweep

Glob `~/projects/*/PLAN.md`. Any project with a PLAN.md not in the registry →
add it to registry (stage from files, airtableId null → create the Projects record or outbox it).

## Outbox flush

If registry `outbox` is non-empty and Airtable is reachable: replay every payload in order,
then clear outbox.

## Report

Write `~/.claude/pipeline/audit-report.md`: timestamp, per-project one-liner
(slug — stage — days since update — flags), stalled list, drift repairs, outbox status.
List paused projects separately (not under stalled) so they read as intentionally parked.
The next interactive `/project` run reads this and shows the banner if anything is stalled.

If Airtable was unreachable the whole run: say so in the report; all writes → outbox.
