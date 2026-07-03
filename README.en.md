# OpenZhiyu

[中文](./README.md)

OpenZhiyu is a local-first personal agent workspace. It brings chat, memory, RAG, connectors, scheduled agent loops, desktop automation, and a Tauri desktop shell into one monorepo. The product goal is to let users create long-running personal automations with natural language.

The current project direction is:

- unify the project identity under OpenZhiyu;
- route scheduled work through the newer Loop Runtime;
- create, explain, trace, and recover automation tasks from natural language;
- start local development dependencies such as PostgreSQL and the WeChat desktop service automatically;
- connect external apps such as Feishu/Lark, DingTalk, WeChat, Telegram, Slack, Gmail, and Notion to the same agent runtime.

## Table Of Contents

- [Capabilities](#capabilities)
- [Repository Layout](#repository-layout)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Environment](#environment)
- [Loop Automation](#loop-automation)
- [Connectors](#connectors)
- [WeChat Desktop Service](#wechat-desktop-service)
- [RAG And Memory](#rag-and-memory)
- [Desktop App](#desktop-app)
- [Testing And Quality](#testing-and-quality)
- [Troubleshooting](#troubleshooting)
- [Development Guide](#development-guide)

## Capabilities

- **Agent chat**: model settings, files, history, tool calls, native/sandbox execution, and the Claude Agent path.
- **Loop automation**: natural-language task drafting, durable loops, run records, state, approvals, retries, and execution traces.
- **External connectors**: Feishu/Lark, DingTalk, QQ Bot, WeChat, Telegram, WhatsApp, iMessage, Slack, Discord, Gmail, Google Drive, Google Calendar, Google Docs, Notion, Linear, Jira, HubSpot, Asana, LinkedIn, X, RSS, and more.
- **RAG and knowledge files**: upload, parse, chunk, embed, and retrieve documents with sqlite-vec, pgvector, Chroma, cloud embeddings, or local embeddings.
- **Memory and insights**: raw message ingestion, semantic search, insight cards, timelines, notes, tasks, and analytics views.
- **Desktop automation**: a local Windows WeChat HTTP companion service with preview and confirmation-token based sending.
- **Desktop client**: a Tauri 2 target for building a local desktop application.

## Repository Layout

```text
.
├── apps/
│   ├── web/                         # Main app: Next.js, APIs, Loop, Tauri
│   └── marketing/                   # Marketing site
├── packages/
│   ├── ai/                          # Agent runtime, model routing, MCP, memory, RAG
│   ├── integrations/                # Connector abstractions and platform integrations
│   ├── rag/                         # Shared RAG, embeddings, vector stores
│   ├── runtime-api/                 # Runtime-facing APIs and contracts
│   ├── runtime-worker/              # Background worker primitives
│   ├── shared/                      # Shared types, constants, and utilities
│   ├── sqlite/                      # Local SQLite storage utilities
│   └── ...                          # hooks, i18n, audit, search, storage, and more
├── tools/
│   └── wechat-desktop-service/      # Windows WeChat desktop service
├── scripts/
│   └── start-local-deps.cjs         # Local dependency starter: Docker/Postgres/WeChat
├── docs/                            # Architecture plans, Loop roadmap, vector backend notes
├── benchmark/                       # RAG and long-memory benchmarks
├── skills/                          # Built-in OpenZhiyu Codex skills
├── screenshots/                     # Product screenshots
└── Casks/                           # Homebrew cask metadata
```

## Tech Stack

- **Languages**: TypeScript, JavaScript, Rust, Python
- **Frontend**: Next.js 16, React 19, Tailwind CSS, Radix UI
- **Desktop**: Tauri 2
- **Databases**: PostgreSQL, SQLite, Drizzle ORM
- **Vector search**: sqlite-vec, pgvector, Chroma
- **Agent runtime**: OpenAI-compatible APIs, Anthropic/Claude Agent SDK, MCP, native/sandbox execution
- **Package manager**: pnpm

## Requirements

- Node.js 22 recommended, Node.js 18+ required
- pnpm 10.14.0 recommended, pnpm 9+ required
- Docker Desktop for local PostgreSQL auto-start
- Python 3.9+ for the Windows WeChat desktop service
- Rust toolchain for Tauri builds
- PostgreSQL, either Docker-managed or self-managed
- At least one OpenAI-compatible model provider

## Quick Start

Install dependencies:

```powershell
pnpm install
```

Start local dependencies and the web app:

```powershell
pnpm dev
```

Default local URL:

```text
http://localhost:3515
```

`pnpm dev` runs:

1. `pnpm dev:deps`
2. `pnpm --filter web dev`

`dev:deps` attempts to:

- check and start Docker Desktop;
- create or start a local PostgreSQL container named `openzhiyu-postgres`;
- start the local WeChat desktop service at `http://127.0.0.1:8765`.

If you manage the database yourself or do not need the WeChat service, you can skip either step with environment variables.

## Commands

From the repository root:

```powershell
pnpm dev              # Start local deps and the web app
pnpm dev:deps         # Start local dependencies only
pnpm dev:web          # Start the web app only
pnpm build            # Build the web app
pnpm tsc              # Run TypeScript checks
pnpm test             # Run web tests
pnpm lint             # Run workspace lint
pnpm format:check     # Check formatting
pnpm tauri:dev        # Start Tauri desktop dev mode
pnpm tauri:build      # Build the Tauri desktop app
```

Inside `apps/web`:

```powershell
pnpm dev:nowarm       # Start dev without route warmup
pnpm dev:fast         # Faster local dev mode
pnpm dev:clean        # Clear .next and start dev
pnpm dev:webpack      # Next dev with webpack
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Drizzle Studio
pnpm smoke:loops      # Loop runtime smoke test
```

## Environment

Start from the example file:

```powershell
Copy-Item apps\web\.env.example apps\web\.env
```

Minimal local configuration usually includes:

```env
AUTH_SECRET=...
ENCRYPTION_KEY=...
POSTGRES_URL=postgres://openzhiyu:openzhiyu@127.0.0.1:5432/openzhiyu
LLM_BASE_URL=https://your-openai-compatible-provider/v1
LLM_API_KEY=...
LLM_MODEL=...
```

Common optional settings:

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

Default local PostgreSQL values:

```text
container: openzhiyu-postgres
image: postgres:16
user: openzhiyu
password: openzhiyu
database: openzhiyu
port: 5432
```

Override them with:

```env
OPENZHIYU_PG_HOST=127.0.0.1
OPENZHIYU_PG_PORT=5432
OPENZHIYU_PG_CONTAINER=openzhiyu-postgres
OPENZHIYU_PG_IMAGE=postgres:16
```

Skip automatic startup:

```env
OPENZHIYU_SKIP_POSTGRES=1
OPENZHIYU_SKIP_WECHAT=1
OPENZHIYU_SKIP_DOCKER_DESKTOP_START=1
```

## Loop Automation

Loop is the central object in the current OpenZhiyu automation redesign. It is more than a cron job:

```text
goal + trigger + context + allowed actions + approval policy + state + evaluation/recovery
```

Important files:

- `apps/web/app/(chat)/loops/page.tsx`: Loop page
- `apps/web/app/(chat)/api/loops/*`: Loop APIs
- `apps/web/lib/loops/natural-language.ts`: natural language to task draft
- `apps/web/lib/loops/spec.ts`: Loop Spec validation
- `apps/web/lib/loops/runtime.ts`: runtime state and execution entry points
- `apps/web/lib/loops/harness.ts`: execution harness
- `apps/web/lib/loops/native-executor.ts`: native agent execution
- `apps/web/lib/loops/native-scheduler.ts`: local scheduler
- `apps/web/lib/loops/verifier.ts`: result verification
- `apps/web/lib/ai/mcp/tools/loop-tasks.ts`: agent-facing Loop tools

Typical flow:

1. The user describes a task, for example: “Send today’s Beijing weather to File Transfer Assistant every day at 9 AM.”
2. The local model API turns the request into a strict Loop draft.
3. The user reviews and creates the Loop.
4. The local scheduler checks due tasks periodically.
5. The harness assembles context, tools, approval policy, and trace.
6. The native executor asks the agent to perform the real action.
7. The verifier/checker marks the run as complete, failed, retrying, blocked, or awaiting approval.

## Connectors

Connector accounts and credentials are stored in the database, while some real-time listeners are process-memory state. In development, restarting the server may require listener initialization again.

Important files:

- `apps/web/app/(auth)/api/integrations/route.ts`
- `apps/web/components/feishu-listener-init.tsx`
- `apps/web/lib/integrations/feishu/ws-listener.ts`
- `apps/web/lib/integrations/*`
- `packages/integrations/*`

Bot-style connectors such as Feishu and DingTalk usually have two separate concepts:

- **authorization/account**: credentials saved for platform access;
- **listener/long connection**: runtime process that receives messages in real time.

## WeChat Desktop Service

The WeChat desktop service is a local HTTP companion service that controls the logged-in Windows PC WeChat client.

Default URL:

```text
http://127.0.0.1:8765
```

Manual start:

```powershell
cd tools\wechat-desktop-service
.\start.ps1
```

Safety model:

- `/preview` only creates a preview and a short-lived confirm token;
- `/send` requires a valid confirm token;
- Loops can use task-level policy for automatic sending;
- PC WeChat automation may briefly focus the WeChat window;
- For fully background, stable, compliant messaging, prefer official APIs such as WeCom, Feishu, or DingTalk when possible.

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:8765/health -UseBasicParsing
```

## RAG And Memory

RAG and memory cover file knowledge bases, raw messages, insights, and semantic retrieval.

Important files:

- `apps/web/app/api/rag/*`
- `apps/web/lib/ai/rag/*`
- `apps/web/lib/runtime-api/rag.ts`
- `apps/web/lib/runtime-worker/rag-indexing.ts`
- `packages/rag/*`
- `packages/ai/rag/*`
- `packages/ai/src/memory/*`

The default local vector backend can be sqlite-vec. Chroma can be used when an independent vector service is needed. pgvector can be used when you prefer PostgreSQL as the unified store.

More details:

- `docs/vector-backends.md`
- `docs/performance-runtime-plan.md`

## Desktop App

Tauri code lives in:

```text
apps/web/src-tauri
```

Useful commands:

```powershell
pnpm tauri:dev
pnpm tauri:build
pnpm --filter web tauri:build:debug
```

The desktop app reuses most web pages, state, and APIs while adding local runtime, filesystem, and desktop capabilities.

## Testing And Quality

Recommended CI/local checks:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm tsc
pnpm test
```

After a larger refactor, start with `pnpm lint` and `pnpm tsc`. The project uses Biome, Prettier, TypeScript, and Vitest as its primary quality gates.

## Troubleshooting

### `pnpm` is not recognized

```powershell
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

or:

```powershell
npm install -g pnpm@10.14.0
```

### Docker is not running

`pnpm dev:deps` attempts to start Docker Desktop. If Docker is installed in a custom location, configure:

```env
DOCKER_DESKTOP_PATH=C:\Path\To\Docker Desktop.exe
DOCKER_CLI_PATH=C:\Path\To\docker.exe
```

If you manage PostgreSQL yourself:

```env
OPENZHIYU_SKIP_POSTGRES=1
```

### First route navigation is slow

Next.js dev compiles routes on demand. `apps/web/scripts/dev-with-warmup.cjs` warms common routes, but first startup can still take time.

Skip warmup:

```powershell
pnpm --filter web dev:nowarm
```

### Feishu QR authorization succeeded but the bot does not respond

QR authorization means credentials are saved. Real-time message delivery still depends on a running WebSocket listener. After a development server restart, open `/connectors` to trigger listener initialization.

### WeChat sending reports `ECONNREFUSED 127.0.0.1:8765`

The WeChat desktop service is not running. Run:

```powershell
pnpm dev:deps
```

or start it manually:

```powershell
cd tools\wechat-desktop-service
.\start.ps1
```

## Development Guide

If you are new to TypeScript, approach the project in this order:

1. Start with `apps/web/app` to understand pages and API routes.
2. Read `apps/web/lib/db` to understand persistence.
3. For Loop features, start from `apps/web/lib/loops`.
4. For connectors, start from `apps/web/lib/integrations` and `packages/integrations`.
5. For agent capabilities, read `packages/ai/src/agent` and `apps/web/lib/ai`.
6. For desktop capabilities, read `apps/web/src-tauri` and `tools/`.

For small changes, copy the nearest local pattern. For larger features, work in this order: data model, API route, service layer, UI state, tests, and README/update notes.

## License

See [LICENSE](./LICENSE).
