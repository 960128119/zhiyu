# Memory Contract

## Layers

| Layer | Purpose | Mutability |
|---|---|---|
| Observation | Raw source fact with source and time | Append-only |
| Memory | Reusable interpreted state | Versioned and reviewable |
| State snapshot | Derived current state | Rebuildable |
| Context pack | Task-scoped recall result | Ephemeral and logged |
| Recall feedback | Evidence about retrieval quality | Append-only |

## Requester And Scope

Requester types are `chat`, `work`, `loop`, `tool`, and `system`.

Memory scopes are `global`, `workspace`, `workshop`, and `work`. Access requires ownership, an explicit grant, or a narrowly defined system policy. A tool requester requires an explicit grant. Denied access must be recorded rather than silently converted into an empty result.

## Memory Fields

- `ownerType` and `ownerId`: authority responsible for the memory.
- `memoryType`: `fact`, `preference`, `plan`, `boundary`, `relationship`, `task`, `insight`, or `system`.
- `status`: `candidate`, `active`, `verified`, `weakened`, `superseded`, or `deleted`.
- `confidence`: source confidence, not action permission and not retrieval relevance.
- `evidenceRefs`: source observations or events supporting the memory.
- `expiresAt`: validity boundary for temporary facts.
- `supersedes`: prior memory ids replaced by this version.
- `tags`: retrieval hints, not ontology truth.

## Status Use

- `candidate`: awaiting review; exclude from default action context.
- `active`: usable but not independently confirmed.
- `verified`: supported by review, repeated evidence, or outcomes.
- `weakened`: contradicted, stale, or less reliable; verify before use.
- `superseded`: retained for history but replaced by a newer memory.
- `deleted`: excluded from recall.

## Recall Order

1. Apply user, scope, ownership, grant, expiry, and status filters.
2. Generate candidates through available lexical, vector, entity, and graph indexes.
3. Rerank by task relevance, memory type, status, confidence, and freshness.
4. Return selected, denied, and omitted items with reasons.
5. Return freshness metadata and potential state-conflict warnings for current-state queries.
6. Log the context pack before action.

When `requiresCurrentObservation` is true, recalled state is historical evidence only. The requester must use an authorized observation tool to read the current controlled object before taking action.

Never use a similarity score as a substitute for access checks or evidence review.

## Write Boundary

- Chat may write owner-level memory only through an allowed user-authorized path.
- Work writes its own memory.
- Work reads another Work only through an explicit grant and cannot write it by reference alone.
- System maintenance may rebuild derived indexes but cannot rewrite source observations or owner memory without a reviewed policy.
