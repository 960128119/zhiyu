# Recall Quality Control

Use a maintenance Work as a quality controller, not as the owner of all memory.

## Controlled Object

The controlled object is retrieval quality: whether an authorized requester receives useful, fresh, evidence-backed context for a task without cross-scope leakage.

## Observations

Collect context logs, recall feedback, index health, embedding coverage, stale-memory counts, unresolved candidates, entity alias conflicts, access denials, and user corrections.

Do not infer quality from keyword frequency alone. A frequently occurring term may belong to one Work or one temporary project.

## Safe Automatic Actions

The maintenance Work may automatically:

- refresh retrieval statistics;
- rebuild derived indexes;
- backfill missing embeddings;
- detect duplicate aliases and stale index entries;
- run fixed recall evaluation cases;
- emit a quality report and auditable events.

These actions must be idempotent and must not change source observations, grants, or memory ownership.

## Proposal-Only Actions

Require a versioned, owner-reviewable proposal before:

- changing global recall rules or weights;
- adding or changing a Work recall profile;
- merging entity aliases with ambiguous identity;
- weakening, superseding, or deleting durable memory;
- changing access grants or scope behavior;
- changing this Skill.

Each proposal must include the triggering feedback, affected scopes, before/after behavior, evaluation cases, expected gain, regression risks, and rollback plan.

## Daily Loop

1. Call `workshopInspectMemoryRecallQuality` to observe aggregate context logs and recall feedback since the prior checkpoint.
2. Separate infrastructure failures from ranking failures and content-quality failures.
3. Run stable evaluation cases plus a small sample of recent real tasks.
4. Perform only safe automatic actions.
5. Create proposals for policy or profile changes.
6. Record metrics, artifacts, failures, and the next checkpoint.

Useful metrics include access-leak count, missing-recall rate, irrelevant-recall rate, stale-recall rate, evidence-resolution rate, selected-memory utilization, and evaluation pass rate. Do not optimize a single metric without guardrails.
