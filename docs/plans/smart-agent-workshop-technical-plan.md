# 智能体车间技术落地方案

> 指导思想：本方案以及后续智能体车间相关代码改造，默认遵循 [`《工程控制论》项目指导思想`](../architecture/engineering-cybernetics-guiding-principles.md)。即：先观测，再建模；先闭环，再自动；先边界，再行动；先稳定，再智能。

本文是后续改造 `智能体车间` 的实施依据。目标不是推倒现有 `Workshop` 和 `Loop` 两套能力，而是把它们收束成一个产品模型：

```text
Workshop = 长期智能体空间
Loop = Workshop 里的持续任务
Run = Loop 的一次执行
Outbox / Approval = 外部动作的确认层
Memory / Source / Event = Workshop 的长期上下文与可追溯记录
```

## 0. 当前落地进度

- 已建立 `Workshop -> Loop` 归属关系：`loops.workshop_id`、`workshop_events.loop_id`、`workshop_events.loop_run_id` 已进入 schema 和迁移。
- 已接入车间创建任务入口：`POST /api/workshops/[id]/loops` 支持模板和自然语言草稿/创建。
- 已接入车间执行任务入口：`POST /api/workshops/[id]/loops/[loopId]/execute` 可触发指定 Loop。
- 已建立运行桥接层：`runWorkshopLoopOnce` 会校验车间归属，写入 `loop_run_started` / `loop_run_completed` / `loop_run_failed` 事件。
- 已把 Loop 的 `suggestedActions` 转为车间 outbox 草稿，并把 `loopId` / `loopRunId` 写入事件链路。
- 已完成 native scheduler 分支桥接：有 `workshopId` 的 Loop 到点执行时走 `runWorkshopLoopOnce`，无归属 Loop 继续走旧 `runLoopHarness`。
- 已完成 Loop native executor 的 Workshop 上下文注入：车间任务执行时会读取 mission、boundary policy、enabled sources、persistent directives、memories 和 recent events。
- 已完成 Workshop boundary 到 Loop policy 的硬约束桥接：车间任务的工具权限和 action guard 会使用合并后的有效 action/approval policy，外部写入默认走审批，交易/付款/删除类动作硬 deny。
- 已完成 Workshop dashboard 聚合层和概览入口：新增 `getWorkshopDashboard` / `GET /api/workshops/[id]/dashboard`，首屏展示状态、待确认、最近发现和下次工作。
- 已完成车间内智能体创建自动任务提案：新增 `workshopCreateLoopTask`，创建后的 Loop 默认为 `paused`，并写入 `requiresOwnerActivation`，需用户激活后才会调度。
- 已完成自动任务提案的用户闭环：新增激活/拒绝 API，激活会清除 `requiresOwnerActivation`、切换为 `active` 并初始化 `nextScheduledRunAt`；车间首屏和任务列表可直接处理待激活任务。
- 已完成自动任务提案详情可视化：待激活卡片和任务列表会展示触发方式、资料范围、动作边界、成功标准和创建原因，帮助用户在激活前判断是否可靠。
- 已完成车间任务详情弹窗：任务列表可打开详情，查看状态、调度、动作边界、上下文、成功标准、最新运行摘要和关联车间事件，并可在详情内运行/激活/拒绝任务。
- 已完成车间任务详情数据接口：新增任务级 detail 聚合，按车间归属拉取 Loop 配置、最近运行、审批请求、关联事件和 outbox 产物，前端详情弹窗已改为接口驱动。
- 已完成车间任务详情内操作闭环：审批请求可在任务详情中通过/拒绝，已批准 continuation 可继续执行；关联 outbox 产物可在任务详情中预览和发送，操作后自动刷新任务详情。
- 已把车间方向到自动任务提案改为 Claude Code 式 planning gate：发送方向后先由 `directive-planner` 输出结构化 action（`run_once` / `create_loop_task` / `ask_clarification` / `spawn_subtask` / `ignore_duplicate`），运行时再按 action 决定是进入完整车间 run，还是创建待激活 Loop 提案；任务创建阶段仍保留时间归一化兜底，“每个交易日开盘前生成关注列表”会被解析为 `0 9 * * 1-5`。
- 已补齐 planning gate 的澄清闭环：`ask_clarification` 不再只写事件，会生成 `needs_owner_input` outbox draft，车间首页和发信列表会按“待补充信息/车间提问”展示，不进入微信预览或发送流程。
- 已完成入口收束第一步：侧边栏移除独立 `Automatic Tasks` 主入口，`/loops` 降级为历史自动任务兼容视图，并把新任务创建引导回智能体车间。
- 已在车间详情接口和页面侧加入任务列表入口，页面可看到绑定任务并手动运行。

## 1. 当前技术状态

### 1.1 已有 Workshop 能力

主要文件：

- `apps/web/app/(chat)/workshop/workshop-client.tsx`
- `apps/web/app/api/workshops/**`
- `apps/web/lib/workshops/service.ts`
- `apps/web/lib/workshops/runtime.ts`
- `apps/web/lib/workshops/executor.ts`
- `apps/web/lib/workshops/boundary-policy.ts`
- `apps/web/lib/db/schema.pg.ts`
- `apps/web/lib/db/schema-sqlite.ts`

已有表：

- `workshops`
  - `id`
  - `user_id`
  - `name`
  - `mission`
  - `status`
  - `autonomy_level`
  - `boundary_policy`
  - `model_config`
  - `created_at`
  - `updated_at`

- `workshop_heartbeats`
  - 负责车间级唤醒、心跳、失败次数和 lease。

- `workshop_runs`
  - 车间一次运行记录。

- `workshop_events`
  - 车间时间线，已有 `seq`，支持 SSE 实时日志。

- `workshop_sources`
  - 车间资料源。

- `workshop_directives`
  - 用户对车间追加的方向。

- `workshop_memories`
  - 车间长期记忆。

- `workshop_outbox`
  - 车间外部消息草稿、预览、发送状态。

已有价值：

- 车间有长期空间感。
- outbox、边界策略、微信预览已经贴近产品需求。
- 事件流可以作为统一运行时间线。

当前问题：

- Workshop 自己有运行器，但 Loop 也有运行器，两者职责重叠。
- Workshop 没有直接拥有 Loop。
- Workshop 页以日志为中心，不以任务结果、待确认动作、下一步计划为中心。

### 1.2 已有 Loop 能力

主要文件：

- `apps/web/app/(chat)/loops/page.tsx`
- `apps/web/app/(chat)/api/loops/**`
- `apps/web/app/api/page-state/loops/route.ts`
- `apps/web/lib/loops/service.ts`
- `apps/web/lib/loops/runtime.ts`
- `apps/web/lib/loops/harness.ts`
- `apps/web/lib/loops/native-executor.ts`
- `apps/web/lib/loops/spec.ts`
- `apps/web/lib/loops/templates.ts`
- `apps/web/lib/loops/natural-language.ts`
- `apps/web/lib/loops/dashboard.ts`
- `apps/web/lib/loops/schedule.ts`
- `apps/web/lib/loops/approval.ts`
- `apps/web/lib/loops/tool-gate.ts`
- `apps/web/lib/loops/action-guard.ts`

已有表：

- `loops`
  - `id`
  - `user_id`
  - `name`
  - `description`
  - `goal`
  - `status`
  - `trigger_config`
  - `context_config`
  - `action_policy`
  - `verification_config`
  - `approval_policy`
  - `retry_policy`
  - `escalation_policy`
  - `created_at`
  - `updated_at`

- `loop_runs`
  - `id`
  - `loop_id`
  - `status`
  - `trigger_reason`
  - `started_at`
  - `completed_at`
  - `input_snapshot`
  - `output_summary`
  - `verification_result`
  - `error`
  - `created_at`
  - `updated_at`

- `loop_states`
  - `loop_id`
  - `current_phase`
  - `memory_summary`
  - `open_questions`
  - `last_observation`
  - `next_action`
  - `blocked_reason`
  - `state_json`
  - `updated_at`

- `loop_approval_requests`
  - `id`
  - `loop_id`
  - `loop_run_id`
  - `user_id`
  - `status`
  - `source`
  - `action_name`
  - `capability`
  - `reason`
  - `message`
  - `tool_input`
  - `action_payload`
  - `resolved_by`
  - `resolved_at`
  - `resolution_note`
  - `created_at`
  - `updated_at`

已有价值：

- Loop 是成熟的运行时对象。
- 支持模板、自然语言创建、调度、验证、checker、审批、action guard。
- `runLoopHarness` 已把 dry-run 和 native agent 运行统一。

当前问题：

- `/loops` 独立成一个产品入口，和 `/workshop` 心智重复。
- Loop 缺少 `workshop_id`，无法表达“某个车间里的任务”。
- Loop 的审批和 Workshop 的 outbox 是两套用户心智。

## 2. 目标架构

### 2.1 目标关系

```text
User
  └─ Workshop
      ├─ Sources
      ├─ Memories
      ├─ Directives
      ├─ BoundaryPolicy
      ├─ Heartbeat
      ├─ Events
      ├─ Outbox
      └─ Loops
          ├─ LoopState
          ├─ LoopRuns
          └─ LoopApprovalRequests
```

### 2.2 职责边界

Workshop 负责：

- 用户看到的智能体空间。
- 使命、长期资料源、长期记忆。
- 外部动作边界。
- 统一时间线。
- 统一 outbox。
- 车间首页聚合视图。

Loop 负责：

- 持续任务定义。
- 触发器。
- 上下文选择。
- 运行状态。
- 验证和 checker。
- 任务级审批策略。
- 执行 trace。

Runtime 负责：

- 调度 Loop。
- 执行 Loop。
- 将 Loop 运行结果同步回 Workshop。
- 将 suggested actions 转换成 Workshop outbox 或 Loop approval。

UI 负责：

- 用户只看到一个主入口：`智能体车间`。
- Loop 作为车间内的「任务」Tab/模块出现。
- `/loops` 保留为兼容入口，后续可重定向到 `/workshop`。

## 3. 数据模型改造

### 3.1 Phase A 必加字段

#### Postgres

新增迁移：

- `apps/web/lib/db/migrations/0110_link_loops_to_workshops.sql`

SQL 形态：

```sql
ALTER TABLE "loops"
  ADD COLUMN IF NOT EXISTS "workshop_id" uuid;

DO $$ BEGIN
  ALTER TABLE "loops"
    ADD CONSTRAINT "loops_workshop_id_workshops_id_fk"
    FOREIGN KEY ("workshop_id")
    REFERENCES "public"."workshops"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "loops_workshop_idx"
  ON "loops" USING btree ("workshop_id");

CREATE INDEX IF NOT EXISTS "loops_workshop_status_idx"
  ON "loops" USING btree ("workshop_id", "status");

ALTER TABLE "workshop_events"
  ADD COLUMN IF NOT EXISTS "loop_id" uuid;

ALTER TABLE "workshop_events"
  ADD COLUMN IF NOT EXISTS "loop_run_id" uuid;

DO $$ BEGIN
  ALTER TABLE "workshop_events"
    ADD CONSTRAINT "workshop_events_loop_id_loops_id_fk"
    FOREIGN KEY ("loop_id")
    REFERENCES "public"."loops"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "workshop_events"
    ADD CONSTRAINT "workshop_events_loop_run_id_loop_runs_id_fk"
    FOREIGN KEY ("loop_run_id")
    REFERENCES "public"."loop_runs"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "workshop_events_loop_idx"
  ON "workshop_events" USING btree ("loop_id");

CREATE INDEX IF NOT EXISTS "workshop_events_loop_run_idx"
  ON "workshop_events" USING btree ("loop_run_id");
```

#### SQLite

新增迁移：

- `apps/web/lib/db/migrations-sqlite/0108_link_loops_to_workshops.sql`

SQLite 注意点：

- SQLite `ALTER TABLE ADD COLUMN` 可以加 nullable FK 字段。
- 索引可直接 `CREATE INDEX IF NOT EXISTS`。
- 如果现有 SQLite FK 行为不支持后加约束，先只加字段和索引，约束由服务层保证。

SQL 形态：

```sql
ALTER TABLE `loops`
  ADD COLUMN `workshop_id` text;

CREATE INDEX IF NOT EXISTS `loops_workshop_idx`
  ON `loops` (`workshop_id`);

CREATE INDEX IF NOT EXISTS `loops_workshop_status_idx`
  ON `loops` (`workshop_id`, `status`);

ALTER TABLE `workshop_events`
  ADD COLUMN `loop_id` text;

ALTER TABLE `workshop_events`
  ADD COLUMN `loop_run_id` text;

CREATE INDEX IF NOT EXISTS `workshop_events_loop_idx`
  ON `workshop_events` (`loop_id`);

CREATE INDEX IF NOT EXISTS `workshop_events_loop_run_idx`
  ON `workshop_events` (`loop_run_id`);
```

如果本地 SQLite 迁移重复执行时 `ADD COLUMN` 报 duplicate column，需要迁移 runner 支持忽略，或者使用 rebuild-table 方案。优先检查现有 migration runner 是否逐条执行。

### 3.2 Schema 文件同步

修改：

- `apps/web/lib/db/schema.pg.ts`
- `apps/web/lib/db/schema-sqlite.ts`

`loops` 增加：

```ts
workshopId: uuid("workshop_id").references(() => workshops.id, {
  onDelete: "cascade",
}),
```

SQLite 版本：

```ts
workshopId: text("workshop_id").references(() => workshops.id, {
  onDelete: "cascade",
}),
```

索引：

```ts
workshopIdx: index("loops_workshop_idx").on(table.workshopId),
workshopStatusIdx: index("loops_workshop_status_idx").on(
  table.workshopId,
  table.status,
),
```

`workshopEvents` 增加：

```ts
loopId: uuid("loop_id").references(() => loops.id, {
  onDelete: "set null",
}),
loopRunId: uuid("loop_run_id").references(() => loopRuns.id, {
  onDelete: "set null",
}),
```

SQLite 版本用 `text("loop_id")` 和 `text("loop_run_id")`。

### 3.3 Type 层同步

修改：

- `apps/web/lib/loops/types.ts`

`CreateLoopInput` 增加：

```ts
workshopId?: string | null;
```

`UpdateLoopInput` 增加：

```ts
workshopId?: string | null;
```

修改：

- `apps/web/lib/workshops/types.ts`

`AppendWorkshopEventInput` 增加：

```ts
loopId?: string | null;
loopRunId?: string | null;
```

## 4. 服务层改造

### 4.1 Loop Service

修改文件：

- `apps/web/lib/loops/service.ts`

`createLoop`：

- 写入 `workshopId`。
- 如果有 `workshopId`，建议同时在 `loop_states.state_json` 中写入：

```ts
{
  workshopId,
  loopSpec,
  templateId,
}
```

`updateLoop`：

- 支持更新 `workshopId`。
- 如果 `workshopId` 从 null 变成值，需要同步 `loop_states.state_json.workshopId`。

新增方法：

```ts
export async function listLoopsForWorkshop(input: {
  userId: string;
  workshopId: string;
  status?: LoopStatus;
  limit?: number;
}): Promise<Loop[]>;

export async function getLoopInWorkshop(input: {
  userId: string;
  workshopId: string;
  loopId: string;
}): Promise<Loop | null>;
```

查询条件：

```ts
and(
  eq(loops.userId, userId),
  eq(loops.workshopId, workshopId),
  status ? eq(loops.status, status) : undefined,
)
```

Drizzle 不接受 undefined 时需要动态构建 where。

### 4.2 Loop Spec

修改文件：

- `apps/web/lib/loops/spec.ts`

`loopSpecToCreateLoopInput` 入参增加：

```ts
workshopId?: string | null;
```

返回：

```ts
workshopId: input.workshopId ?? null,
initialState: {
  currentPhase: "idle",
  stateJson: {
    loopSpec: specJson,
    templateId: input.spec.templateId,
    workshopId: input.workshopId ?? undefined,
  },
}
```

### 4.3 Workshop Service

修改文件：

- `apps/web/lib/workshops/service.ts`

`appendWorkshopEvent` 支持 `loopId`、`loopRunId`：

```ts
const data: InsertWorkshopEvent = {
  ...
  loopId: input.loopId ?? null,
  loopRunId: input.loopRunId ?? null,
}
```

新增聚合服务文件：

- `apps/web/lib/workshops/dashboard.ts`

职责：

```ts
export async function getWorkshopDashboard(input: {
  userId: string;
  workshopId: string;
}): Promise<WorkshopDashboard>;

export async function listWorkshopDashboard(input: {
  userId: string;
  limit?: number;
}): Promise<WorkshopDashboardSummary[]>;
```

返回结构：

```ts
export interface WorkshopDashboardSummary {
  workshop: Workshop;
  status: "active" | "paused" | "archived" | "blocked" | "needs_approval" | "error";
  counts: {
    loops: number;
    activeLoops: number;
    pendingOutbox: number;
    pendingApprovals: number;
    sources: number;
    memories: number;
  };
  latestFinding: string | null;
  nextAction: string | null;
  nextRunAt: string | null;
  updatedAt: Date;
}

export interface WorkshopDashboard extends WorkshopDashboardSummary {
  loops: LoopDashboardSummary[];
  recentEvents: WorkshopEvent[];
  outbox: WorkshopOutboxItem[];
  memories: WorkshopMemory[];
  sources: WorkshopSource[];
  heartbeat: WorkshopHeartbeat | null;
}
```

状态推导优先级：

1. `workshop.status === archived` -> `archived`
2. 任一 Loop `needs_approval` 或 pending outbox -> `needs_approval`
3. 任一 Loop `blocked` -> `blocked`
4. 任一 Loop `error` 且无更高优先级 -> `error`
5. `workshop.status === paused` -> `paused`
6. 默认 `active`

### 4.4 Workshop Loop Service

新增文件：

- `apps/web/lib/workshops/loop-service.ts`

职责：

- 创建某个车间里的 Loop。
- 用自然语言在某个车间里创建 Loop。
- 把 Loop 运行结果镜像到 Workshop timeline。
- 将 Loop suggested actions 转成 Workshop outbox。

核心方法：

```ts
export async function createWorkshopLoopFromTemplate(input: {
  userId: string;
  workshopId: string;
  templateId: LoopTemplateId;
  templateInput: Omit<LoopTemplateInput, "userId" | "templateId">;
}): Promise<Loop>;

export async function createWorkshopLoopFromNaturalLanguage(input: {
  userId: string;
  workshopId: string;
  intent: string;
  timezone?: string;
  externalWriteMode?: "manual_approval" | "loop_approved";
}): Promise<{
  draft: NaturalLanguageLoopDraft;
  loop?: Loop;
}>;

export async function mirrorLoopRunToWorkshop(input: {
  workshopId: string;
  loop: Loop;
  loopRun: LoopRun;
  result: JobExecutionResult;
  verificationResult?: Record<string, unknown> | null;
}): Promise<void>;

export async function createWorkshopOutboxFromLoopSuggestedActions(input: {
  workshopId: string;
  loop: Loop;
  loopRun: LoopRun;
  result: JobExecutionResult;
}): Promise<WorkshopOutboxItem[]>;
```

镜像事件建议：

- `loop_run_started`
  - title: `任务开始：${loop.name}`
  - metadata: `{ loopId, loopRunId, triggerReason }`

- `loop_run_completed`
  - title: `任务完成：${loop.name}`
  - body: `result.output` 或 summary
  - metadata: `{ loopId, loopRunId, status, verificationPassed }`

- `loop_run_failed`
  - title: `任务失败：${loop.name}`
  - body: error

- `loop_action_suggested`
  - title: `任务建议动作`
  - body: suggested action label/content

## 5. 运行时改造

### 5.1 保留当前 Loop Runtime 为唯一任务运行时

原则：

- 不再扩展 `apps/web/lib/workshops/executor.ts` 作为主路径。
- Workshop 自身的 `startWorkshopRun` 后续只用于兼容或手动探索。
- 新任务执行都走 `runLoopHarness` -> `runNativeLoopOnce` -> `executeNativeLoopAgent`。

### 5.2 新增 Workshop Loop 执行入口

新增文件：

- `apps/web/lib/workshops/loop-runtime.ts`

核心函数：

```ts
export async function runWorkshopLoopOnce(input: {
  userId: string;
  workshopId: string;
  loopId: string;
  mode: "dry_run" | "native_agent";
  triggeredBy: "manual" | "scheduler" | "api";
  reason?: Record<string, unknown>;
}): Promise<{
  loop: Loop;
  loopRun: LoopRun | null;
  result: JobExecutionResult;
}>;
```

执行步骤：

1. 校验 workshop 属于 user。
2. 校验 loop 属于 workshop。
3. append `loop_run_started` 到 workshop_events。
4. 调用 `runLoopHarness`。
5. 根据最新 loop run 生成 workshop event。
6. 抽取 suggested actions，写入 workshop_outbox。
7. 如有 approval request，写入 `loop_approval_requests` 后在 workshop timeline 镜像。
8. 返回结果。

### 5.3 Loop Native Executor 注入 Workshop 上下文

修改文件：

- `apps/web/lib/loops/native-executor.ts`
- `apps/web/lib/loops/context-window.ts`

当 `loop.workshopId` 存在时：

1. 读取 Workshop：
   - `mission`
   - `boundaryPolicy`
   - `modelConfig`

2. 读取 Workshop sources：
   - enabled only
   - 限制数量和字符数

3. 读取 Workshop memories：
   - 默认最近 40 条
   - 后续可按 tags/context query 检索

4. 读取 active directives：
   - persistent
   - current_run 仅在有关联 run 时使用

5. prompt 中增加：

```text
Workshop mission:
...

Workshop boundary policy:
...

Workshop sources:
...

Workshop memories:
...

Workshop active directives:
...
```

注意：

- 车间资料源是长期默认上下文。
- Loop `context.sources` 是任务级上下文选择。
- 二者冲突时，Loop 更具体；Workshop 作为背景。

### 5.4 suggestedActions 到 Outbox

Loop agent 当前结构化输出中已有：

```json
{
  "suggestedActions": [
    {
      "type": "custom",
      "label": "...",
      "content": "...",
      "requiresConfirmation": true
    }
  ]
}
```

转 outbox 规则：

- `requiresConfirmation === true`
- `content` 非空
- action type 或 metadata 指向 external message
- 或 Loop metadata.delivery.platform 为 `wechat_desktop`

写入 `workshop_outbox`：

```ts
{
  workshopId,
  runId: null,
  loopId,
  loopRunId,
  channel: "wechat_desktop",
  recipientName: metadata.delivery.recipientName ?? null,
  message: action.content,
  status: "draft",
  confidence: inferredConfidence,
  riskLevel: inferredRisk,
  sourceEventIds: [],
  boundaryResult: {
    source: "loop_suggested_action",
    loopId,
    loopRunId,
    actionLabel: action.label,
    requiresConfirmation: true,
  }
}
```

如果不加 `workshop_outbox.loop_id` / `loop_run_id` 字段，先放进 `boundaryResult`。Phase B 再加字段。

### 5.5 外部动作硬约束

当前 Prompt 已限制外部写入，但技术上仍要以 tool gate 为准。

目标规则：

1. 默认所有 external write 都 `require_approval`。
2. 只有同时满足下面条件才允许自动发送：
   - `workshop.boundaryPolicy.externalMessages === "auto"`
   - `workshop.boundaryPolicy.allowedRecipients` 包含目标联系人
   - `confidence >= minConfidenceToSend`
   - `riskLevel !== "high"`
   - 有 source evidence 或 `requireSourcesForOutbox === false`
3. 金融交易、下单、付款、删除数据永远 deny。

落地文件：

- `apps/web/lib/workshops/boundary-policy.ts`
- `apps/web/lib/workshops/outbox-wechat.ts`
- `apps/web/lib/loops/tool-gate.ts`
- `apps/web/lib/loops/action-guard.ts`

需要新增桥接方法：

```ts
export function workshopBoundaryToLoopApprovalPolicy(
  policy: WorkshopBoundaryPolicy,
): {
  approvalPolicy: LoopJson;
  actionPolicy: LoopJson;
};
```

## 6. API 改造

### 6.1 新增 Workshop 聚合 API

新增：

- `apps/web/app/api/workshops/[id]/dashboard/route.ts`

`GET` 返回：

```ts
{
  workshop: Workshop,
  status: string,
  counts: {...},
  loops: LoopDashboardSummary[],
  recentEvents: WorkshopEvent[],
  outbox: WorkshopOutboxItem[],
  memories: WorkshopMemory[],
  sources: WorkshopSource[],
  heartbeat: WorkshopHeartbeat | null
}
```

### 6.2 新增 Workshop Loops API

新增：

- `apps/web/app/api/workshops/[id]/loops/route.ts`

`GET`：

- list loops for workshop。

`POST`：

- body 可以是 template 或自然语言 intent。

Body 1：

```json
{
  "type": "natural_language",
  "intent": "每天早上 9 点检查客户跟进并生成微信草稿",
  "timezone": "Asia/Shanghai",
  "externalWriteMode": "manual_approval"
}
```

Body 2：

```json
{
  "type": "template",
  "templateId": "personal-crm-follow-up",
  "input": {
    "contactGroup": "重点客户",
    "cronExpression": "0 9 * * 1-5",
    "timezone": "Asia/Shanghai"
  }
}
```

### 6.3 新增 Workshop Loop 执行 API

新增：

- `apps/web/app/api/workshops/[id]/loops/[loopId]/execute/route.ts`

`POST` body：

```json
{
  "mode": "native_agent",
  "reason": {
    "type": "manual"
  }
}
```

默认：

- `mode = "dry_run"` 用于安全试运行。
- UI 的“试运行一次”可以先 dry run，再提供“正式运行”。

### 6.4 保留旧 API

保留：

- `/api/loops/**`
- `/api/page-state/loops`
- `/api/workshops/**`

兼容策略：

- 旧 `/api/loops/natural-language` 仍创建无 workshop 的 Loop。
- 新 UI 默认走 `/api/workshops/[id]/loops`。
- 后续再加迁移提示。

## 7. 前端改造

### 7.1 路由策略

目标主入口：

- `/workshop`

保留兼容入口：

- `/loops`

阶段策略：

1. Phase 1：`/loops` 继续可用。
2. Phase 2：侧边栏只突出 `/workshop`。
3. Phase 3：`/loops` 改为 redirect 或显示“自动任务已合并到智能体车间”。

修改文件：

- `apps/web/components/app-sidebar.tsx`

最终侧边栏：

```text
智能体车间
Library
Connectors
...
```

不再同时出现：

- 工作工坊
- Automatic Tasks

### 7.2 Workshop 页面拆分

当前 `workshop-client.tsx` 太大。建议拆成：

```text
apps/web/app/(chat)/workshop/
  page.tsx
  workshop-client.tsx
  components/
    workshop-shell.tsx
    workshop-list.tsx
    workshop-create-dialog.tsx
    workshop-overview.tsx
    workshop-loop-panel.tsx
    workshop-outbox-panel.tsx
    workshop-timeline.tsx
    workshop-source-panel.tsx
    workshop-memory-panel.tsx
    workshop-boundary-panel.tsx
    workshop-heartbeat-panel.tsx
```

如果先求低风险，也可以只新增局部组件：

- `workshop-overview.tsx`
- `workshop-loop-panel.tsx`
- `workshop-outbox-panel.tsx`

### 7.3 车间详情首屏信息架构

首屏区域：

1. Header
   - 车间名
   - 使命
   - 状态 badge
   - `试运行` / `新建任务`

2. Overview cards
   - 当前状态
   - 最近发现
   - 待确认动作
   - 下次工作

3. Main tabs
   - `概览`
   - `任务`
   - `待确认`
   - `时间线`
   - `资料`
   - `记忆`
   - `边界`

4. 右侧或底部辅助区
   - 最近运行
   - 调度状态
   - 失败/阻塞提示

### 7.4 新建车间流程

创建车间只问：

- 名称
- 使命
- 模板

创建后自动进入 `新建任务` 弹窗。

默认模板：

- 客户跟进车间
- 项目风险车间
- 每日简报车间
- A 股研究车间
- 竞品雷达车间

技术上模板先存前端常量即可，后续可放到 `apps/web/lib/workshops/templates.ts`。

### 7.5 新建任务流程

在车间内：

- 输入自然语言 intent。
- 选择外部动作策略：
  - 只生成草稿
  - 需要我确认后发送
  - 白名单自动发送
- 点击 `生成任务草稿`。
- 展示解析结果：
  - 任务名
  - 触发方式
  - 上下文
  - 发送目标
  - 权限策略
- 点击 `创建并试运行`。

需要复用：

- `apps/web/lib/loops/natural-language.ts`
- `/api/workshops/[id]/loops`

## 8. 调度改造

当前 native loop scheduling 已有：

- `apps/web/lib/loops/schedule.ts`
- local scheduler 相关实现

目标：

- Scheduler 仍调度 `loops`。
- 如果 Loop 有 `workshopId`，执行时走 `runWorkshopLoopOnce`，从而镜像到 Workshop timeline/outbox。
- 如果 Loop 没有 `workshopId`，走旧 `runLoopHarness`。

修改点：

- 查找 due loops 时无需只查 workshop loops。
- 执行分支：

```ts
if (loop.workshopId) {
  await runWorkshopLoopOnce({
    userId: loop.userId,
    workshopId: loop.workshopId,
    loopId: loop.id,
    mode: "native_agent",
    triggeredBy: "scheduler",
    reason,
  });
} else {
  await runLoopHarness(...);
}
```

验收：

- 已有无 workshop 的 Loop 不受影响。
- 新车间任务运行后，Loop Dashboard 和 Workshop Timeline 都能看到结果。

## 9. 迁移策略

### 9.1 旧数据处理

不要自动把所有旧 Loop 塞进默认 Workshop，避免用户困惑。

策略：

- 旧 loops：`workshop_id = null`，继续在 `/loops` 可见。
- 新 workshop 创建的 loops：必须有 `workshop_id`。
- 后续提供“归入车间”动作。

### 9.2 旧 Workshop 处理

已有 workshops 不自动创建 loops。

用户进入旧 workshop 后：

- 显示“还没有任务，创建第一个持续任务”。

### 9.3 删除策略

如果删除 Workshop：

- `loops.workshop_id` 使用 cascade，车间内任务一起删除。
- `workshop_*` 表随 Workshop cascade。

UI 删除确认文案必须说明：

```text
删除车间会同时删除它的任务、运行记录、资料源、记忆和发信箱。
```

## 10. 实施阶段

### Phase 1：数据关联与服务层

目标：

- Loop 可以属于 Workshop。
- Workshop timeline 可以关联 Loop run。

改动：

- 新增 DB migrations。
- 修改 schema.pg / schema-sqlite。
- 修改 loop types/service/spec。
- 修改 workshop service/types。
- 新增 `workshops/loop-service.ts`。
- 新增单元测试。

测试：

```powershell
pnpm --filter web exec vitest run tests/unit/loop-spec.test.ts tests/unit/loop-dashboard.test.ts
pnpm --filter web tsc --noEmit
```

新增测试建议：

- `apps/web/tests/unit/workshop-loop-service.test.ts`
- `apps/web/tests/unit/workshop-dashboard.test.ts`

验收：

- 可以创建 `workshop_id` 非空的 Loop。
- 可以按 workshopId 列出 loops。
- 可以写入带 loopId/loopRunId 的 workshop event。

### Phase 2：Workshop 内创建任务

目标：

- 用户从车间内创建 Loop。

改动：

- 新增 `/api/workshops/[id]/loops`。
- 新增 `/api/workshops/[id]/dashboard`。
- 新增前端 `WorkshopLoopPanel`。
- 创建任务时写入 `workshopId`。

验收：

- 进入某个车间，能看到“任务”模块。
- 能用自然语言创建任务。
- 新任务不出现在无归属视图中，或显示归属车间。

### Phase 3：运行时桥接

目标：

- 车间里的任务运行后，结果进入车间概览、时间线、outbox。

改动：

- 新增 `workshops/loop-runtime.ts`。
- 修改 loop native executor 的 context window，加入 workshop context。
- 修改 scheduler 执行分支。
- 将 suggestedActions 转换为 workshop outbox。

测试：

- dry run 能生成 workshop event。
- native_agent 失败时 workshop event 有失败记录。
- suggestedActions 能生成 outbox draft。
- auto send 仍受 boundary policy 控制。

验收：

- 点击“试运行一次”后，车间时间线出现任务开始/完成事件。
- 最近发现 card 更新。
- 有外部动作时进入“待确认”。

### Phase 4：前端收束

目标：

- 用户只通过“智能体车间”理解产品。

改动：

- 侧边栏移除或弱化 `/loops`。
- `/workshop` 首屏改成概览。
- 原日志移到 `时间线` tab。
- 原边界/资料/记忆保留为 tabs。

验收：

- 首屏能回答：
  - 它现在在做什么？
  - 最近发现了什么？
  - 有什么要我确认？
  - 下次什么时候工作？

### Phase 5：兼容入口与清理

目标：

- `/loops` 成为兼容视图或跳转。

改动：

- `/loops` 顶部提示“自动任务已合并到智能体车间”。
- 支持将旧 Loop 归入已有 Workshop。
- 后续可 redirect。

验收：

- 旧用户不丢数据。
- 新用户不会看到两个同义入口。

## 11. 测试计划

### 11.1 Unit Tests

新增：

- `apps/web/tests/unit/workshop-loop-service.test.ts`
  - 创建 workshop loop。
  - list workshop loops。
  - loopSpec metadata 写入 workshopId。

- `apps/web/tests/unit/workshop-dashboard.test.ts`
  - 状态推导。
  - pending outbox -> needs_approval。
  - blocked loop -> blocked。

- `apps/web/tests/unit/workshop-loop-runtime.test.ts`
  - dry run mirror event。
  - failed result mirror event。
  - suggestedActions -> outbox。

- `apps/web/tests/unit/workshop-boundary-loop-policy.test.ts`
  - observe -> external writes deny。
  - draft -> require approval。
  - auto + whitelist -> allow。
  - high risk -> deny。

### 11.2 API Tests

如果当前项目没有 API route test pattern，可先 unit test service。

建议覆盖：

- `GET /api/workshops/[id]/dashboard`
- `GET /api/workshops/[id]/loops`
- `POST /api/workshops/[id]/loops`
- `POST /api/workshops/[id]/loops/[loopId]/execute`

### 11.3 Manual Smoke

本地流程：

```powershell
pnpm dev
```

浏览器检查：

1. 打开 `/workshop`。
2. 创建“客户跟进车间”。
3. 创建任务：
   - “每天上午 9 点检查重点客户是否需要跟进，并生成微信草稿。”
4. dry run。
5. native run。
6. 查看：
   - 车间概览有最近发现。
   - 时间线有 run events。
   - 任务 tab 有该 Loop。
   - 外部消息进入待确认。

## 12. 风险与控制

### 12.1 风险：两套路由并存造成重复逻辑

控制：

- 新逻辑集中在 `workshops/loop-service.ts` 和 `workshops/loop-runtime.ts`。
- `/loops` 保持旧逻辑，少改。
- UI 收束后再清理。

### 12.2 风险：迁移破坏 SQLite

控制：

- Postgres / SQLite 分开迁移。
- SQLite 先只加 nullable column 和 index。
- 服务层校验归属关系。

### 12.3 风险：外部消息误发

控制：

- 默认 `draft`。
- prompt 禁止外部写入不是安全边界，只能作为辅助。
- tool gate / action guard / boundary policy 三层都要检查。
- high risk 和金融交易永远 block。

### 12.4 风险：Context 太大

控制：

- Workshop sources/memories 进入 context window 前要截断。
- 初版限制：
  - sources 最多 20 个
  - memories 最多 40 条
  - 总字符数默认 30k
- 超限时写入 context summary。

### 12.5 风险：运行结果难以解释

控制：

- 每次 run 必须有 structured report。
- workshop timeline 至少记录：
  - checked sources
  - summary
  - suggested actions
  - verification result

## 13. 验收标准

### 13.1 技术验收

- `pnpm --filter web tsc --noEmit` 通过。
- Loop 原测试通过。
- 新增 Workshop-Loop 测试通过。
- 新建 migration 可在 Postgres 和 SQLite 模式执行。
- 旧 `/loops` 不崩。
- 旧 `/workshop` 基础功能不崩。

### 13.2 产品验收

用户可以完成：

1. 创建车间。
2. 在车间内创建任务。
3. 试运行任务。
4. 在车间概览看到结果。
5. 在时间线看到证据。
6. 在待确认里处理外部草稿。
7. 再次运行时能读取车间资料和记忆。

### 13.3 安全验收

- 默认不自动发微信。
- 未白名单联系人不能 auto send。
- 高风险草稿不能 auto send。
- 金融交易/下单/付款类动作不能 send。

## 14. 推荐代码改动顺序

严格按下面顺序做：

1. DB migration + schema 类型。
2. Loop service 支持 `workshopId`。
3. Workshop event 支持 `loopId` / `loopRunId`。
4. Workshop loop service。
5. Workshop dashboard service。
6. Workshop loops API。
7. Workshop loop runtime wrapper。
8. native executor 注入 Workshop context。
9. suggestedActions -> workshop outbox。
10. Frontend 新任务 panel。
11. Frontend overview 改版。
12. Sidebar 收束。
13. `/loops` 兼容提示或 redirect。

这样每一步都能单独测试，不会一次性把运行时和 UI 全搅在一起。

## 15. 暂不做的事

第一阶段不要做：

- 多智能体协作。
- 团队共享车间。
- 模板市场。
- 复杂权限 RBAC。
- 全量历史 Loop 自动迁入 Workshop。
- 删除旧 `/loops` 代码。
- 重写现有 Workshop executor。

原因：

- 当前目标是打通“车间拥有任务”的最小稳定闭环。
- 先让一个车间内的一个持续任务稳定运行、可解释、可确认，再扩展。
