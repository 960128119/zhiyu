# Loop Runtime Roadmap

This document is the persistent implementation contract for turning OpenZhiyu
from an AI workspace into a loop-first agent runtime.

Every implementation session should start by reading this file and end by
updating the progress section. Do not rely on chat history as the source of
truth for this migration.

## North Star

OpenZhiyu should treat a long-running loop as a first-class runtime object:

```text
Loop = goal + trigger + context + allowed actions + verification + state + approval
```

The current system has chat, insights, connectors, memory, scheduled jobs, MCP
tools, skills, and agent execution. The migration should preserve those pieces
while introducing a durable loop layer above them.

## Design Principles

- Loops are the primary object. Scheduled jobs become one trigger type.
- Loop state must be durable, inspectable, and recoverable.
- Loop runs must record what triggered them, what context was used, what actions
  were attempted, how verification passed or failed, and what happens next.
- External writes should be governed by explicit approval policy.
- Verification should start simple and become stronger over time.
- Existing scheduled-job behavior should keep working during the migration.

## Target Model

### Loop

```text
id
user_id
name
description
goal
status: active | paused | archived | error
trigger_config
context_config
action_policy
verification_config
approval_policy
retry_policy
escalation_policy
created_at
updated_at
```

### LoopRun

```text
id
loop_id
status: running | success | failed | blocked | needs_approval
trigger_reason
started_at
completed_at
input_snapshot
output_summary
verification_result
error
created_at
updated_at
```

### LoopState

```text
loop_id
current_phase
memory_summary
open_questions
last_observation
next_action
blocked_reason
state_json
updated_at
```

## Loop Spec Shape

The first Loop Spec should be JSON-compatible and safe to store in SQLite:

```json
{
  "goal": "Review project risk every morning",
  "trigger": {
    "type": "cron",
    "expression": "0 9 * * *",
    "timezone": "Asia/Shanghai"
  },
  "context": {
    "sources": [
      { "type": "insight", "filter": "project:Orion" },
      { "type": "memory", "query": "Orion project risks" }
    ]
  },
  "actions": {
    "allowed": ["searchUnifiedMemory", "chatInsight", "modifyInsight"],
    "requiresApproval": ["sendMessage", "sendEmail", "modifyExternalTicket"]
  },
  "verification": {
    "type": "structured_check",
    "successCriteria": [
      "At least one relevant source was checked",
      "Risk level is present",
      "Blockers include owner and next action when available"
    ]
  },
  "retry": {
    "maxAttempts": 2,
    "onFailure": "summarize_and_block"
  }
}
```

## Phased Plan

### Phase 1: Durable Loop Schema

- Add loop, loop run, and loop state schema definitions.
- Add SQLite migrations.
- Add typed service helpers for create/read/update/list operations.
- Keep this phase API-internal; no UI work yet.

### Phase 2: Scheduled Job Bridge

- Add `runLoop(loopId, triggerContext)` entry point.
- Allow a loop to be triggered manually.
- Allow existing scheduled jobs to delegate into `runLoop`.
- Preserve existing scheduled-job execution behavior.

### Phase 3: Loop Spec and First Template

- Define Loop Spec TypeScript types and validators.
- Add a Project Risk Review template.
- Store template-derived specs in loop records.

### Phase 4: Verification Step

- Add structured verification after maker execution.
- Start with deterministic checks: required fields, required context sources,
  expected artifacts, and tool-call evidence.
- Persist verification results in loop runs.

### Phase 5: Maker-Checker Runtime

- Add optional checker-agent verification.
- Feed checker feedback into maker retry when policy allows.
- Mark blocked or needs_approval when retries are exhausted.

### Phase 6: Approval and Capability Policy

- Model action classes: read, write_internal, write_external, dangerous.
- Enforce approval policy before external writes.
- Add audit records for approved and denied actions.

### Phase 7: Loop Dashboard

- Add list view: active, paused, needs approval, blocked, recently ran.
- Add detail view: goal, trigger, context, current state, runs, approvals,
  artifacts, and audit log.

### Phase 8: Loop Templates

- Promote repeatable loop specs into templates.
- Initial candidates: Daily Brief, Project Risk Review, Customer Escalation
  Monitor, Meeting Prep, Weekly Update, Personal CRM Follow-up.

## Progress

- [x] Created persistent roadmap.
- [x] Phase 1: Durable Loop Schema.
- [x] Phase 2: Scheduled Job Bridge.
- [x] Phase 3: Loop Spec and First Template.
- [x] Phase 4: Verification Step.
- [x] Phase 5: Maker-Checker Runtime.
- [x] Phase 6: Approval and Capability Policy.
- [x] Phase 7: Loop Dashboard.
- [x] Phase 8: Loop Templates.

## Current Working Notes

- Existing cron/scheduled-job code lives under `apps/web/lib/cron`.
- Existing agent abstraction lives under `packages/ai/src/agent`.
- Existing memory and insight search tools are exposed through
  `apps/web/lib/ai/mcp/tools`.
- Existing local-first memory storage includes SQLite and IndexedDB paths.
- Avoid breaking existing scheduled jobs while introducing the loop layer.
- Phase 1 added schema tables in both DB modes:
  - Postgres: `apps/web/lib/db/migrations/0105_add_loop_runtime_tables.sql`
  - SQLite: `apps/web/lib/db/migrations-sqlite/0104_add_loop_runtime_tables.sql`
- Phase 1 added Drizzle schema exports for `loops`, `loop_runs`, and
  `loop_states`.
- Phase 1 added internal service helpers under `apps/web/lib/loops`.
- Loop JSON fields use `serializeJson` / `deserializeJson` so SQLite stores
  text and Postgres stores jsonb without splitting the service layer.
- Phase 2 added `apps/web/lib/loops/runtime.ts` with:
  - `runLoop(loopId, triggerContext)` as the generic loop run entry point.
  - `getOrCreateLoopForScheduledJob(job)` to bridge legacy scheduled jobs
    through `triggerConfig: { type: "scheduled_job", scheduledJobId }`.
  - `runScheduledJobLoop(...)` to wrap legacy scheduled-job execution with
    durable `loop_run` and `loop_state` updates.
- Phase 2 routes legacy scheduled-job execution through the loop bridge from:
  - Desktop local scheduler: `apps/web/lib/cron/local-scheduler.ts`
  - Manual scheduled-job API:
    `apps/web/app/(chat)/api/scheduled-jobs/[id]/route.ts`
  - MCP scheduler tool: `apps/web/lib/ai/mcp/tools/scheduler.ts`
- Current bridge intentionally avoids a new scheduled-job foreign-key column.
  It finds/creates loops by parsing `triggerConfig.scheduledJobId`. If lookup
  becomes hot or ambiguous, upgrade to an explicit nullable
  `legacy_scheduled_job_id` column.
- Phase 3 added `apps/web/lib/loops/spec.ts` with a zod-backed Loop Spec v1:
  triggers, context sources, action policy, verification config, retry policy,
  approval policy, escalation policy, and metadata.
- Phase 3 added `loopSpecToCreateLoopInput(...)` so templates can persist a
  spec across the existing loop columns while also storing the full spec in
  `loop_state.state_json.loopSpec`.
- Phase 3 added `apps/web/lib/loops/templates.ts` with the first native
  template: Project Risk Review.
- Phase 3 added pure unit coverage in
  `apps/web/tests/unit/loop-spec.test.ts`.
- Verification: `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts`
  passes.
- Phase 4 added `apps/web/lib/loops/verifier.ts`, a deterministic verifier
  that produces standardized `passed`, `issues`, `evidence`, and `checkedAt`
  fields.
- Phase 4 verifier supports:
  - `legacy_status`: pass/fail based on job execution status.
  - `structured_check`: required fields, required sources, and basic output
    evidence from `structuredReport`.
- Phase 4 updated `apps/web/lib/cron/executor.ts` to include
  `structuredReport` in `JobExecutionResult.result`, making verification
  evidence durable.
- Phase 4 updated `runScheduledJobLoop(...)` to persist standardized
  verification results in `loop_runs.verification_result`.
- Phase 4 added unit coverage in `apps/web/tests/unit/loop-verifier.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-verifier.test.ts tests/unit/loop-spec.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 4.
- Phase 5 added `apps/web/lib/loops/checker.ts`, a maker-checker contract
  layer over deterministic verification. This phase intentionally does not
  trigger a second model call yet.
- Phase 5 checker support includes:
  - `runDeterministicChecker(...)` to convert verification output into checker
    feedback.
  - `decideLoopOutcome(...)` to choose complete, retry, block, fail, or
    needs_approval from checker feedback and retry policy.
  - `buildCheckerVerificationPayload(...)` to persist verification, checker,
    and decision together in `loop_runs.verification_result`.
- Phase 5 updated `runScheduledJobLoop(...)` so legacy bridged runs now persist
  maker-checker decisions and update `loop_state` with retry/block/approval
  next actions.
- Phase 5 added unit coverage in `apps/web/tests/unit/loop-checker.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts tests/unit/loop-spec.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 5.
- Phase 6 added `apps/web/lib/loops/approval.ts`, a capability and approval
  policy layer.
- Phase 6 supports action classification into `read`, `write_internal`,
  `write_external`, and `dangerous`.
- Phase 6 supports approval decisions: `allow`, `require_approval`, and
  `deny`, combining loop action policy with loop approval policy.
- Phase 6 extracts advisory actions from `structuredReport.suggestedActions`
  and persists approval evaluation inside `loop_runs.verification_result`.
- Phase 6 updates `loop_state.state_json` with
  `lastApprovalRequiresApproval` and `lastApprovalDenied` for dashboard/API
  visibility.
- Phase 6 intentionally keeps hard enforcement advisory until approvals are
  visible in a dashboard or tool gate. Dangerous actions are classified as
  denied by the helper, but existing legacy scheduled-job behavior is not
  broken by this phase.
- Phase 6 added unit coverage in `apps/web/tests/unit/loop-approval.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts tests/unit/loop-spec.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 6.
- Phase 7 added `apps/web/lib/loops/dashboard.ts`, a minimal dashboard
  aggregation layer for loop list/detail views.
- Phase 7 dashboard summaries expose:
  - loop goal, trigger, status, current phase, next action, blocked reason
  - latest run status, output, error, verification pass/fail
  - checker action and approval/denial flags
  - counts for active, paused, blocked, needs_approval, error, and archived
- Phase 7 added authenticated API routes:
  - `GET /api/loops`
  - `GET /api/loops/[id]`
- Phase 7 is intentionally a minimal API/service dashboard surface, not a full
  polished frontend page yet.
- Phase 7 added unit coverage in `apps/web/tests/unit/loop-dashboard.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts tests/unit/loop-spec.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 7.
- Phase 8 promoted templates into a registry in
  `apps/web/lib/loops/templates.ts`.
- Phase 8 template registry supports:
  - Project Risk Review
  - Daily Brief
  - Meeting Prep
  - Weekly Update
  - Personal CRM Follow-up
- Phase 8 added a single template instantiation contract:
  `createLoopFromTemplate(...)`, plus `listLoopTemplates(...)`,
  `getLoopTemplate(...)`, and `buildLoopSpecFromTemplate(...)`.
- Phase 8 added authenticated template API:
  - `GET /api/loops/templates`
  - `POST /api/loops/templates`
- Phase 8 preserved the older Project Risk Review helper exports for
  compatibility.
- Phase 8 expanded unit coverage in `apps/web/tests/unit/loop-spec.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 8.
- Phase 9 added the first native loop execution entrypoint.
- Phase 9 refactored `apps/web/lib/loops/runtime.ts` so legacy scheduled-job
  loops and native loops share the same completion pipeline:
  verification -> checker -> approval evaluation -> loop run persistence ->
  loop state update.
- Phase 9 added `runNativeLoopOnce(...)`, which can manually trigger active
  non-legacy loops and complete a durable `loop_runs` record.
- Phase 9 currently supports a conservative dry-run execution mode for native
  loops. This intentionally exercises persistence, verification, checker, and
  approval state without running an autonomous agent or external writes.
- Phase 9 added authenticated API:
  - `POST /api/loops/[id]/execute`
- Phase 9 rejects `dryRun: false` until native agent execution is explicitly
  wired, which keeps the route honest while making the state machine testable
  from UI/API clients.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 9.
- Phase 10 added the first lightweight frontend Loop Dashboard at
  `apps/web/app/(chat)/loops/page.tsx`.
- Phase 10 dashboard supports:
  - loop status counts
  - loop list and selected-loop detail
  - current phase, latest run, follow-up state, and recent run history
  - template registry preview
  - manual dry-run execution through `POST /api/loops/[id]/execute`
- Phase 10 added a sidebar entry for `/loops` beside the existing Agent and
  Library entries.
- Phase 10 intentionally does not add a complex template creation form yet.
  The immediate goal is observability and manual loop execution control.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 10.
- Phase 11 added template creation directly inside the Loop Dashboard.
- Phase 11 dashboard creation supports:
  - choosing a registered loop template
  - required template inputs such as `projectName` and `meetingTopic`
  - optional project/contact scope fields
  - cron expression, timezone, and description
  - `POST /api/loops/templates` submission
  - automatic dashboard refresh and selection of the newly created loop
- Phase 11 updated the empty state so users can create the first loop without
  leaving `/loops`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 11.
- Phase 12 added a real native loop agent executor in
  `apps/web/lib/loops/native-executor.ts`.
- Phase 12 native agent execution:
  - builds a Loop Engineering prompt from the loop spec and durable loop state
  - uses the user's Anthropic-compatible LLM settings when configured
  - runs the existing Claude Agent integration in a per-loop workspace
  - asks the agent to collect/read/analyze context but avoid external writes
  - parses or repairs `<structured-output>` into a durable structured report
  - returns a `JobExecutionResult` that flows through the same verifier,
    checker, approval, run persistence, and state update pipeline as dry runs
- Phase 12 updated `POST /api/loops/[id]/execute`:
  - `dryRun: true` keeps the safe state-machine dry run
  - `dryRun: false` runs the native agent executor
- Phase 12 updated `/loops` so selected native loops have separate `Dry Run`
  and `Run` actions.
- Phase 12 intentionally keeps native agent execution conservative. External
  writes are forbidden in the prompt and should be returned as suggested
  actions until hard tool-gateway approval enforcement exists.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 12.
- Phase 13 added native loop scheduling.
- Phase 13 added pure scheduling helpers in `apps/web/lib/loops/schedule.ts`:
  - native trigger detection for `cron`, `interval`, and `once`
  - conversion from loop trigger config to schedule config
  - effective next-run computation using `loop_state.state_json`
  - due checks
  - next-run reservation before execution to avoid duplicate launches
- Phase 13 added `apps/web/lib/loops/native-scheduler.ts`, which:
  - scans active native scheduled loops for the current scheduler user
  - persists `nextScheduledRunAt`, `lastScheduledRunAt`, and
    `schedulerStatus` in `loop_state.state_json`
  - prevents duplicate in-process executions with a running-loop set
  - triggers `runNativeLoopOnce(...)` with `executeNativeLoopAgent(...)`
  - marks scheduler errors in loop state
- Phase 13 wired native loop scheduling into the existing desktop
  `local-scheduler` maintenance heartbeat.
- Phase 13 exposes scheduler fields in loop dashboard summaries and shows
  `Next schedule` in `/loops`.
- Phase 13 added unit coverage in `apps/web/tests/unit/loop-schedule.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 13.
- Phase 14 added the first hard approval/tool gate for native loop agent runs.
- Phase 14 improved action classification so MCP-prefixed tool names such as
  `mcp__business-tools__sendReply` classify by their leaf tool name.
- Phase 14 added `apps/web/lib/loops/tool-gate.ts`, which converts loop
  action/approval policy into an agent permission decision:
  - `allow` -> tool call allowed
  - `require_approval` -> tool call denied in non-interactive loop execution
  - `deny` -> tool call denied
- Phase 14 wired native loop agent execution to Claude Agent's permission
  callback by using `permissionMode: "default"` and
  `onPermissionRequest`.
- Phase 14 persists tool gate decisions inside
  `JobExecutionResult.result.toolGate` and folds them into approval extraction,
  so denied/approval-required tool calls become visible in loop run
  verification payloads and dashboard status.
- Phase 14 intentionally scopes hard enforcement to native loop agent runs.
  Legacy scheduled jobs and ordinary chat agent runs are not changed by this
  phase.
- Phase 14 added unit coverage in
  `apps/web/tests/unit/loop-tool-gate.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 14.
- Phase 15 added a read-only approval inbox surface.
- Phase 15 persists native loop tool gate decisions into
  `loop_runs.verification_result.toolGate`, so blocked tool calls can be
  reconstructed after the run completes.
- Phase 15 added `apps/web/lib/loops/approval-inbox.ts`, which summarizes
  pending and denied approval items from loop run verification payloads.
- Phase 15 added authenticated API:
  - `GET /api/loops/approvals`
- Phase 15 updated `/loops` to show an Approvals panel with pending/denied
  counts and recent approval items.
- Phase 15 is intentionally read-only. It does not yet approve, reject, edit,
  or resume a blocked tool call because those actions require a persistent
  approval request model.
- Phase 15 added unit coverage in
  `apps/web/tests/unit/loop-approval-inbox.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 15.
- Phase 16 added a persistent approval request model.
- Phase 16 schema/migrations added `loop_approval_requests` in both database
  modes:
  - Postgres:
    `apps/web/lib/db/migrations/0106_add_loop_approval_requests.sql`
  - SQLite:
    `apps/web/lib/db/migrations-sqlite/0105_add_loop_approval_requests.sql`
- Phase 16 added service helpers for creating, listing, and resolving approval
  requests:
  - `createLoopApprovalRequest(...)`
  - `listLoopApprovalRequests(...)`
  - `resolveLoopApprovalRequest(...)`
- Phase 16 updated native loop tool gate decisions to carry `toolInput` and
  `toolUseID`, so approval requests know which attempted action they refer to.
- Phase 16 updates runtime completion so `require_approval` tool gate decisions
  create durable pending approval requests. Hard-denied dangerous actions remain
  audit-only in the run verification payload.
- Phase 16 upgraded the approval inbox to prefer durable approval requests
  while still reconstructing legacy denied/pending items from run payloads.
- Phase 16 added authenticated approval resolution API:
  - `PATCH /api/loops/approvals/[id]`
- Phase 16 updated `/loops` so pending durable approval requests can be marked
  approved or rejected from the Approvals panel.
- Phase 16 is intentionally limited to approval request state management. It
  does not yet resume a blocked tool call after approval.
- Phase 16 added/expanded unit coverage in:
  - `apps/web/tests/unit/loop-tool-gate.test.ts`
  - `apps/web/tests/unit/loop-approval-inbox.test.ts`
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 16.
- Phase 17 added approval continuation semantics without automatically
  executing external writes.
- Phase 17 added `apps/web/lib/loops/approval-continuation.ts`, which converts
  an approved `loop_approval_requests` row into a stable continuation payload:
  - `type: "tool_call"`
  - `status: "ready" | "not_resumable"`
  - `approvalRequestId`, `loopId`, `loopRunId`, `actionName`, `capability`
  - `toolUseID`, `toolInput`, `approvedBy`, `approvedAt`
  - `resumeMode: "manual_review" | "agent_replay"`
- Phase 17 added `GET /api/loops/approvals/[id]` to return an approval request
  plus a continuation preview.
- Phase 17 updated `PATCH /api/loops/approvals/[id]` so approving a pending
  request:
  - builds a continuation payload
  - stores it in `loop_approval_requests.action_payload.continuation`
  - appends it to `loop_state.state_json.pendingApprovalContinuations`
  - updates loop state with `lastApprovedRequestId` and a resumable next action
- Phase 17 keeps rejected and superseded requests as terminal state updates
  without creating continuation payloads.
- Phase 17 surfaces continuation readiness in the `/loops` Approvals panel for
  approved requests.
- Phase 17 added unit coverage in:
  - `apps/web/tests/unit/loop-approval-continuation.test.ts`
  - `apps/web/tests/unit/loop-approval-inbox.test.ts`
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 17.
- Phase 18 added an explicit approval continuation resume executor.
- Phase 18 added `apps/web/lib/loops/approval-resume.ts`, which supports:
  - reading continuation payloads from approved approval requests
  - finding matching entries in `loop_state.state_json.pendingApprovalContinuations`
  - creating a durable loop run for the resume event
  - moving the continuation from pending state into
    `consumedApprovalContinuations`
  - marking the approval request payload continuation as `status: "consumed"`
- Phase 18 added authenticated manual resume API:
  - `POST /api/loops/approvals/[id]/resume`
- Phase 18 updated `/loops` so approved requests with
  `continuationStatus: "ready"` show a `Resume` action.
- Phase 18 intentionally keeps resume as an audit/consumption step. It records
  the approved action and prepares the runtime for true replay, but it does not
  execute external tool calls yet.
- Phase 18 added unit coverage in:
  - `apps/web/tests/unit/loop-approval-resume.test.ts`
  - `apps/web/tests/unit/loop-approval-inbox.test.ts`
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 18.
- Phase 19 added the true replay adapter boundary without enabling broad
  external execution by default.
- Phase 19 added `apps/web/lib/loops/approval-replay.ts`, which defines:
  - `LoopApprovalReplayAdapter`
  - stable replay idempotency keys
  - leaf-name adapter matching for MCP-prefixed tool names
  - replay planning with allowlist blocking
  - adapter execution result normalization
- Phase 19 added replay types:
  - `LoopApprovalReplayPlan`
  - `LoopApprovalReplayResult`
- Phase 19 added `replayLoopApprovalContinuation(...)`, which creates a durable
  loop run for replay attempts, writes a second verification payload, and
  updates loop state with the latest replay result.
- Phase 19 added authenticated replay API:
  - `POST /api/loops/approvals/[id]/replay`
- Phase 19 updated `/loops` so approved requests with
  `continuationStatus: "consumed"` show a `Replay` action.
- Phase 19 intentionally ships with an empty default adapter list:
  `DEFAULT_LOOP_APPROVAL_REPLAY_ADAPTERS = []`. Replay attempts are therefore
  blocked and audited until a specific adapter is allowlisted.
- Phase 19 added unit coverage in:
  - `apps/web/tests/unit/loop-approval-replay.test.ts`
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 19.
- Phase 20 added the first low-risk allowlisted replay adapter:
  `recordLoopAudit`.
- Phase 20 updated `apps/web/lib/loops/approval-replay.ts` with:
  - `createRecordLoopAuditReplayAdapter()`
  - `sanitizeReplayToolInput(...)` with redaction for common secret-bearing
    fields such as tokens, cookies, passwords, secrets, and API keys
  - `DEFAULT_LOOP_APPROVAL_REPLAY_ADAPTERS` containing only
    `recordLoopAudit`
- Phase 20 keeps external communication tools blocked by default. For example,
  `sendReply` still requires a future explicit adapter.
- Phase 20 expanded replay unit coverage for redaction and internal audit
  replay.
- Phase 21 added an approval detail view to `/loops`.
- Phase 21 updated `GET /api/loops/approvals/[id]` to return sanitized
  approval detail data and to respect an existing continuation payload status
  such as `consumed`.
- Phase 21 updated the Approvals panel with a `Details` action that shows:
  - action name and capability
  - approval status and continuation status
  - tool use id
  - policy reason/message
  - sanitized tool input JSON
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 21.
- Phase 22 added a model-backed checker extension point without changing
  default runtime behavior.
- Phase 22 updated `apps/web/lib/loops/checker.ts` with:
  - `LoopModelChecker`
  - `runLoopChecker(...)`
  - hybrid checker results that combine deterministic verification with
    optional model feedback
- Phase 22 updated loop runtime to call `runLoopChecker(...)`. With no model
  checker injected, behavior remains deterministic.
- Phase 22 expanded checker unit coverage for deterministic fallback and hybrid
  model feedback that can request human approval.
- Phase 23 added replay idempotency persistence in loop state.
- Phase 23 updated `apps/web/lib/loops/approval-replay.ts` with:
  - `hasApprovalReplayHistory(...)`
  - `appendApprovalReplayHistory(...)`
- Phase 23 updated replay execution so duplicate idempotency keys are blocked
  before an adapter is called. Duplicate attempts still create a replay run for
  auditability, but they do not append another replay-history entry.
- Phase 23 expanded replay unit coverage for idempotency history.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 23.
- Phase 24 added explicit replay confirmation tokens for external or dangerous
  continuations.
- Phase 24 updated replay planning so continuations with capability
  `write_external` or `dangerous` are blocked unless the caller provides the
  exact confirmation token for that approval request, tool use id, and action.
- Phase 24 added `buildLoopApprovalReplayConfirmationToken(...)`.
- Phase 24 updated `GET /api/loops/approvals/[id]` to expose the confirmation
  token only in the approval detail response, alongside sanitized tool input.
- Phase 24 updated `POST /api/loops/approvals/[id]/replay` to accept a
  `confirmationToken` body field.
- Phase 24 updated `/loops` so replay calls include the detail-view token when
  the user has opened the approval detail.
- Phase 24 expanded replay unit coverage for external confirmation blocking.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 24.
- Phase 25 added replay adapter metadata and registry visibility.
- Phase 25 expanded `LoopApprovalReplayAdapter` with:
  - `capability`
  - `riskLevel`
  - `description`
  - `requiresConfirmation`
- Phase 25 added `listLoopApprovalReplayAdapters(...)`, returning adapter
  summaries without exposing execute functions.
- Phase 25 added authenticated adapter registry API:
  - `GET /api/loops/approvals/adapters`
- Phase 25 updated `recordLoopAudit` metadata as a low-risk internal write
  adapter.
- Phase 25 expanded replay tests for registry summaries.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 25.
- Phase 26 strengthened the replay confirmation UX.
- Phase 26 updated `/loops` so consumed continuations with capability
  `write_external` or `dangerous` no longer replay directly from the approval
  list. The button opens the detail dialog for review instead.
- Phase 26 added a detail-dialog confirmation checkbox. External or dangerous
  replay attempts require the user to review sanitized input and opt in before
  the replay call includes the confirmation token.
- Phase 26 updated `GET /api/loops/approvals/[id]` so replay confirmation
  tokens are returned only when the continuation capability is external or
  dangerous. Internal audit replay does not require a token.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 26.
- Phase 27 added the first low-risk external replay adapter:
  `draftExternalReply`.
- Phase 27 updated `apps/web/lib/loops/approval-replay.ts` with
  `createDraftExternalReplyReplayAdapter()`.
- `draftExternalReply` is an external-write adapter, but it only creates a
  sanitized draft artifact. It does not send messages, email, or platform
  replies.
- `draftExternalReply` requires replay confirmation and returns:
  - `type: "loop_external_reply_draft"`
  - `sent: false`
  - `requiresFinalSendAdapter: true`
  - sanitized draft fields such as channel, recipient, subject, body, context
- Phase 27 updated the default replay adapter registry to include:
  - `recordLoopAudit`
  - `draftExternalReply`
- Phase 27 updated the approval detail dialog to show available replay adapter
  metadata, so users can see that the current external adapter drafts but does
  not send.
- Phase 27 expanded replay unit coverage for external draft replay behavior.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 27.
- Phase 28 added durable draft review/edit support for external reply drafts.
- Phase 28 updated replay history to persist `adapterResult`, making draft
  artifacts recoverable from loop state.
- Phase 28 added `apps/web/lib/loops/approval-drafts.ts`, with helpers to:
  - list external reply drafts from `loop_state.state_json.approvalReplayHistory`
  - update draft fields
  - transition draft status among `draft`, `needs_revision`, `ready_to_send`,
    and `discarded`
- Phase 28 added authenticated draft APIs:
  - `GET /api/loops/[id]/drafts`
  - `GET /api/loops/[id]/drafts/[draftId]`
  - `PATCH /api/loops/[id]/drafts/[draftId]`
- Phase 28 updated `/loops` approval detail dialog to show and edit generated
  external reply drafts, including recipient, subject, body, and status.
- Phase 28 does not add final send. A draft marked `ready_to_send` only updates
  loop state with the next action for final-send eligibility review.
- Phase 28 added unit coverage in
  `apps/web/tests/unit/loop-approval-drafts.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 28.
- Phase 29 added final-send eligibility checks for reviewed external reply
  drafts.
- Phase 29 added `evaluateExternalReplyDraftEligibility(...)`, which requires:
  - draft status is `ready_to_send`
  - draft is not sent
  - draft requires a final send adapter
  - draft has an idempotency key
  - recipient is present
  - body is present
- Phase 29 returns a stable final-send idempotency key:
  `loop-final-send:{loopId}:{approvalRequestId}:{draftId}`.
- Phase 29 updated draft list/detail/update APIs so every draft response
  includes its current eligibility.
- Phase 29 updated `/loops` draft review UI to show final-send eligibility,
  blocking reasons, and the final-send idempotency key when ready.
- Phase 29 expanded draft unit coverage for final-send eligibility.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 29.
- Phase 30 added the final-send adapter shell.
- Phase 30 added `apps/web/lib/loops/approval-final-send.ts`, which defines:
  - `LoopExternalFinalSendAdapter`
  - `LoopExternalFinalSendPlan`
  - `LoopExternalFinalSendResult`
  - `buildExternalFinalSendConfirmationToken(...)`
  - `createExternalFinalSendPlan(...)`
  - `runExternalFinalSendAdapter(...)`
- Phase 30 intentionally ships with
  `DEFAULT_LOOP_EXTERNAL_FINAL_SEND_ADAPTERS = []`, so final send attempts are
  blocked until a concrete platform adapter proves delivery idempotency.
- Phase 30 added authenticated final-send shell API:
  - `POST /api/loops/[id]/drafts/[draftId]/send`
- Phase 30 records blocked final-send attempts in
  `loop_state.state_json.finalSendAttempts` and exposes the latest result in
  `lastFinalSendResult`.
- Phase 30 updated draft APIs to include final-send plan and confirmation token
  previews.
- Phase 30 updated `/loops` draft review UI with a final-send safety check
  section and confirmation checkbox. This currently runs the shell and is
  expected to block without a platform adapter.
- Phase 30 added unit coverage in
  `apps/web/tests/unit/loop-approval-final-send.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 30.
- Phase 31 added a cross-scenario loop action guard.
- Phase 31 added `apps/web/lib/loops/action-guard.ts`, which evaluates action
  names against the same loop action and approval policies in two modes:
  - `advisory`: non-allow decisions are audited but do not block
  - `enforce`: non-allow decisions block
- Phase 31 updated loop runtime completion to persist an `actionGuard` payload
  inside `loop_runs.verification_result`.
- Phase 31 uses action guard modes by scenario:
  - native loop execution: `enforce`
  - legacy scheduled-job loop bridge: `advisory`
- Phase 31 updates loop state with `lastActionGuardBlocked` and
  `lastActionGuardMode`.
- Phase 31 updated dashboard run summaries with `actionGuardMode` and
  `actionGuardBlocked`, and derives blocked dashboard status when an enforced
  guard blocks.
- Phase 31 added unit coverage in:
  - `apps/web/tests/unit/loop-action-guard.test.ts`
  - `apps/web/tests/unit/loop-dashboard.test.ts`
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 31.
- Phase 32 added an ordinary chat/tool action guard adapter.
- Phase 32 added `apps/web/lib/loops/chat-loop-guard.ts`, which can:
  - resolve optional loop context for a user/chat execution
  - convert a loop into `ChatLoopGuardContext`
  - evaluate chat tool names through the Phase 31 action guard in advisory mode
- Phase 32 updated `apps/web/lib/ai/runtime/shared.ts` with optional
  `loopIdForGuard`.
- If `loopIdForGuard` is provided, shared chat runtime now resolves loop policy
  context and emits advisory warnings when tool use requires approval or is
  denied by the loop policy.
- Phase 32 intentionally preserves existing chat behavior by default. No caller
  passes `loopIdForGuard` yet, so ordinary chat is not blocked or changed unless
  a caller opts in.
- Phase 32 added unit coverage in
  `apps/web/tests/unit/loop-chat-guard.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 32.
- Phase 33 added a prompt-based model checker adapter shell.
- Phase 33 added `apps/web/lib/loops/model-checker.ts`, which provides:
  - `buildLoopModelCheckerPrompt(...)` with bounded prompt construction and
    truncation metadata
  - `parseLoopModelCheckerResponse(...)` with JSON extraction, response shape
    validation, and fail-closed handling
  - `createPromptModelChecker(...)`, an injected-transport adapter for the
    Phase 22 `LoopModelChecker` interface
- Phase 33 intentionally does not wire model checking into runtime by default.
  It only creates the safe boundary needed to connect an LLM provider later.
- Invalid or non-JSON model checker responses now have a tested conservative
  behavior: the checker result fails closed and requests human approval.
- Phase 33 added unit coverage in
  `apps/web/tests/unit/loop-model-checker.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 33.
- Phase 34 added explicit opt-in runtime wiring for model checking.
- Phase 34 extended `loopVerificationSchema` with optional
  `modelChecker: { enabled, provider, model, maxInputChars }`.
- Phase 34 added `resolveLoopModelChecker(...)`, which:
  - keeps model checking disabled unless `verification.modelChecker.enabled`
    is true
  - uses an injected checker adapter only when the loop opted in
  - fails closed and requests human approval when a loop opted in but no
    adapter is configured
- Phase 34 updated native loop execution and scheduled-job loop bridge to pass
  the resolved model checker into `runLoopChecker(...)`.
- Phase 34 writes model-checker resolution metadata into the durable
  verification payload.
- Phase 34 added unit coverage in:
  - `apps/web/tests/unit/loop-model-checker.test.ts`
  - `apps/web/tests/unit/loop-spec.test.ts`
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 34.
- Phase 35 added model-checker creation controls to `/loops`.
- Phase 35 updated `LoopTemplateInput` and the template input schema to accept
  optional `modelChecker` overrides.
- Phase 35 applies template-level model-checker overrides into
  `spec.verification.modelChecker` before persisting the loop.
- Phase 35 updated the New Loop dialog with:
  - an explicit Model Checker switch
  - a prompt budget input shown only when model checking is enabled
  - client-side budget validation from 2,000 to 50,000 chars
- Phase 35 preserves the default behavior: newly created loops have model
  checking disabled unless the user explicitly turns it on.
- Phase 35 added unit coverage in `apps/web/tests/unit/loop-spec.test.ts`.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 35.
- Phase 36 surfaced checker/model-checker audit metadata in loop dashboards.
- Phase 36 updated `summarizeLoopRun(...)` to expose:
  - `checkerType`
  - `modelCheckerEnabled`
  - `modelCheckerReason`
- Phase 36 updated `/loops` Recent Runs to show deterministic/hybrid checker
  type and model-check opt-in/unavailable reason.
- Phase 36 added dashboard unit coverage for checker type and model-checker
  metadata.
- Verification:
  `pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm --filter web tsc --noEmit` passes after Phase 36.
- Phase 37 performed local `/loops` QA against the dev server.
- Phase 37 started the web app on `http://localhost:3515` and confirmed:
  - `GET /loops` returns 200
  - `GET /api/loops/templates` returns 200
  - `GET /api/loops/approvals/adapters` returns 200
- Phase 37 local QA also found an environment blocker for DB-backed loop data:
  `better-sqlite3` was compiled for Node module ABI 127 while the current
  Node runtime expects ABI 137, causing `/api/loops`,
  `/api/loops/approvals`, `/api/categories`, and `/api/user/profile` to fail.
- Phase 37 added a `/loops` dashboard error state so DB/API failures no longer
  appear as an indefinite loading spinner.
- The `/loops` error state preserves New Loop and Refresh actions, allowing
  template-backed creation controls to remain reachable when dashboard loading
  fails.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 37.
- Phase 38 wired chat/tool advisory guard context through integration runtime
  entrypoints.
- Phase 38 extended `AIHandlerOptions` in `@openzhiyu/integrations` with
  optional `loopIdForGuard`.
- Phase 38 updated `WebAIHandler` to pass `loopIdForGuard` into the shared
  agent runtime.
- Phase 38 updated Telegram, WhatsApp, and iMessage runtime wrapper option
  types to accept `loopIdForGuard`.
- Existing behavior remains unchanged unless an upstream caller explicitly
  supplies a loop id.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 38.
- Phase 39 added a concrete OpenAI-compatible model checker transport.
- Phase 39 added `createOpenAICompatibleModelCheckerTransport(...)`, which:
  - posts bounded checker prompts to `/chat/completions`
  - sends system/user messages and requests JSON object output
  - extracts content from `choices[0].message.content` or `choices[0].text`
  - surfaces provider HTTP errors as explicit checker transport failures
- Phase 39 keeps provider usage opt-in only. No runtime path creates this
  transport automatically yet.
- Phase 39 added unit coverage in
  `apps/web/tests/unit/loop-model-checker.test.ts`.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 39.
- Phase 40 wired model checker runtime creation to user model settings.
- Phase 40 added `getLoopModelCheckerConfig(...)` so runtime code can inspect
  `verification.modelChecker` without duplicating schema parsing.
- Phase 40 updated loop runtime completion and failure paths to:
  - keep model checking disabled unless `verification.modelChecker.enabled`
    is true
  - prefer an explicitly injected model checker when one is provided
  - create a prompt model checker using the user's `openai_compatible`
    settings, or `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` env settings
  - fail closed with human approval when model checking is enabled but provider
    settings are missing or unsupported
- Phase 40 added unit coverage in
  `apps/web/tests/unit/loop-model-checker.test.ts`.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 40.
- Phase 41 resolved the local SQLite native ABI blocker for QA.
- Phase 41 downloaded portable Node `v22.22.3` into
  `D:\ai_workspace\tools`, matching `better-sqlite3` ABI 127.
- Phase 41 rebuilt `better-sqlite3` successfully under Node 22:
  `pnpm.cmd rebuild better-sqlite3`.
- Phase 41 reran the web dev server with Node 22 and `TAURI_DB_PATH` pointing
  to a writable workspace DB under `.codex-logs`.
- Phase 41 confirmed SQLite opens successfully and all 45 SQLite migrations,
  including loop runtime migrations `0104` and `0105`, apply cleanly.
- Remaining QA limitation: this sandbox session cannot keep the local dev
  server/browser automation alive long enough for authenticated `/loops`
  browser interaction. The previous browser MCP attempt failed with
  `CreateProcessAsUserW failed: 5`, and hidden dev-server processes were
  reclaimed after startup despite successful DB initialization.
- Phase 42 wired native agent permission requests to loop guard advisory
  metadata.
- Phase 42 extended `POST /api/native/agent` request bodies with optional
  `loopIdForGuard`.
- Phase 42 resolves loop guard context for the authenticated user and, when a
  tool permission request maps to a non-allow loop policy decision, annotates
  the emitted permission request with:
  - `decisionReason`
  - `loopGuardDecision`
  - `loopGuardReason`
  - `loopGuardLoopId`
- Phase 42 remains advisory for native chat/agent usage; it does not auto-deny
  existing permission flows.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 42.
- Phase 43 extracted native agent loop guard metadata into a reusable loop
  module.
- Phase 43 added `apps/web/lib/loops/native-agent-guard.ts` with:
  - `NativeAgentPermissionRequestEvent`
  - `withNativeAgentLoopGuardMetadata(...)`
- Phase 43 updated `POST /api/native/agent` to use the loop module instead of
  keeping policy decoration logic inline in the large route file.
- Phase 43 added unit coverage in
  `apps/web/tests/unit/loop-native-agent-guard.test.ts`.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 43.
- Phase 44 added integration-style coverage for runtime-created model checkers
  without requiring DB-backed loop execution.
- Phase 44 extracted runtime model-checker creation into
  `createRuntimeLoopModelChecker(...)` in `apps/web/lib/loops/model-checker.ts`.
- Phase 44 keeps runtime behavior the same while making these paths testable:
  - disabled config returns the injected candidate or `null`
  - enabled config prefers injected candidates
  - OpenAI-compatible user settings create a prompt model checker
  - loop-level model overrides provider default model
  - missing settings fail closed with human approval
  - unsupported providers fail closed with human approval
- Phase 44 updated `apps/web/lib/loops/runtime.ts` to delegate model-checker
  construction to the reusable factory after loading user/env provider config.
- Phase 44 expanded unit coverage in
  `apps/web/tests/unit/loop-model-checker.test.ts`.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 44.
- Phase 45 added post-creation model checker editing.
- Phase 45 added `PATCH /api/loops/[id]` with a narrow update surface for
  `verification.modelChecker`.
- Phase 45 validates model checker updates with the same bounds used during
  creation: explicit `enabled` plus optional provider/model and a 2,000-50,000
  char prompt budget.
- Phase 45 merges model checker changes into the existing verification config
  instead of replacing unrelated verification requirements.
- Phase 45 updated `/loops` detail with a Model Checker card so existing loops
  can enable/disable hybrid checking and save prompt budget changes.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 45.
- Phase 46 added a repeatable local loop runtime smoke harness.
- Phase 46 added `apps/web/scripts/loop-runtime-smoke.ts` and
  `pnpm --filter web smoke:loops`.
- The smoke harness runs in SQLite/Tauri mode against a workspace-writable DB
  under `.codex-logs`, initializes migrations, creates a template-derived
  Daily Brief loop, triggers a native dry-run execution, verifies dashboard
  detail/list visibility, and cleans up smoke user/loop/run/state rows.
- Phase 46 intentionally treats a template dry run without real context as a
  valid blocked/retry result. The important contract is that verification,
  checker decision, loop state, and dashboard status are durably persisted and
  inspectable.
- Phase 46 relaxed two unit tests that had accidentally coupled backend
  contracts to localized display strings.
- Verification: `pnpm.cmd --filter web smoke:loops` passes after Phase 46.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 46.
- Phase 47 hardened native loop scheduling for repeatable automation QA.
- Phase 47 updated `apps/web/lib/loops/native-scheduler.ts` so scheduled
  native loops can be run in an explicit `dry_run` mode and optionally awaited
  by smoke/integration checks. Default scheduler behavior remains asynchronous
  agent execution.
- Phase 47 lazy-loads the native agent executor only for real agent execution,
  keeping dry-run scheduler checks and loop unit tests free of heavy agent
  sandbox dependencies.
- Phase 47 marks scheduler state back to `idle` after recurring scheduled runs
  complete, while preserving `completed_once` for one-time triggers. This keeps
  dashboard scheduler state from getting stuck at `reserved`/`running` after a
  successful run.
- Phase 47 expanded `pnpm --filter web smoke:loops` to cover a due one-time
  native scheduled loop: persisted due state -> scheduler scan -> dry-run loop
  execution -> durable run/state/dashboard verification.
- Verification: `pnpm.cmd --filter web smoke:loops` passes after Phase 47.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 47.
- Phase 48 added focused unit coverage for native scheduling.
- Phase 48 added `apps/web/tests/unit/loop-native-scheduler.test.ts`, covering:
  - due-loop discovery from persisted `nextScheduledRunAt`
  - scheduler dry-run execution without loading the native agent executor
  - one-time trigger completion state persistence
  - scheduler error handling preserving runtime-written state such as
    `lastLoopRunId` and verification flags
- Phase 48 updated scheduler error persistence to merge the latest loop state
  before writing scheduler error metadata. This avoids overwriting run details
  that `runNativeLoopOnce(...)` may have just persisted during a failed run.
- Phase 48 made awaited scheduler failures non-throwing after durable error
  state is recorded, so scheduler scans can continue reporting launch counts
  instead of aborting the whole scan.
- Verification: `pnpm.cmd --filter web smoke:loops` passes after Phase 48.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-schedule.test.ts tests/unit/loop-native-scheduler.test.ts tests/unit/loop-action-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-tool-gate.test.ts tests/unit/loop-approval-continuation.test.ts tests/unit/loop-approval-resume.test.ts tests/unit/loop-approval-replay.test.ts tests/unit/loop-approval-drafts.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-inbox.test.ts tests/unit/loop-dashboard.test.ts tests/unit/loop-approval.test.ts tests/unit/loop-checker.test.ts tests/unit/loop-model-checker.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-verifier.test.ts`
  passes.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 48.

- Phase 49 wired loop guard entry points into product UX.
- Phase 49 updated `streamNativeAgentResponse(...)` to accept and forward
  `loopIdForGuard` to `/api/native/agent`, preserving the existing native chat
  request shape while enabling guarded tool execution from concrete UI flows.
- Phase 49 updated `ChatContextProvider` to read `loopIdForGuard` from the
  chat URL query string and include it in native agent requests.
- Phase 49 rebuilt `/loops` as a typed, compilable operations surface after a
  local encoding regression, keeping template creation, dashboard counts,
  manual dry-run, real agent run, approval resolution, recent runs, and the new
  `Guarded chat` action. The action opens `/chat?loopIdForGuard=...&loopName=...`.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 49.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-chat-guard.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-native-scheduler.test.ts tests/unit/loop-spec.test.ts`
  passes after Phase 49.
- Verification: direct Node 22 smoke command passes after Phase 49:
  `Push-Location apps/web; node --conditions=react-server ../../node_modules/tsx/dist/cli.mjs scripts/loop-runtime-smoke.ts; Pop-Location`.
  In this desktop environment, `pnpm.cmd --filter web smoke:loops` resolves the
  nested `node` process to Node 24 and fails only because the installed
  `better-sqlite3` binary was compiled for a different Node ABI.

- Phase 50 added regression coverage for product-to-native loop guard forwarding.
- Phase 50 added `apps/web/tests/unit/loop-native-router-guard.test.ts`, which
  exercises `streamNativeAgentResponse(...)` and verifies `loopIdForGuard` is
  serialized into the `/api/native/agent` request body together with the prompt
  and chat session id.
- This closes the automated coverage gap between the `/loops` guarded-chat UX
  entry point and the backend/native guard logic covered in earlier phases.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-native-router-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-native-scheduler.test.ts tests/unit/loop-spec.test.ts`
  passes after Phase 50.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 50.
- Phase 51 hardened the loop runtime smoke command for desktop environments with
  multiple Node installations.
- Phase 51 added `apps/web/scripts/run-loop-runtime-smoke.cjs`, a small launcher
  that defers application imports and executes the smoke harness with
  `LOOP_SMOKE_NODE`, `npm_node_execpath`, or the current Node executable in that
  order. This lets the smoke harness run under the Node ABI that matches the
  installed `better-sqlite3` binary.
- Phase 51 updated `apps/web/package.json` so `smoke:loops` uses the launcher
  instead of invoking `node ...tsx` directly.
- Verification:
  `LOOP_SMOKE_NODE=D:\ai_workspace\tools\node-v22.22.3-win-x64\node.exe pnpm.cmd --filter web smoke:loops`
  passes after Phase 51.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-native-router-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-native-agent-guard.test.ts tests/unit/loop-native-scheduler.test.ts tests/unit/loop-spec.test.ts`
  passes after Phase 51.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 51.
- Phase 52 attempted authenticated `/loops` browser QA using the in-app Browser
  workflow, but the browser runtime could not be started in the current Windows
  sandbox (`CreateProcessAsUserW failed: 5`).
- Phase 52 added automated fallback coverage in
  `apps/web/tests/unit/loop-page-guard-entry.test.ts`, locking the `/loops`
  product entry point to `openGuardedChat(...)`, the `loopIdForGuard` and
  `loopName` query parameters, and the visible guarded-chat action.
- Phase 52 keeps the browser QA item open for a real authenticated desktop
  session, but removes the highest-risk silent regression from the product UX
  by covering the route/query contract in unit tests.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-page-guard-entry.test.ts tests/unit/loop-native-router-guard.test.ts tests/unit/loop-chat-guard.test.ts tests/unit/loop-native-agent-guard.test.ts`
  passes after Phase 52.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 52.
- Phase 53 exposed native loop scheduler status through the desktop local
  scheduler status surface.
- Phase 53 updated `apps/web/lib/cron/local-scheduler.ts` so
  `getSchedulerStatus()` now includes `nativeLoops: getNativeLoopSchedulerStatus()`.
  This makes authenticated desktop scheduler QA able to inspect currently
  running native loop ids from the existing scheduler API response.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-native-scheduler.test.ts tests/unit/loop-native-router-guard.test.ts tests/unit/loop-page-guard-entry.test.ts tests/unit/loop-spec.test.ts`
  passes after Phase 53.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 53.
- Phase 54 added regression coverage for native loop scheduler visibility in
  the desktop local scheduler status API.
- Phase 54 added `apps/web/tests/unit/loop-local-scheduler-status.test.ts`,
  isolating `getSchedulerStatus()` and verifying it includes
  `nativeLoops.runningLoopIds` from `getNativeLoopSchedulerStatus()`.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-local-scheduler-status.test.ts tests/unit/loop-native-scheduler.test.ts tests/unit/loop-spec.test.ts`
  passes after Phase 54.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 54.
- Phase 55 reduced manual loop execution coupling to native agent dependencies.
- Phase 55 updated `apps/web/app/(chat)/api/loops/[id]/execute/route.ts` so
  `executeNativeLoopAgent` is lazy-imported only when `dryRun` is explicitly
  false. Manual dry-runs now avoid loading the native agent executor module.
- Phase 55 added `apps/web/tests/unit/loop-execute-route.test.ts`, covering both
  dry-run execution without native executor calls and real execution with the
  lazy executor callback.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-execute-route.test.ts tests/unit/loop-native-scheduler.test.ts tests/unit/loop-local-scheduler-status.test.ts`
  passes after Phase 55.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 55.
- Phase 56 added API-level coverage for desktop scheduler native loop visibility.
- Phase 56 added `apps/web/tests/unit/loop-scheduler-api-status.test.ts`,
  verifying `/api/scheduled-jobs/internal/scheduler` returns
  `scheduler.nativeLoops.runningLoopIds`, refreshes the active scheduler user,
  forwards the desktop cloud auth token, starts the scheduler when needed, and
  clears scheduler auth context on stop.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-scheduler-api-status.test.ts tests/unit/loop-local-scheduler-status.test.ts tests/unit/loop-native-scheduler.test.ts`
  passes after Phase 56.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 56.
- Phase 57 made the loop runtime smoke launcher self-report its execution
  environment.
- Phase 57 updated `apps/web/scripts/run-loop-runtime-smoke.cjs` to print the
  selected Node executable and working directory before spawning the TypeScript
  smoke harness. This makes future `better-sqlite3` ABI or cwd mismatches
  immediately visible in CI/local logs.
- Verification:
  `LOOP_SMOKE_NODE=D:\ai_workspace\tools\node-v22.22.3-win-x64\node.exe pnpm.cmd --filter web smoke:loops`
  passes after Phase 57 and logs the Node 22 executable path.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 57.
- Phase 58 exposed final-send adapter registry metadata through the existing
  loop approval adapter status surface.
- Phase 58 added `listExternalFinalSendAdapters(...)` in
  `apps/web/lib/loops/approval-final-send.ts`, returning metadata without
  adapter execute functions. The default registry intentionally remains empty
  until a concrete platform adapter has a proven idempotency contract.
- Phase 58 updated `GET /api/loops/approvals/adapters` to preserve the legacy
  `adapters` field while also returning explicit `replayAdapters` and
  `finalSendAdapters` fields for product QA and future UI wiring.
- Phase 58 added `apps/web/tests/unit/loop-approval-adapters-route.test.ts`
  and expanded final-send unit coverage for adapter metadata.
- Verification:
  `pnpm.cmd --filter web exec vitest run tests/unit/loop-approval-adapters-route.test.ts tests/unit/loop-approval-final-send.test.ts tests/unit/loop-approval-replay.test.ts`
  passes after Phase 58.
- Verification: `pnpm.cmd --filter web tsc --noEmit` passes after Phase 58.
- Phase 59 surfaced approval adapter registry status in the `/loops` product
  surface.
- Phase 59 updated `apps/web/app/(chat)/loops/page.tsx` to fetch
  `/api/loops/approvals/adapters` alongside the approval inbox and show replay
  and final-send adapter counts in a read-only Adapter registry panel.
- Final-send remains intentionally blocked when the registry is empty; the UI
  now makes that operational state visible instead of requiring direct API
  inspection.
- Phase 59 added `apps/web/tests/unit/loop-page-adapter-registry.test.ts` to
  lock the product page to the adapter registry API and visible replay/final-send
  status copy.
- Verification blocked in this sandbox: PATH has no `node` or `pnpm.cmd`, and
  direct Node 22 smoke execution fails because `node_modules/tsx` and
  `node_modules/better-sqlite3` are not installed in this workspace.

## Next Step

The initial Loop Engineering migration is now complete at the service/API
layer. Recommended next work:

- Rerun authenticated `/loops` browser QA in a stable desktop/browser session
  using Node 22 and workspace-writable `TAURI_DB_PATH`.
- Use `pnpm --filter web smoke:loops` as the non-browser regression check for
  DB-backed template creation, dry-run persistence, native scheduler execution,
  and dashboard aggregation when the shell Node version matches installed native
  dependencies. The smoke launcher logs the selected Node executable and supports `LOOP_SMOKE_NODE` for explicit ABI selection.
- Keep native scheduler unit coverage in
  `apps/web/tests/unit/loop-native-scheduler.test.ts` aligned with any future
  scheduling behavior changes.
- Exercise template creation in `/loops` with real authenticated local data.
- Exercise `dryRun: false` against real authenticated data and model settings.
- Exercise desktop native scheduling end-to-end with real authenticated local
  data and real `dryRun: false` agent execution.
- Add a concrete final-send platform adapter only after choosing the target
  platform and verifying its delivery idempotency contract. Until then,
  `/api/loops/approvals/adapters` should report an empty `finalSendAdapters`
  registry.
