# OpenZhiyu

[English](./README.en.md)

OpenZhiyu 是一个本地优先的个人智能体工作台。它把对话、记忆、RAG、连接器、自动化 Loop、桌面自动化和 Tauri 桌面端放在同一个 monorepo 里，目标是让用户用自然语言创建可长期运行的个人自动化任务。

当前项目重点是：

- 统一项目身份为 OpenZhiyu；
- 将定时任务收束到新版 Loop Runtime；
- 支持用自然语言创建、解释、追踪和恢复自动化任务；
- 在本地开发时自动拉起 PostgreSQL、微信桌面服务等依赖；
- 将飞书、钉钉、微信、Telegram、Slack、Gmail、Notion 等外部连接器接入同一套智能体能力。

## 目录

- [核心能力](#核心能力)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [快速启动](#快速启动)
- [常用命令](#常用命令)
- [环境变量](#环境变量)
- [Loop 自动化](#loop-自动化)
- [连接器](#连接器)
- [微信桌面服务](#微信桌面服务)
- [RAG 与记忆](#rag-与记忆)
- [桌面端](#桌面端)
- [测试与质量检查](#测试与质量检查)
- [常见问题](#常见问题)
- [开发指南](#开发指南)

## 核心能力

- **智能体对话**：支持模型配置、文件、历史记录、工具调用、原生/沙盒执行路径和 Claude Agent 路径。
- **Loop 自动化**：用自然语言生成严格任务草稿，持久化任务、运行记录、状态、审批、重试和执行 trace。
- **外部连接器**：支持飞书/Lark、钉钉、QQ Bot、微信、Telegram、WhatsApp、iMessage、Slack、Discord、Gmail、Google Drive、Google Calendar、Google Docs、Notion、Linear、Jira、HubSpot、Asana、LinkedIn、X、RSS 等渠道。
- **RAG 与文件知识库**：支持文件上传、解析、切片、向量检索、sqlite-vec、pgvector、Chroma，以及云端或本地 embedding。
- **记忆与洞察**：提供原始消息摄取、语义检索、insight cards、时间线、笔记、任务和分析视图。
- **桌面自动化**：提供 Windows 桌面微信 HTTP companion service，可通过预览/确认令牌发送 PC 微信消息。
- **桌面客户端**：基于 Tauri 2，可以构建本地桌面应用。

## 项目结构

```text
.
├── apps/
│   ├── web/                         # 主应用：Next.js、API、Loop、Tauri
│   └── marketing/                   # 官网/营销站
├── packages/
│   ├── ai/                          # Agent runtime、模型路由、MCP、记忆、RAG
│   ├── integrations/                # 连接器抽象和各平台集成
│   ├── rag/                         # 通用 RAG、embedding、向量存储
│   ├── runtime-api/                 # Runtime API 类型与入口
│   ├── runtime-worker/              # 后台 worker 基础能力
│   ├── shared/                      # 共享类型、常量和工具
│   ├── sqlite/                      # SQLite 本地存储能力
│   └── ...                          # hooks、i18n、audit、search、storage 等
├── tools/
│   └── wechat-desktop-service/      # Windows 微信桌面服务
├── scripts/
│   └── start-local-deps.cjs         # 本地依赖启动器：Docker/Postgres/微信服务
├── docs/                            # 架构计划、Loop 路线图、向量后端说明
├── benchmark/                       # RAG/长记忆 benchmark
├── skills/                          # 项目内置 Codex skills
├── screenshots/                     # 产品截图
└── Casks/                           # Homebrew cask 元数据
```

## 技术栈

- **语言**：TypeScript、JavaScript、Rust、Python
- **前端**：Next.js 16、React 19、Tailwind CSS、Radix UI
- **桌面端**：Tauri 2
- **数据库**：PostgreSQL、SQLite、Drizzle ORM
- **向量检索**：sqlite-vec、pgvector、Chroma
- **智能体运行时**：OpenAI-compatible API、Anthropic/Claude Agent SDK、MCP、native/sandbox execution
- **包管理**：pnpm

## 环境要求

- Node.js 22 推荐，最低要求 Node.js 18+
- pnpm 10.14.0 推荐，最低要求 pnpm 9+
- Docker Desktop，用于本地自动启动 PostgreSQL
- Python 3.9+，用于 Windows 微信桌面服务
- Rust toolchain，用于 Tauri 构建
- PostgreSQL，本地 Docker 或自建均可
- 至少一个 OpenAI-compatible 模型供应商

## 快速启动

安装依赖：

```powershell
pnpm install
```

启动本地依赖和 Web 应用：

```powershell
pnpm dev
```

默认访问地址：

```text
http://localhost:3515
```

`pnpm dev` 会依次执行：

1. `pnpm dev:deps`
2. `pnpm --filter web dev`

`dev:deps` 会尝试：

- 检查并启动 Docker Desktop；
- 创建或启动本地 PostgreSQL 容器 `openzhiyu-postgres`；
- 启动本地微信桌面服务 `http://127.0.0.1:8765`。

如果你已经自己管理数据库或不需要微信服务，可以通过环境变量跳过对应步骤。

## 常用命令

仓库根目录：

```powershell
pnpm dev              # 启动本地依赖 + Web 应用
pnpm dev:deps         # 只启动本地依赖
pnpm dev:web          # 只启动 Web 应用
pnpm build            # 构建 Web 应用
pnpm tsc              # TypeScript 类型检查
pnpm test             # 运行 Web 测试
pnpm lint             # 运行 workspace lint
pnpm format:check     # 检查格式
pnpm tauri:dev        # 启动 Tauri 桌面开发模式
pnpm tauri:build      # 构建 Tauri 桌面端
```

`apps/web` 内：

```powershell
pnpm dev:nowarm       # 不执行路由预热的开发模式
pnpm dev:fast         # 更快的本地开发模式
pnpm dev:clean        # 清理 .next 后启动
pnpm dev:webpack      # 使用 webpack 的 Next dev
pnpm db:migrate       # 执行数据库迁移
pnpm db:studio        # 打开 Drizzle Studio
pnpm smoke:loops      # Loop runtime 冒烟测试
```

## 环境变量

从示例文件开始：

```powershell
Copy-Item apps\web\.env.example apps\web\.env
```

最小本地配置通常包括：

```env
AUTH_SECRET=...
ENCRYPTION_KEY=...
POSTGRES_URL=postgres://openzhiyu:openzhiyu@127.0.0.1:5432/openzhiyu
LLM_BASE_URL=https://your-openai-compatible-provider/v1
LLM_API_KEY=...
LLM_MODEL=...
```

常用可选配置：

```env
ENABLE_LOCAL_SCHEDULER=true
WECHAT_DESKTOP_SERVICE_URL=http://127.0.0.1:8765
WECHAT_DESKTOP_TOKEN=...
LOOP_NL_LLM_BASE_URL=...
LOOP_NL_LLM_API_KEY=...
LOOP_NL_LLM_MODEL=...
OPENAI_EMBEDDINGS_API_KEY=...
LLM_EMBEDDING_BASE_URL=...
LLM_EMBEDDING_MODEL=...
VECTOR_STORE_BACKEND=sqlite-vec
CHROMA_URL=http://localhost:8000
```

本地 PostgreSQL 默认值：

```text
container: openzhiyu-postgres
image: postgres:16
user: openzhiyu
password: openzhiyu
database: openzhiyu
port: 5432
```

可以用这些变量覆盖：

```env
OPENZHIYU_PG_HOST=127.0.0.1
OPENZHIYU_PG_PORT=5432
OPENZHIYU_PG_CONTAINER=openzhiyu-postgres
OPENZHIYU_PG_IMAGE=postgres:16
```

跳过自动启动：

```env
OPENZHIYU_SKIP_POSTGRES=1
OPENZHIYU_SKIP_WECHAT=1
OPENZHIYU_SKIP_DOCKER_DESKTOP_START=1
```

## Loop 自动化

Loop 是当前 OpenZhiyu 自动化改造的核心对象。它不只是一个 cron job，而是：

```text
目标 + 触发器 + 上下文 + 可用动作 + 审批策略 + 状态 + 评测/恢复
```

主要代码：

- `apps/web/app/(chat)/loops/page.tsx`：Loop 页面
- `apps/web/app/(chat)/api/loops/*`：Loop API
- `apps/web/lib/loops/natural-language.ts`：自然语言生成任务草稿
- `apps/web/lib/loops/spec.ts`：Loop Spec 校验
- `apps/web/lib/loops/runtime.ts`：运行状态与执行入口
- `apps/web/lib/loops/harness.ts`：执行 harness
- `apps/web/lib/loops/native-executor.ts`：原生智能体执行
- `apps/web/lib/loops/native-scheduler.ts`：本地调度器
- `apps/web/lib/loops/verifier.ts`：执行结果评测
- `apps/web/lib/ai/mcp/tools/loop-tasks.ts`：Agent 可调用的 Loop 工具

典型流程：

1. 用户用自然语言描述任务，例如“每天早上 9 点把北京天气发给文件传输助手”。
2. 本地大模型 API 解析成严格 Loop 草稿。
3. 用户确认并创建任务。
4. 本地 scheduler 周期性检查到期任务。
5. harness 组织上下文、工具、审批策略和 trace。
6. native executor 调用智能体执行真实动作。
7. verifier/checker 判断成功、失败、重试、阻塞或需要审批。

## 连接器

连接器账号和授权信息会持久化在数据库中，但部分实时监听器是进程内状态，开发服务器重启后需要重新初始化。

重要文件：

- `apps/web/app/(auth)/api/integrations/route.ts`
- `apps/web/components/feishu-listener-init.tsx`
- `apps/web/lib/integrations/feishu/ws-listener.ts`
- `apps/web/lib/integrations/*`
- `packages/integrations/*`

飞书、钉钉等机器人类连接器通常包含两个概念：

- **授权/账号**：证明项目有权限访问平台；
- **监听器/长连接**：负责实时接收消息，开发模式重启后需要重新拉起。

## 微信桌面服务

微信桌面服务是一个本地 HTTP companion service，用于控制已经登录的 Windows PC 微信。

默认地址：

```text
http://127.0.0.1:8765
```

手动启动：

```powershell
cd tools\wechat-desktop-service
.\start.ps1
```

安全模型：

- `/preview` 只生成预览和短期 confirm token；
- `/send` 必须携带有效 confirm token；
- Loop 中可以根据任务策略走自动发送；
- 当前 PC 微信自动化可能短暂聚焦微信窗口；
- 如果需要完全后台、稳定、合规的个人消息能力，建议优先考虑企业微信、飞书、钉钉等官方 API 渠道。

健康检查：

```powershell
Invoke-WebRequest http://127.0.0.1:8765/health -UseBasicParsing
```

## RAG 与记忆

RAG 与记忆能力覆盖文件知识库、原始消息、insight 和语义检索。

主要代码：

- `apps/web/app/api/rag/*`
- `apps/web/lib/ai/rag/*`
- `apps/web/lib/runtime-api/rag.ts`
- `apps/web/lib/runtime-worker/rag-indexing.ts`
- `packages/rag/*`
- `packages/ai/rag/*`
- `packages/ai/src/memory/*`

默认本地向量后端可以使用 sqlite-vec；需要独立向量服务时可以切换到 Chroma；需要 PostgreSQL 统一管理时可以使用 pgvector。

更多说明见：

- `docs/vector-backends.md`
- `docs/performance-runtime-plan.md`

## 桌面端

Tauri 代码位于：

```text
apps/web/src-tauri
```

常用命令：

```powershell
pnpm tauri:dev
pnpm tauri:build
pnpm --filter web tauri:build:debug
```

桌面端会复用 Web 应用的大部分页面、状态和 API，同时加入本地运行时、文件系统和桌面能力。

## 测试与质量检查

CI/本地建议检查：

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm tsc
pnpm test
```

如果大改后 CI 失败，优先从 `pnpm lint` 和 `pnpm tsc` 看起。当前项目使用 Biome、Prettier、TypeScript 和 Vitest 做基础质量门禁。

## 常见问题

### `pnpm` 不能识别

```powershell
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

或：

```powershell
npm install -g pnpm@10.14.0
```

### Docker 没有启动

`pnpm dev:deps` 会尝试启动 Docker Desktop。若 Docker 安装在非默认路径，请配置：

```env
DOCKER_DESKTOP_PATH=C:\Path\To\Docker Desktop.exe
DOCKER_CLI_PATH=C:\Path\To\docker.exe
```

如果你自己管理 PostgreSQL：

```env
OPENZHIYU_SKIP_POSTGRES=1
```

### 首次切换页面很慢

Next.js dev 会按需编译路由。项目内的 `apps/web/scripts/dev-with-warmup.cjs` 会预热常用路由，但首次启动仍可能比较慢。

跳过预热：

```powershell
pnpm --filter web dev:nowarm
```

### 飞书扫码成功但机器人没反应

扫码授权只代表账号或应用凭据已保存；消息能否实时进入项目，还依赖运行中的 WebSocket listener。开发服务器重启后，需要重新初始化 listener，通常打开 `/connectors` 页面会触发初始化逻辑。

### 微信发送报 `ECONNREFUSED 127.0.0.1:8765`

说明微信桌面服务没有运行。执行：

```powershell
pnpm dev:deps
```

或手动启动：

```powershell
cd tools\wechat-desktop-service
.\start.ps1
```

## 开发指南

如果你刚接触 TypeScript，可以按下面顺序理解项目：

1. 先看 `apps/web/app`，理解页面和 API 路由。
2. 再看 `apps/web/lib/db`，理解数据如何读写。
3. 修改 Loop 功能时，从 `apps/web/lib/loops` 开始。
4. 修改连接器时，从 `apps/web/lib/integrations` 和 `packages/integrations` 开始。
5. 修改智能体能力时，看 `packages/ai/src/agent` 和 `apps/web/lib/ai`。
6. 修改桌面能力时，看 `apps/web/src-tauri` 和 `tools/`。

小改动优先模仿附近文件的写法；大功能建议按“数据模型 -> API -> 服务层 -> UI -> 测试 -> README”的顺序推进。

## License

See [LICENSE](./LICENSE).
