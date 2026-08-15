# Harness 可观测演化升级本地验收报告

验收日期：2026-08-12
对应方案：`docs/plans/agentic-harness-evolution-upgrade-plan.md`

## 1. 验收结论

本次升级完成方案中的 Level 1 Harness Quality Work，以及 Level 2 所需的隔离候选、评测和回滚基础能力。生产 Harness 自动发布未启用，也不在本次验收范围内。

系统现在形成以下闭环：

1. Work 和 Loop 运行前解析不可变 Harness Snapshot。
2. 运行后写入脱敏 Evidence Bundle 与诊断结果。
3. 评测系统使用固定 Suite、Scenario、Baseline 和 Candidate 做匹配比较。
4. Harness Quality Work 只能观察、诊断、运行隔离评测并提交 Proposal v2。
5. 所有候选物化、批准、发布和回滚都有独立状态、审计记录与边界检查。
6. `denied`、受保护组件和真实世界动作约束优先于任务得分。

## 2. 交付范围

| 能力                    | 验收状态 | 说明                                                                                                         |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| 组件注册与版本          | 通过     | Prompt、Skill、Tool contract/implementation、Loop、Memory、Context、Artifact、Middleware 等均可形成 Revision |
| Work Harness Snapshot   | 通过     | 使用规范化 JSON 与内容哈希生成稳定快照，快照项不可变                                                         |
| Evidence Shadow Capture | 通过     | Work/Loop 运行结果可写入 Evidence Bundle、诊断、工具调用与边界拒绝摘要                                       |
| Evaluation Framework    | 通过     | 支持 Suite、Scenario、Campaign、Run、Baseline/Candidate 匹配与硬约束优先判定                                 |
| Proposal v2             | 通过     | 支持预测、证据引用、影响范围、修改预算、状态机与旧提案兼容读取                                               |
| 归因与回滚              | 通过     | 支持 Verdict、候选归因、回滚计划和生产发布保护                                                               |
| Harness Quality Work    | 通过     | 已创建 Level 1 质量管家，只能提出建议，不能应用或发布生产变更                                                |
| 车间页面                | 通过     | 新增“演化”标签，支架、证据、评测、变更四个分区按需加载                                                       |
| Level 2 自动 Canary     | 未启用   | 已具备隔离候选和 Campaign 基础，但不会自动发布或确认生产版本                                                 |

## 3. 数据库与迁移

PostgreSQL 真实本地数据库迁移成功，新增 13 张 Harness 控制表；SQLite 同步提供对应迁移。重复执行迁移不会破坏已有数据。

主要表包括：

- `harness_components`
- `harness_component_revisions`
- `work_harness_snapshots`
- `work_harness_snapshot_items`
- `work_run_evidence_bundles`
- `work_run_diagnostics`
- `work_evaluation_suites`
- `work_evaluation_scenarios`
- `work_evaluation_campaigns`
- `work_evaluation_runs`
- `work_harness_change_proposals`
- `work_harness_change_items`
- `work_evolution_verdicts`

特性开关为 `WORK_HARNESS_EVOLUTION_ENABLED`。真实本地环境已启用，`.env.example` 保持关闭，避免未经迁移和验收的环境意外开启。

## 4. 真实数据回填

### 4.1 Dry run

- 发现 Work：6
- 解析 Snapshot：6
- 实际写入 Snapshot：0
- 双读差异：0
- 错误：0

### 4.2 Apply

- 回填 Work：6
- 持久化 Snapshot：6
- 捕获历史 Evidence Bundle：20
- 双读差异：0
- 错误：0

历史证据分布：操盘交易员 10 条、自选股猎手 5 条、主人知识库管家 2 条，其余三个 Work 各 1 条。

### 4.3 幂等复验

创建 Harness 质量管家后再次执行回填：

- 解析 Work：7
- 7 个 Snapshot ID 全部保持稳定
- 新增重复 Evidence Bundle：0
- 双读差异：0
- 错误：0

### 4.4 安全计数

三轮回填均满足：

- 外部消息发送：0
- 真实资金动作：0
- 模拟账户修改：0
- 生产 Harness 发布：0

验收产物：

- `artifacts/harness-evolution/backfill-dry-run.json`
- `artifacts/harness-evolution/backfill-acceptance.json`
- `artifacts/harness-evolution/backfill-idempotency.json`

## 5. Harness 质量管家

已创建真实 Work：

- Work ID：`4fedd4f0-d617-47d8-a5a9-acf272484d00`
- 角色：`harness_quality_steward`
- 自主等级：Level 1 proposal-only
- 每日审计：`15 4 * * *`，时区 `Asia/Shanghai`
- 阈值复核：每 360 分钟

硬边界已经同时写入 Manifest、Role Gate、Tool Access 和 Skill：

- 不能修改权限、授权、审计、凭据或受保护验证器。
- 不能发送外部消息、执行交易、支付、删除或其他真实世界动作。
- 不能批准、物化、应用或发布自己的 Proposal。
- 不能以自身为 Harness 变更目标。
- 证据不足时只能记录观察，不能猜测性提案。

## 6. 页面验收

真实页面：`/workshop`

懒加载结果：

- 轻量首屏只请求 Work 列表、Summary 和 Dashboard。
- 点击“演化”后才请求 `/api/workshops/{id}/harness`。
- 首次打开“证据”“评测”“变更”时，才分别加载对应接口。
- 自选股猎手页面成功读取 5 条真实历史 Evidence Bundle。

布局结果：

- 桌面视口 `1440 x 900`：文档宽高均限制在视口内，无整页横向或纵向膨胀。
- Harness 主面板约 `848 x 653`，254 个组件只在面板内部滚动。
- 手机视口请求宽度 390px：主网格宽度 333px，Harness 面板宽度 316px，无横向溢出。
- 长工具名使用任意位置换行，不再顶破工作记录卡片。
- 页面控制台错误和警告：0。
- 中文加载、空状态和数据文本均正常，无乱码。

## 7. 自动化验证

- 全量测试：161 个测试文件通过，1051 个测试通过。
- Harness 模块覆盖率：73.99% statements，77.18% lines。
- 路径回归测试：3/3 通过，防止 Windows `APPDATA` 路径再次扩大 Next.js 构建追踪范围。
- TypeScript：通过。
- 生产构建：通过。
- Next.js 静态页面生成：143/143。
- 数据库迁移：通过。

构建仍会报告 `framer-motion` 找不到可选依赖 `@emotion/is-prop-valid` 的既有警告，但不影响编译完成和产物生成。

## 8. 回滚与人工接管

1. 将 `WORK_HARNESS_EVOLUTION_ENABLED=false` 可关闭新 API、运行捕获和页面入口。
2. 已生成的 Snapshot、Evidence 和 Proposal 保留为审计数据，不需要破坏性删除。
3. 候选运行失败时只终止 Candidate/Campaign，不修改当前生产 Snapshot。
4. 高风险组件、权限、授权、审计、真实世界动作和受保护验证器始终要求人工控制，不能进入自动 Canary。
5. 所有生产应用与发布能力仍保持关闭，因此本次升级不存在自动改变现有 Work 行为的路径。

## 9. 剩余边界

本次没有开启自动生产发布，也没有把 Level 2 Canary 设为默认。后续只有在 Level 1 长期积累足够完整证据、Proposal 命中率稳定、回滚演练通过后，才应单独验收低风险 Canary；任何异常都必须降回 Level 1。
