# 微信交互记忆技术方案

本文是后续改造“个人助理 / 智能体车间 / 微信消息记录”的实施依据。

核心结论：

```text
微信消息不是直接存成智能体记忆。
微信消息先作为不可变的交互事实落库，再由理解层增量编译成摘要、待办、联系人上下文、回复草稿和长期记忆。
```

设计参考了 LLM Wiki 的思想：原始资料、结构化知识和推理使用层需要分开维护。对本项目来说，微信消息对应原始资料，个人交互 Wiki 对应被持续维护的结构化知识，智能体车间/助理岗位是使用这些知识工作的执行层。

## 1. 产品定位

当前产品不要先做“全渠道个人助理”，先收敛为：

```text
基于本地微信消息的个人 AI 助理。
```

第一阶段目标：

- 能稳定记录微信新消息。
- 能看到消息来自谁、哪个会话、什么时间、内容是什么。
- 能区分消息发生时间和系统采集时间。
- 能去重，避免每次轮询重复写入。
- 能让智能体车间读取这些消息，生成摘要、待回复列表、回复草稿和长期记忆。
- 任何外发仍然走 outbox 和边界确认。

非目标：

- 第一阶段不做飞书、QQ、邮件接入。
- 第一阶段不做复杂知识图谱。
- 第一阶段不把每条消息都直接写入长期记忆。
- 第一阶段不允许智能体直接绕过 outbox 发消息。

## 2. 总体架构

```text
微信本地工具
  -> 微信消息采集工具
  -> interaction_events 原始交互事实表
  -> interaction_threads 会话聚合表
  -> interaction_processing_jobs 理解任务队列
  -> interaction_notes / interaction_tasks / interaction_memories
  -> 智能体车间上下文召回
  -> outbox 回复草稿
```

分层说明：

| 层级 | 作用 | 是否可被 AI 改写 |
| --- | --- | --- |
| interaction_events | 原始微信消息事实 | 不可改写，只允许补状态 |
| interaction_threads | 会话聚合状态 | 可由系统更新 |
| interaction_notes | 消息理解摘要 | 可重新生成 |
| interaction_tasks | 从消息中识别出的待办/跟进 | 可由用户确认后更新 |
| interaction_memories | 长期个人交互记忆 | 应高置信或用户确认后写入 |
| workshop_memories | 某个车间自己的工作记忆 | 车间内使用 |
| workshop_events | 车间运行日志/引用记录 | 只记录过程，不作为消息事实库 |

## 3. 数据模型

### 3.1 interaction_events

用于存储微信原始消息事实。第一版只支持微信，但字段按未来多平台设计。

```ts
type InteractionEvent = {
  id: string;
  userId: string;

  platform: "wechat";
  source: "wechat_local";

  conversationId: string | null;
  conversationName: string;
  conversationType: "dm" | "group" | "unknown";

  senderId: string | null;
  senderName: string | null;
  senderDisplayName: string | null;

  direction: "inbound" | "outbound" | "unknown";

  contentType:
    | "text"
    | "image"
    | "voice"
    | "video"
    | "file"
    | "link"
    | "location"
    | "call"
    | "system"
    | "unknown";
  content: string;
  contentPreview: string;

  messageTime: Date;
  collectedAt: Date;

  sourceMessageId: string | null;
  sourceSequence: string | null;
  sourceRaw: Record<string, unknown>;

  dedupeKey: string;

  processedStatus: "new" | "seen" | "understood" | "archived";
  importance: "unknown" | "low" | "medium" | "high";
  requiresReply: boolean | null;

  createdAt: Date;
  updatedAt: Date;
};
```

关键字段：

- `messageTime`：微信消息真实发生时间。
- `collectedAt`：系统采集到这条消息的时间。
- `sourceRaw`：保留工具原始返回，方便后续补字段和排错。
- `dedupeKey`：唯一去重键。
- `processedStatus`：后续理解/车间处理状态。

唯一索引：

```text
unique(user_id, platform, dedupe_key)
index(user_id, platform, message_time)
index(user_id, conversation_name, message_time)
index(user_id, processed_status, message_time)
```

### 3.2 interaction_threads

用于快速展示会话列表、未处理数量和最近摘要。

```ts
type InteractionThread = {
  id: string;
  userId: string;
  platform: "wechat";

  conversationId: string | null;
  conversationName: string;
  conversationType: "dm" | "group" | "unknown";

  lastMessageEventId: string | null;
  lastMessageTime: Date | null;
  lastCollectedAt: Date | null;

  unreadLikeCount: number;
  unprocessedCount: number;

  summary: string | null;
  summaryUpdatedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
};
```

唯一索引：

```text
unique(user_id, platform, conversation_name)
```

### 3.3 interaction_processing_jobs

用于把“记录消息”和“理解消息”解耦。第一版可以先不做异步 worker，但 schema 先设计好。

```ts
type InteractionProcessingJob = {
  id: string;
  userId: string;
  eventId: string | null;
  threadId: string | null;

  jobType:
    | "classify_message"
    | "summarize_thread"
    | "extract_task"
    | "extract_memory"
    | "draft_reply";

  status: "pending" | "running" | "completed" | "failed";
  priority: number;
  attempts: number;
  lastError: string | null;

  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```

### 3.4 interaction_notes

用于保存 AI 对消息或会话的理解结果。

```ts
type InteractionNote = {
  id: string;
  userId: string;
  eventId: string | null;
  threadId: string | null;

  noteType:
    | "summary"
    | "classification"
    | "reply_need"
    | "risk"
    | "relationship"
    | "project_context";

  title: string;
  body: string;
  confidence: number;
  model: string | null;

  sourceEventIds: string[];
  createdAt: Date;
  updatedAt: Date;
};
```

### 3.5 interaction_tasks

用于从消息中提取待办、承诺、跟进。

```ts
type InteractionTask = {
  id: string;
  userId: string;
  eventId: string | null;
  threadId: string | null;

  title: string;
  description: string | null;
  status: "candidate" | "confirmed" | "done" | "dismissed";
  dueAt: Date | null;
  assigneeName: string | null;
  requesterName: string | null;

  sourceEventIds: string[];
  confidence: number;

  createdAt: Date;
  updatedAt: Date;
};
```

### 3.6 interaction_memories

用于保存跨车间可用的长期个人交互记忆。它不是原文消息，而是经过提炼的稳定事实。

```ts
type InteractionMemory = {
  id: string;
  userId: string;

  memoryType:
    | "person"
    | "preference"
    | "project"
    | "relationship"
    | "commitment"
    | "routine"
    | "boundary"
    | "mistake";

  subject: string;
  content: string;
  confidence: number;
  tags: string[];

  sourceEventIds: string[];
  lastVerifiedAt: Date | null;
  expiresAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
};
```

写入原则：

- 不把每条微信消息都写成记忆。
- 只有长期有用、可复用、较稳定的信息才进入 `interaction_memories`。
- 重要关系、偏好、承诺、项目上下文可以进入长期记忆。
- 低置信结论先进入 `interaction_notes` 或待确认队列。

## 4. 微信消息标准化

新增归一化函数：

```text
apps/web/lib/interactions/wechat-normalizer.ts
```

职责：

- 从当前 `wechatLocalCheckNewMessages` / `wechatLocalHistory` 返回里提取消息数组。
- 标准化会话名、发送人、方向、消息类型、消息时间。
- 生成 `dedupeKey`。
- 保留 `sourceRaw`。

### 4.1 dedupeKey 规则

优先级：

```text
wechat:{sourceMessageId}
wechat:{conversationName}:{senderName}:{messageTime}:{hash(content)}
wechat:{conversationName}:{messageTime}:{hash(sourceRaw)}
```

实现建议：

- 使用 `sha256`，截断前 16 或 24 位即可。
- `content` 归一化：trim、合并连续空白。
- `messageTime` 统一存 ISO。

### 4.2 时间规则

必须区分：

```text
messageTime = 微信消息发生时间
collectedAt = 系统采集时间
createdAt = 数据库写入时间
```

如果工具返回没有可靠消息时间：

- `messageTime` 先使用工具返回的会话/消息时间。
- 仍然不可用时用 `collectedAt`，但在 `sourceRaw` 或 metadata 里标记 `messageTimeInferred: true`。

## 5. 写入链路

新增 service：

```text
apps/web/lib/interactions/service.ts
```

核心函数：

```ts
upsertInteractionEvents(input: {
  userId: string;
  events: NormalizedInteractionEvent[];
}): Promise<{
  inserted: InteractionEvent[];
  existing: InteractionEvent[];
  insertedCount: number;
  duplicateCount: number;
}>;

listInteractionEvents(input: {
  userId: string;
  platform?: "wechat";
  conversationName?: string;
  processedStatus?: string[];
  since?: Date;
  until?: Date;
  limit?: number;
}): Promise<InteractionEvent[]>;

markInteractionEventsProcessed(input: {
  userId: string;
  eventIds: string[];
  processedStatus: InteractionEvent["processedStatus"];
}): Promise<void>;
```

写入时同步更新 `interaction_threads`：

- 更新最后消息时间。
- 累加 `unprocessedCount`。
- 更新 `lastMessageEventId`。

## 6. MCP / 工具设计

### 6.1 新增工具：wechatRecordNewMessages

放在 `workshop-tools` 里，第一版只服务智能体车间。

```ts
tool("wechatRecordNewMessages", {
  limit: number;
  unreadOnly: boolean;
  since?: string;
})
```

流程：

```text
调用现有微信本地工具读取新消息
-> normalizeWechatMessages
-> upsert interaction_events
-> append workshop_event: wechat_messages_recorded
-> 返回 inserted / duplicate / latestMessageTime / sourceEventId
```

返回结构：

```ts
{
  insertedCount: number;
  duplicateCount: number;
  latestMessageTime: string | null;
  events: Array<{
    id: string;
    conversationName: string;
    senderName: string | null;
    direction: string;
    contentType: string;
    contentPreview: string;
    messageTime: string;
    collectedAt: string;
  }>;
  sourceEventId: string;
}
```

### 6.2 新增工具：wechatListRecordedMessages

用于车间读取已经落库的消息，而不是每次都直接扫微信。

```ts
tool("wechatListRecordedMessages", {
  conversationName?: string;
  processedStatus?: Array<"new" | "seen" | "understood" | "archived">;
  since?: string;
  until?: string;
  limit: number;
})
```

### 6.3 新增工具：wechatMarkMessagesProcessed

用于智能体处理完某批消息后标记状态。

```ts
tool("wechatMarkMessagesProcessed", {
  eventIds: string[];
  processedStatus: "seen" | "understood" | "archived";
})
```

### 6.4 保留现有工具职责

现有工具不删除，但职责要区分：

| 工具 | 职责 |
| --- | --- |
| wechatLocalCheckNewMessages | 直接读取本地微信新消息 |
| wechatRecordNewMessages | 读取并落库，推荐车间使用 |
| wechatLocalHistory | 临时补上下文 |
| wechatLocalSearch | 临时搜索原始微信 |
| wechatCreateReplyDraft | 创建回复草稿 |
| workshopCreateOutboxDraft | 通用外发草稿 |

prompt 中应优先指导：

```text
需要处理微信新消息时，先调用 wechatRecordNewMessages。
需要查看已记录但未处理消息时，调用 wechatListRecordedMessages。
只有需要补上下文时，再调用 wechatLocalHistory / wechatLocalSearch。
```

## 7. API 设计

### 7.1 列表

```text
GET /api/interactions/events
```

Query：

```text
platform=wechat
conversationName=
processedStatus=new,seen
since=
until=
limit=50
```

返回：

```ts
{
  events: InteractionEvent[];
}
```

### 7.2 会话

```text
GET /api/interactions/threads?platform=wechat&limit=50
```

返回：

```ts
{
  threads: InteractionThread[];
}
```

### 7.3 手动记录新消息

```text
POST /api/interactions/wechat/record-new
```

Body：

```ts
{
  limit?: number;
  unreadOnly?: boolean;
  workshopId?: string;
}
```

用途：

- UI 手动点击“记录新消息”。
- 调试工具链。
- 后续可被定时任务调用。

### 7.4 标记状态

```text
PATCH /api/interactions/events/status
```

Body：

```ts
{
  eventIds: string[];
  processedStatus: "seen" | "understood" | "archived";
}
```

## 8. 智能体车间接入

### 8.1 车间 prompt 调整

在 `buildWorkshopPrompt` 中加入规则：

```text
如果任务涉及微信消息、未读、回复、联系人跟进：
1. 优先使用 wechatRecordNewMessages 记录最新消息。
2. 使用 wechatListRecordedMessages 查看未处理消息。
3. 需要上下文时再读取微信历史。
4. 如果生成回复，必须走 outbox。
5. 对长期有用的信息写入 workshop memory 或 interaction memory candidate。
```

### 8.2 车间事件

新增事件类型：

```text
wechat_messages_recorded
wechat_messages_processed
interaction_task_detected
interaction_memory_candidate
```

`wechat_messages_recorded` metadata：

```ts
{
  platform: "wechat";
  insertedCount: number;
  duplicateCount: number;
  latestMessageTime: string | null;
  eventIds: string[];
}
```

### 8.3 车间右侧 UI

建议把右侧页签从：

```text
资料 / 记忆 / 任务 / 发信 / 工具 / 边界
```

升级为：

```text
资料 / 交互 / 记忆 / 任务 / 发信 / 工具 / 边界
```

第一版“交互”页展示：

- 记录新消息按钮。
- 最近微信消息列表。
- 会话名。
- 发送人。
- 消息时间。
- 采集时间。
- 内容预览。
- 处理状态。

## 9. 个人交互 Wiki 后续设计

第一版只做消息事实库。第二阶段再做“编译层”：

```text
interaction_events
  -> interaction_notes
  -> interaction_tasks
  -> interaction_memories
  -> thread summaries
```

这部分借鉴 LLM Wiki：

- 原始资料不可变。
- AI 生成的结构化内容可重建。
- 每个理解结果必须有 sourceEventIds。
- 增量处理，失败可重试。
- 用户可审核重要结论。

## 10. 数据库迁移计划

### 10.1 Postgres

新增迁移：

```text
apps/web/lib/db/migrations/0111_add_interaction_events.sql
```

包含：

- `interaction_events`
- `interaction_threads`
- `interaction_processing_jobs`
- `interaction_notes`
- `interaction_tasks`
- `interaction_memories`

### 10.2 SQLite

新增迁移：

```text
apps/web/lib/db/migrations-sqlite/0109_add_interaction_events.sql
```

字段与 Postgres 对齐，JSON 字段使用 text/json 现有序列化策略。

### 10.3 schema 文件

同步更新：

- `apps/web/lib/db/schema.pg.ts`
- `apps/web/lib/db/schema-sqlite.ts`
- `apps/web/lib/db/schema.ts`

导出类型：

```ts
InteractionEvent
InsertInteractionEvent
InteractionThread
InsertInteractionThread
InteractionNote
InteractionTask
InteractionMemory
```

## 11. 实施阶段

### Phase 1：消息事实落库

目标：微信新消息能被记录，并能在 UI 看到。

任务：

- 新增 interaction schema 和 migration。
- 新增 `apps/web/lib/interactions/wechat-normalizer.ts`。
- 新增 `apps/web/lib/interactions/service.ts`。
- 新增 API：
  - `GET /api/interactions/events`
  - `GET /api/interactions/threads`
  - `POST /api/interactions/wechat/record-new`
  - `PATCH /api/interactions/events/status`
- 新增 MCP 工具：
  - `wechatRecordNewMessages`
  - `wechatListRecordedMessages`
  - `wechatMarkMessagesProcessed`
- 车间右侧新增“交互”页签。
- 写入 `wechat_messages_recorded` 车间事件。

验收标准：

- 手动点击“记录新消息”后，能看到新消息。
- 重复点击不会重复插入。
- 每条消息展示 `messageTime` 和 `collectedAt`。
- SSE 能实时刷新车间右侧“交互”列表。

### Phase 2：智能体读取已记录消息

目标：车间不再只临时扫微信，而是优先处理已落库消息。

任务：

- 更新车间 prompt。
- 更新工具矩阵。
- 车间运行时允许 `wechatListRecordedMessages`。
- 智能体处理消息后可标记 `seen/understood/archived`。

验收标准：

- 微信助理车间能列出未处理消息。
- 能基于消息生成摘要和 outbox 草稿。
- 处理后状态变化可见。

### Phase 3：交互理解层

目标：从消息中提取待办、回复需求、联系人上下文。

任务：

- 新增 processor。
- 新增 `interaction_processing_jobs` worker。
- 生成 `interaction_notes`、`interaction_tasks`。
- 支持人工确认任务。

验收标准：

- 可看到“需要回复”的消息列表。
- 可看到“待办候选”。
- 每个候选都能追溯 sourceEventIds。

### Phase 4：个人交互 Wiki

目标：形成联系人/会话/项目级长期上下文。

任务：

- 生成 thread summary。
- 生成 person/project memory。
- 与 `searchUnifiedMemory` 融合。
- 车间运行前按任务召回交互记忆。

验收标准：

- 询问某联系人时，能基于微信历史给出上下文。
- 生成回复草稿时，能引用最近消息和长期偏好。
- 车间能解释使用了哪些交互记忆。

## 12. 测试计划

### 单元测试

- `wechat-normalizer.test.ts`
  - 时间解析。
  - 消息类型映射。
  - dedupeKey 稳定性。
  - 缺少 messageId 时 fallback 去重。

- `interaction-service.test.ts`
  - upsert 插入。
  - 重复消息不重复插入。
  - thread 聚合更新。
  - 状态标记。

- `workshop-wechat-record-tool.test.ts`
  - 工具调用微信读取。
  - 写入 interaction_events。
  - 写入 workshop_event。

### API 测试

- 未登录返回 401。
- 只能访问自己的 interaction events。
- record-new 返回 inserted/duplicate。
- status patch 不能更新别人数据。

### 前端烟测

- 车间“交互”页可以打开。
- 点击记录后列表刷新。
- 消息时间显示正确。
- 空态清晰。

## 13. 风险与边界

### 隐私风险

微信消息是高敏数据。

要求：

- 默认只本地存储。
- 不在日志中输出完整敏感原文。
- outbox 必须确认。
- UI 要明确“消息来自本地微信记录”。

### 重复记录风险

解决：

- 强制 dedupeKey。
- upsert 而非 insert。
- 保留 duplicateCount。

### 时间不准风险

解决：

- 同时保存 messageTime 和 collectedAt。
- 不可靠时间标记 inferred。

### AI 误判风险

解决：

- 原始消息和 AI 理解分开。
- AI 结论必须有 sourceEventIds。
- 重要任务/记忆进入候选态。

## 14. 当前应立即做的最小闭环

优先级最高的落地顺序：

1. 建 `interaction_events` 和 `interaction_threads`。
2. 写微信 normalizer。
3. 写 upsert service。
4. 加 `wechatRecordNewMessages` 工具。
5. 加 API 和车间“交互”页。
6. 让车间 prompt 优先使用已记录消息。

这个闭环完成后，产品就从“智能体临时读微信”升级为：

```text
系统真实记录微信发生了什么，智能体基于这些记录工作。
```
