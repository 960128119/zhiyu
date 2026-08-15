# Zhiyu

Zhiyu 是一个本地优先的个人智能体工作台。它把对话、长期运行的智能体车间、分层记忆、工具权限、定时 Loop、可观测事件和人工审核放进同一套闭环运行时，让智能体不只回答问题，也能持续观测、计划、行动、验证和留下可追溯产物。

当前仓库聚焦 Web 工作台，不包含桌面客户端，也不再内置 Slack、Telegram、飞书、钉钉等 Bot 连接器。微信桌面服务、量化模拟盘和内容发布是现阶段的本地能力样例。

## 核心模型

- **Chat**：主人控制台，可以读取全局上下文、调用平台工具、创建或修改车间。
- **Workshop / Work**：长期运行的智能体控制器。Work 是可版本化、可观测、可审计的车间定义。
- **Loop**：属于某个 Work 的持续任务，包含触发、上下文、动作、验证、失败与下一轮反馈，不是孤立的 cron。
- **Skill**：智能体执行任务前读取的方法说明书；它不授予权限。
- **Tool policy**：显式定义允许、需审核和拒绝的动作，`denied` 始终优先。
- **Brain memory**：分层、带作用域和授权的记忆系统，召回与写入均留下日志和反馈。
- **Harness**：围绕 Work 的提示词、上下文、Skill、工具合约、Loop、记忆策略、验证器和产物策略。

```mermaid
flowchart LR
  Owner["主人 / Chat"] --> Review["创建、修改与人工审核"]
  Review --> Work["Workshop / Work"]
  Work --> Loop["Loop 调度与运行"]
  Loop --> Observe["观测与上下文组装"]
  Observe --> Model["模型推理"]
  Model --> Gate["工具权限与边界"]
  Gate --> Action["工具动作与产物"]
  Action --> Verify["验证、事件与反馈"]
  Verify --> Loop
  Observe <--> Brain["Brain 分层记忆"]
```

工程原则是：先观测，再建模；先闭环，再自动；先边界，再行动；先稳定，再智能。

## 已实现能力

- 使用标准化 YAML 创建或更新智能体车间，并校验 schema、工具存在性、Skill 绑定、边界和运行可用性。
- 手动或定时运行 Loop，支持暂停、恢复、删除、补偿执行、心跳、失败原因和运行留痕。
- 按车间隔离写权限，并通过 grant 控制跨车间只读记忆访问。
- 对记忆进行结构化写入、向量与关键词混合召回、访问过滤、质量反馈和审计。
- 通过 action guard、审批、outbox 和 verifier 控制外发、配置修改及高风险动作。
- 记录 Work、Loop、工具调用、上下文包、产物和 Harness 评估证据。
- 提供自选股猎手与模拟盘操盘交易员样例，包含趋势数据、规则计算、交易计划台账和复盘。
- 提供本地微信桌面服务、抖音发布准备、量化数据服务和视频生成工具。

量化模块只用于受控模拟与策略失效分析，不接入真实资金，也不构成投资建议。

## 目录结构

```text
zhiyu/
├─ apps/web/                 Next.js Web 工作台、API 与核心业务运行时
├─ packages/                 AI、RAG、存储、安全、审计和共享基础包
├─ manifests/workshops/      可审阅的车间 YAML 模板
├─ skills/                   Work 与 Loop 使用的方法说明书
├─ tools/
│  ├─ quant-service/         A 股行情与趋势计算服务
│  ├─ wechat-desktop-service/微信桌面自动化服务
│  ├─ douyin-publisher/      内容发布辅助工具
│  └─ ai-release-video-agent/视频生成工具
├─ docs/                     架构、实施计划、参考资料和历史方案
├─ scripts/                  本地依赖启动脚本
└─ AGENTS.md                 仓库级工程约束
```

`node_modules`、数据库、日志、下载文件、生成视频、Python 虚拟环境和本地工具副本均不会进入 Git。

## 本地启动

### 环境要求

- Windows 10/11（微信桌面服务目前以 Windows 为主）
- Node.js 22+
- pnpm 10+
- Docker Desktop 或可访问的 PostgreSQL 16
- Python 3.11/3.12（量化和微信本地服务）

### 安装与配置

```powershell
pnpm install
Copy-Item apps/web/.env.example apps/web/.env.local
```

至少配置以下变量：

```dotenv
AUTH_SECRET=replace-with-random-secret
ENCRYPTION_KEY=replace-with-32-byte-base64url-key
POSTGRES_URL=postgres://openzhiyu:openzhiyu@127.0.0.1:5432/openzhiyu
LLM_BASE_URL=https://your-openai-compatible-provider/v1
LLM_API_KEY=replace-with-provider-key
LLM_MODEL=replace-with-model-id
```

生成本地密钥：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 启动

```powershell
pnpm dev
```

该命令会检查或启动 PostgreSQL、量化服务和微信桌面服务，然后启动 Web 应用：

- Web：`http://127.0.0.1:3515`
- 量化服务：`http://127.0.0.1:8766`
- 微信桌面服务：`http://127.0.0.1:8765`

不需要某个本地服务时可以跳过：

```powershell
$env:OPENZHIYU_SKIP_WECHAT='1'
$env:OPENZHIYU_SKIP_QUANT='1'
pnpm dev
```

只启动 Web：

```powershell
pnpm dev:web
```

微信历史读取使用外部 `wx` 命令，可通过 `WECHAT_LOCAL_WX_BINARY` 指定可执行文件。仓库不会打包第三方 `wx-cli` 源码或用户微信数据。

## 车间 YAML

默认模板位于 [`manifests/workshops`](./manifests/workshops)。创建与修改使用同一套审核入口，运行前会检查：

1. API 版本、kind、metadata、mission 和 Work 控制合约。
2. Loop 的触发方式、时区、上下文、动作、验证和失败处理。
3. 申请的工具是否存在，参数 schema 是否匹配，是否越过 denied 或 approval 边界。
4. Skill 是否存在且可加载，记忆作用域与授权是否有效。
5. 最低可运行条件、幂等约束、审计事件和回滚信息是否完整。

示例模板包括自选股猎手、模拟盘操盘交易员、记忆召回质量管家和 Harness 质量管家。

## 常用命令

```powershell
pnpm dev             # 启动本地依赖与 Web
pnpm dev:web         # 只启动 Web
pnpm tsc             # TypeScript 检查
pnpm test            # 核心单元与 API 测试
pnpm build           # 生产构建
pnpm lint            # Biome 检查
```

测试重点覆盖权限优先级、跨车间记忆访问、Loop 调度与补偿、Harness 候选评估、工具参数校验、量化规则计算和高风险动作阻断。

## 文档

文档入口见 [`docs/README.md`](./docs/README.md)。核心阅读顺序：

1. [`工程控制论指导原则`](./docs/architecture/engineering-cybernetics-guiding-principles.md)
2. [`Zhiyu 控制架构契约`](./docs/architecture/zhiyu-control-architecture-contract.md)
3. [`智能体车间技术方案`](./docs/plans/smart-agent-workshop-technical-plan.md)
4. [`Work 与车间架构方案`](./docs/plans/workshop-work-architecture-plan.md)
5. [`Agentic Harness 演化升级方案`](./docs/plans/agentic-harness-evolution-upgrade-plan.md)

## 安全约定

- 不提交 `.env`、API Key、数据库、日志、用户记忆、微信数据或生成产物。
- 所有外部发送、真实资金、删除、权限与配置变更都必须经过明确边界。
- 降级数据必须暴露来源、时间、新鲜度和 warning，不能伪装成完整观测。
- 关键动作必须幂等、可审计、可回放，并有失败与人工接管路径。

## License

[Apache License 2.0](./LICENSE)
