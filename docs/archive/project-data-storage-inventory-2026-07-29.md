# 项目数据存储梳理

更新时间：2026-07-29

> 历史快照：本文记录移除桌面端之前的存储状态，仅用于追溯迁移背景，不代表当前 Web-only 架构。

## 1. 总结

当前项目不是单一数据库架构，而是由几类存储共同组成：

| 存储域 | 当前承载 | 主要用途 | 当前问题 |
| --- | --- | --- | --- |
| 主业务库 | Postgres 或 SQLite | 用户、聊天、Bot、Insight、Loop、车间、Owner Context、RAG 元数据 | Tauri 路径来源不统一 |
| 文件对象存储 | Vercel Blob 或本地文件系统 | 上传文件、RAG 原文件、附件 | 文件元数据在主库，二进制在对象存储 |
| 向量索引 | sqlite-vec 或 Chroma | RAG、Insight、Raw Message 语义召回 | 和业务表存在同步/回退路径 |
| 原始消息存储 | Postgres raw_messages 或 @openzhiyu/sqlite | 旧记忆系统的原始消息与摘要 | SQLite 路径仍引用旧 path 模块 |
| Owner Context | 主业务库 interaction_* + memory_graph_* | 微信等外部交互沉淀成主人知识库 | 与旧 raw message memory 并存，边界需明确 |
| 智能体车间 | 主业务库 workshops_* | 车间配置、运行、记忆、发信、审核线索 | 运行状态和任务调度分散 |
| Loop 自动任务 | 主业务库 loops_* | 周期/条件任务、审批、运行状态 | 与车间 heartbeat 有交叉 |
| 量化服务 | 独立 Python 服务 JSON 文件 | 自选股、模拟盘账户、订单、成交 | 不在主库，状态不可统一审计 |
| 外部本地数据源 | wx-cli、桌面微信、iMessage chat.db | 只读外部事实来源 | 应视为 source，不应直接当项目存储 |
| 运行时文件 | logs、sessions、skills、模型缓存 | 本地运行支撑 | 路径和生命周期缺少统一登记 |

核心结论：

1. 主应用状态应该以主业务库为准。
2. 外部消息、量化行情、微信本地库都应该先作为 source/evidence，不应直接成为长期记忆。
3. 当前最紧急的问题是统一 Tauri 数据目录和数据库路径，否则脚本、主应用、原始消息存储可能写到不同 `data.db`。
4. 个人记忆重构后，应逐步把“主人知识库”作为全工作台唯一可召回的个人上下文入口，旧 raw message memory 退到兼容层。

## 2. 主业务库

入口代码：

- `apps/web/lib/db/adapters/index.ts`
- `apps/web/lib/db/adapters/sqlite.ts`
- `apps/web/lib/db/adapters/postgres.ts`
- `apps/web/lib/db/schema.ts`
- `apps/web/lib/db/schema-sqlite.ts`
- `apps/web/lib/db/schema.pg.ts`

选择规则：

```text
isTauriMode() = true
  -> SQLite
  -> TAURI_DB_PATH

isTauriMode() = false
  -> Postgres
  -> POSTGRES_URL || DATABASE_URL
```

主业务库的主要表域：

| 域 | SQLite/Postgres 表 |
| --- | --- |
| 用户/认证 | `User`, `password_reset_tokens`, `Stream`, `Vote` |
| 聊天 | `Chat`, `Message_v2`, `chat_insights` |
| Bot/集成 | `Bot`, `integration_accounts`, `integration_catalog`, `credential_*`, `user_contacts` |
| Insight | `Insight`, `insight_embeddings`, `insight_notes`, `insight_documents`, `insight_filters`, `insight_tabs`, `insight_weights`, `insight_entities` |
| RAG | `rag_documents`, `rag_chunks` |
| 文件 | `user_files`, `user_file_usage` |
| Loop | `loops`, `loop_runs`, `loop_states`, `loop_approval_requests` |
| Owner Context | `interaction_events`, `interaction_threads`, `interaction_processing_jobs`, `interaction_notes`, `interaction_tasks`, `interaction_memories`, `interaction_source_policies` |
| Graph RAG | `memory_graph_entities`, `memory_graph_relations`, `memory_graph_evidence` |
| 车间 | `workshops`, `workshop_heartbeats`, `workshop_runs`, `workshop_events`, `workshop_sources`, `workshop_directives`, `workshop_memories`, `workshop_outbox` |
| 订阅/额度 | `user_subscriptions`, `user_monthly_quota`, `user_free_quota`, `user_reward_events`, `user_credit_ledger` |

## 3. 路径系统现状

当前存在三套近似路径逻辑：

| 文件 | 当前默认逻辑 | 状态 |
| --- | --- | --- |
| `apps/web/lib/utils/path.ts` | Windows: `%USERPROFILE%\.openzhiyu\data\data.db` | 主路径 |
| `apps/web/lib/env/index.ts` | re-export `utils/path.ts` 的 Tauri 路径 | 主入口 |
| `apps/web/lib/env/tauri-paths.ts` | 兼容 shim，re-export `utils/path.ts` | 已收敛 |
| `apps/web/scripts/init-db.cjs` | Windows: `%USERPROFILE%\.openzhiyu\data\data.db` | 已收敛 |
| `apps/web/lib/db/init-db.ts` | `getTauriDbPath()` | 已收敛 |
| `apps/web/lib/db/migrate-sqlite.ts` | `getTauriDbPath()` | 已收敛 |
| `apps/web/drizzle.config.sqlite.ts` | 与 `utils/path.ts` 同等规则 | 已收敛 |
| `apps/web/scripts/start-workshop-heartbeat-scheduler.ts` | 默认使用应用同一 `TAURI_DB_PATH`，仅显式环境变量可隔离 | 已收敛 |

已修复的具体风险：

- `apps/web/lib/memory/sqlite-raw-message-store.ts` 已改为和主业务库使用同一个 `TAURI_DB_PATH`。
- `scripts/init-db.cjs`、`lib/db/init-db.ts`、`lib/db/migrate-sqlite.ts` 已对齐运行时主路径。
- `start-workshop-heartbeat-scheduler.ts` 不再默认写入 `D:\zhiyu\.workshop-heartbeat\data.db`，避免调度器和页面读不同库。
- 已新增 `/api/storage/diagnostics` 和存储管理面板诊断卡片，排障时可以直接查看当前连接的库。

整改方向：

1. 保留唯一入口：`apps/web/lib/env/index.ts`。
2. 删除或改造 `apps/web/lib/env/tauri-paths.ts`，让它只 re-export `@/lib/utils/path`。
3. 所有脚本默认路径改为调用同一套规则，或强制要求 `TAURI_DB_PATH`。
4. 增加运行时诊断 API：返回 `isTauriMode`, `TAURI_DATA_DIR`, `TAURI_DB_PATH`, `TAURI_STORAGE_PATH`, DB 是否存在、核心表数量。

## 4. Owner Context / 主人知识库

入口代码：

- `apps/web/lib/interactions/service.ts`
- `apps/web/lib/interactions/processor.ts`
- `apps/web/lib/interactions/graph.ts`
- `apps/web/lib/owner-context/service.ts`
- `apps/web/app/api/owner-context/route.ts`
- `apps/web/app/api/knowledge-pipeline/*`

数据流：

```text
微信本地工具 / 未来外部连接器
  -> interaction_events 原始证据
  -> interaction_threads 会话聚合
  -> interaction_processing_jobs 处理任务
  -> interaction_notes / interaction_tasks / interaction_memories 候选知识
  -> memory_graph_entities / relations / evidence 图谱关系
  -> Owner Context API
  -> Chat / Workshop / Loop / Quant 等工作台召回
```

设计边界：

- `interaction_events` 是原始事实证据，不应被智能体改写。
- `interaction_notes/tasks/memories` 是可再生成、可审核的候选层。
- `memory_graph_*` 是从候选和证据中抽取的关系层。
- 确认后的 Owner Context 才应该进入全工作台召回。
- 车间可以做候选审核，但需要保留 `sourceEventIds`。

## 5. 旧记忆系统

入口代码：

- `apps/web/lib/memory/raw-message-store.ts`
- `apps/web/lib/memory/sqlite-raw-message-store.ts`
- `apps/web/lib/memory/postgres-raw-message-store.ts`
- `packages/ai/src/memory/*`

现状：

- 非 Tauri 走 Postgres `rawMessages` / `memorySummaries`。
- Tauri 走 `@openzhiyu/sqlite`，在 SQLite 文件里维护 raw message 相关表和向量表。
- 这套系统偏“Bot/消息归档记忆”，不是当前要的“主人外部交互知识库”。

建议定位：

- 短期保留兼容，不再作为主人知识库主入口。
- 中期迁移重要可用数据到 Owner Context。
- 长期废弃或改造成 Owner Context 的低层 raw evidence adapter。

## 6. 文件与 RAG

入口代码：

- `apps/web/lib/storage/index.ts`
- `apps/web/lib/storage/adapters/index.ts`
- `apps/web/lib/files/*`
- `apps/web/lib/ai/rag/langchain-service.ts`
- `apps/web/lib/ai/rag/sqlite-vec-store.ts`
- `packages/ai/rag/*`

文件存储：

```text
Tauri
  -> local-fs
  -> TAURI_STORAGE_PATH

Web/Cloud
  -> Vercel Blob
```

RAG 存储：

| 内容 | 存储 |
| --- | --- |
| 文档元数据 | `rag_documents` |
| 文本 chunk | `rag_chunks` |
| embedding 文本备份 | `rag_chunks.embedding` |
| 向量索引 | sqlite-vec 或 Chroma |
| 原始文件 | Blob 或 local-fs |

风险：

- `rag_documents.blobPath` 指向对象存储，删除文档必须同时处理 DB 和文件。
- sqlite-vec/Chroma 是派生索引，不能作为唯一事实源。
- 更换 embedding model 时会出现多维度索引并存，需要明确 reindex 策略。

## 7. 智能体车间

入口代码：

- `apps/web/lib/workshops/service.ts`
- `apps/web/lib/workshops/mcp-tools.ts`
- `apps/web/lib/workshops/context-window.ts`
- `apps/web/app/api/workshops/*`
- `apps/web/app/(chat)/workshop/workshop-client.tsx`

核心表：

| 表 | 作用 |
| --- | --- |
| `workshops` | 车间定义、使命、边界、模型配置 |
| `workshop_heartbeats` | 持续运行/唤醒状态 |
| `workshop_runs` | 单次运行 |
| `workshop_events` | 工作记录、工具结果、审核提案来源 |
| `workshop_sources` | 车间资料源 |
| `workshop_directives` | 用户指令 |
| `workshop_memories` | 车间自己的长期经验 |
| `workshop_outbox` | 待发送/边界控制的发信草稿 |

和 Owner Context 的关系：

- 车间记忆是“某个车间如何工作”的经验。
- Owner Context 是“主人外部世界和关系”的知识库。
- 车间可以读取 Owner Context，也可以通过工具处理 Owner Context 候选，但不应把所有过程日志写成主人记忆。

## 8. Loop 自动任务

入口代码：

- `apps/web/lib/loops/*`
- `apps/web/app/(chat)/api/loops/*`
- `apps/web/app/(chat)/loops/page.tsx`

核心表：

| 表 | 作用 |
| --- | --- |
| `loops` | 自动任务定义 |
| `loop_runs` | 执行记录 |
| `loop_states` | 任务状态 |
| `loop_approval_requests` | 需要人工审核的动作 |

治理建议：

- Loop 是调度器和任务定义。
- Workshop 是执行主体和过程空间。
- 需要明确：Loop 触发 Workshop Run，而不是复制 Workshop 状态。

## 9. 量化服务

入口代码：

- `apps/web/lib/quant/client.ts`
- `apps/web/app/(chat)/api/quant/*`
- `tools/quant-service/app/provider.py`
- `tools/quant-service/app/paper_trading.py`

当前存储：

| 文件 | 作用 |
| --- | --- |
| `tools/quant-service/data/watchlist.json` | 自选股配置 |
| `tools/quant-service/data/paper_account.json` | 模拟盘账户、订单、成交 |

Web 侧只是 HTTP 转发：

```text
Quant page / Workshop tool
  -> apps/web/lib/quant/client.ts
  -> QUANT_SERVICE_URL, default http://127.0.0.1:8766
  -> tools/quant-service
  -> JSON files
```

风险：

- 模拟盘交易审计不在主库。
- 智能体审核/工作记录和量化订单事实分离。
- JSON 文件没有迁移、并发写和用户隔离模型。

当前已补的可见性：

- `tools/quant-service` 增加 `/storage/diagnostics`，返回自选股配置文件、模拟盘账户文件、订单/成交/持仓数量。
- Web 的 `/api/storage/diagnostics` 会尝试读取量化服务诊断；服务不可用时只标记量化存储不可用，不影响主库诊断。
- 存储管理面板展示量化服务地址、自选股数量、订单/成交数量和 JSON 文件路径。

整改方向：

1. 短期在主库增加 quant audit mirror：记录每次 watchlist/order/fill 的快照。
2. 中期把模拟盘账户、订单、成交迁入主库。
3. 长期让量化服务只负责数据接口和行情计算，状态归主库。

## 10. 外部本地数据源

| 来源 | 入口 | 存储定位 |
| --- | --- | --- |
| wx-cli | `apps/web/lib/wechat-local/client.ts` | 外部只读 source |
| WeChat desktop service | `tools/wechat-desktop-service` | 发送/预览工具，不是知识库 |
| iMessage chat.db | `apps/web/lib/integrations/imessage/*` | 外部只读 source |
| OpenClaw WeChat iLink | `apps/web/lib/integrations/weixin/*` | Bot/连接器消息源 |

原则：

- 外部库不能被当成项目主存储。
- 所有可被工作台长期使用的事实都应落到项目 evidence 表。
- 所有外发动作都必须经过 outbox / approval。

## 11. 整改优先级

### P0：统一运行时数据路径

目标：

- 主库、raw message SQLite、sqlite-vec、脚本初始化全部使用同一个 `TAURI_DB_PATH`。
- 页面提供“当前数据位置”诊断。

改造项：

1. `sqlite-raw-message-store.ts` 改为从 `@/lib/env` 引入 `TAURI_DB_PATH`。已完成。
2. `env/tauri-paths.ts` 改为兼容 re-export，禁止维护第二套路由。已完成。
3. `scripts/init-db.cjs` 与 `lib/utils/path.ts` 对齐。已完成。
4. 新增 `/api/storage/diagnostics` 或 `/api/db/diagnostics`。已完成：`/api/storage/diagnostics`。
5. 在存储管理面板展示当前运行模式、主库路径、数据目录、文件目录、日志目录。已完成。
6. `lib/db/init-db.ts`、`lib/db/migrate-sqlite.ts`、`drizzle.config.sqlite.ts` 对齐主路径。已完成。
7. `start-workshop-heartbeat-scheduler.ts` 默认使用应用同一 `TAURI_DB_PATH`。已完成。

### P1：建立存储边界文档和代码注释

目标：

- 每个数据域有 owner、事实源、派生索引、删除策略。

改造项：

1. 在主库 schema 附近增加域说明。
2. 为 Owner Context、Workshop、Loop、Quant 各自补“事实源/派生物”注释。
3. UI 侧展示数据来源，避免用户误判。

### P2：量化状态回主库

目标：

- 智能体下单、撤单、自选股调整都有主库审计记录。

改造项：

1. 先补量化服务存储诊断，避免外部 JSON 状态不可见。已完成。
2. 新增 `quant_watchlist_snapshots`, `quant_paper_orders`, `quant_paper_fills`, `quant_agent_actions`。
3. 量化服务 JSON 文件迁移为初始化/备份文件。
4. 车间审核直接引用主库 action id。

### P3：旧记忆系统收敛

目标：

- Owner Context 成为工作台个人上下文唯一主入口。

改造项：

1. 给旧 raw message memory 标记 legacy。
2. 明确搜索入口的 source 优先级。
3. 做一次迁移/丢弃策略，避免两套记忆相互污染。

## 12. 建议的目标架构

```text
External Sources
  微信 / 飞书 / QQ / 邮件 / iMessage / 量化行情
        |
        v
Evidence Layer
  interaction_events / source snapshots / quant audit events
        |
        v
Processing Layer
  processing_jobs / candidate tasks / candidate memories / graph extraction
        |
        v
Confirmed Knowledge Layer
  Owner Context confirmed memories / graph active relations / workshop memories
        |
        v
Execution Layer
  Workshop / Loop / Chat / Quant dashboard
        |
        v
Action Boundary
  approvals / outbox / simulated orders / audit log
```

工程控制论视角：

- Evidence 是被控对象的观测量。
- Candidate 是滤波和状态估计。
- Confirmed Knowledge 是系统状态。
- Workshop/Loop 是控制器。
- Outbox/Approval/Quant order 是受控输出。
- Diagnostics 是反馈通道。
