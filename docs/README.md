# Zhiyu 技术文档

文档按用途分为四类。架构文档定义长期约束；计划文档描述具体升级路径；参考文档记录运行、存储和验收细节；归档文档只保留历史决策背景，不作为当前实现依据。

## 架构

- [`engineering-cybernetics-guiding-principles.md`](./architecture/engineering-cybernetics-guiding-principles.md)：项目工程控制论原则。
- [`zhiyu-control-architecture-contract.md`](./architecture/zhiyu-control-architecture-contract.md)：Chat、Work、Loop、记忆、工具与审核的控制架构契约。
- [`lightweight-core-capabilities-upgrade-plan.md`](./architecture/lightweight-core-capabilities-upgrade-plan.md)：底层能力的轻量化边界与演进顺序。

## 实施计划

- [`smart-agent-workshop-technical-plan.md`](./plans/smart-agent-workshop-technical-plan.md)：智能体车间与 YAML 创建/修改流程。
- [`workshop-work-architecture-plan.md`](./plans/workshop-work-architecture-plan.md)：Workshop 到可版本化 Work 的架构升级。
- [`work-runtime-tightening-plan.md`](./plans/work-runtime-tightening-plan.md)：运行时契约、状态和失败语义收紧。
- [`agentic-harness-evolution-upgrade-plan.md`](./plans/agentic-harness-evolution-upgrade-plan.md)：Harness 证据、评估、候选版本和审核发布。
- [`wechat-interaction-memory-technical-plan.md`](./plans/wechat-interaction-memory-technical-plan.md)：微信原始观测到理解、任务与记忆的处理链路。
- [`quant-trend-following-foundation-plan.md`](./plans/quant-trend-following-foundation-plan.md)：量化趋势、规则、计划台账和模拟执行闭环。
- [`performance-runtime-plan.md`](./plans/performance-runtime-plan.md)：轻量首屏、懒加载和运行时性能方案。

## 参考

- [`domain-glossary.md`](./reference/domain-glossary.md)：Work、Loop、Harness、记忆和演化相关术语。
- [`vector-backends.md`](./reference/vector-backends.md)：向量后端与召回配置。
- [`harness-evolution-local-acceptance.md`](./reference/harness-evolution-local-acceptance.md)：Harness 本地迁移验收记录。
- [`adr/0001-scope-memory-recall-policy.md`](./adr/0001-scope-memory-recall-policy.md)：记忆召回作用域策略 ADR。

## 归档

- [`loop-engineering-product-directions.md`](./archive/loop-engineering-product-directions.md)
- [`loop-runtime-roadmap.md`](./archive/loop-runtime-roadmap.md)
- [`quant-system-github-comparison.md`](./archive/quant-system-github-comparison.md)
- [`project-data-storage-inventory-2026-07-29.md`](./archive/project-data-storage-inventory-2026-07-29.md)：移除桌面端前的数据存储快照。

归档内容可能与当前 schema、命名或运行时不一致。实现判断以代码、迁移、测试、manifest 和架构文档为准。
