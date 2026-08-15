# Contributing to Zhiyu

Zhiyu 当前以个人智能体工作台为核心，优先接受能增强可观测性、边界控制、运行稳定性和可恢复性的改动。

## 开发流程

1. 从 `main` 创建短生命周期分支。
2. 先阅读 [`AGENTS.md`](./AGENTS.md) 和 [`docs/README.md`](./docs/README.md)。
3. 保持改动聚焦，不提交日志、数据库、密钥、用户数据或生成产物。
4. 对权限、记忆、Loop、工具和外部动作的改动补充相应测试。
5. 提交前运行与改动范围匹配的检查。

```powershell
pnpm install
pnpm tsc
pnpm test
pnpm lint
```

## 设计要求

- 明确被控对象、观测输入、状态、动作、反馈和人工接管位置。
- 原始事实、模型理解、控制动作和执行结果分层存储。
- `denied` 优先于 `approvalRequired` 和 `allowed`。
- 外发、删除、权限、配置和真实资金动作默认需要审核。
- 失败必须可见，不允许静默降级或伪装成完整数据。
- 新工具通过注册表和统一事件协议接入，不在页面中硬编码单个智能体。

## Pull Request

PR 描述应说明改了什么、为什么改、影响哪些边界、如何验证，以及失败时如何回滚。涉及 YAML schema 或工具合约时，请同时给出合法与非法样例。

项目采用 [Apache License 2.0](./LICENSE)。提交代码即表示你有权按该许可证提供这些改动。
