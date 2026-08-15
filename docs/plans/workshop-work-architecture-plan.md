# 智能体车间 Work 化技术方案

## 1. 控制目标

把“智能体车间”从一组可运行的智能体配置，升级为一组可配置、可版本化、可运行、可观测、可审计、可进化的 Work。

一个 Work 不是一次对话，也不是一个孤立 cron。它是长期控制器：

```text
Work = Manifest + Control Contract + Skill Bindings + Tool Policy + Loops + Memory Policy + Artifacts + Feedback + Change Proposals
```

目标不是让智能体更自由，而是让智能体的自由有结构、有边界、有反馈。

## 2. 被控对象

当前系统的被控对象分三层：

- Work 自身配置：名称、使命、角色、状态、边界、工具、Skill、Loop、Verifier、记忆策略。
- Work 管辖对象：例如操盘交易员管辖模拟盘账户和当前自选股内持仓；自选股猎手管辖自选股池提案；知识库管家管辖主人上下文候选记忆。
- Work 运行过程：事件、工具调用、提案、审核、记忆、产物、失败原因、下次唤醒。

第一阶段只控制“Work 自身配置的统一表示”，不直接改变交易、发信、视频发布等高风险动作。

## 3. 观测输入

Work 模型从现有数据派生，第一阶段不新增存储表：

- `workshops`：name、mission、status、autonomyLevel、boundaryPolicy、modelConfig。
- `loops`：持续任务、触发方式、actionPolicy、verificationConfig。
- `workshop_heartbeats`：心跳、下次唤醒、调度状态。
- 工具矩阵：工具来源、风险等级、可用性、审核面。
- `workshop_events`：最近事件、审核提案、执行结果。
- `workshop_memories`：规则、错误、source_note、watchlist rationale。
- `workshop_outbox`：待发送、阻断、已发送。

观测必须暴露数据新鲜度和缺口。Work 模型提供：

- `observability.missing`：结构性缺失，例如没有 role。
- `observability.warnings`：运行风险，例如 Loop 没有 Skill 映射、Verifier 字段缺失、工具 allowed/denied 冲突。

## 4. 状态模型

新增派生模型 `WorkshopWorkModel`，作为统一读取接口。

```ts
WorkshopWorkModel {
  manifest
  controlContract
  skillBindings
  loopBindings
  memoryPolicy
  artifactPolicy
  feedback
  observability
  changeControl
}
```

### 4.1 Manifest

描述这个 Work 是谁：

- `id`
- `name`
- `role`
- `mission`
- `status`
- `autonomyLevel`
- `version`
- `updatedAt`

`version` 第一阶段从 `modelConfig.workVersion` 或 `updatedAt` 派生，后续升级为独立版本表。

### 4.2 Control Contract

描述它控制什么、看什么、能做什么：

- `controlledObjects`
- `observations`
- `allowedActions`
- `approvalRequiredActions`
- `deniedActions`
- `boundaryMode`
- `externalMessagePolicy`
- `feedbackSignals`
- `conflicts`

控制规则：

- `denied` 永远优先于 `allowed`。
- 真实交易、真实付款、删除、外部发送、放宽边界、工具授权变更默认高风险。
- 观察类、内部整理类、只读检索类工具可以进入 allowed。

### 4.3 Skill Bindings

Skill 是方法论，不是权限。它告诉智能体“按什么思路工作”。

- `primarySkills`：Work 的主方法论。
- `loopSkillMap`：每个 Loop 运行前要加载的 Skill。
- `availableSkills`：当前项目可发现的 Skill。
- `missingSkills`：配置了但本地不存在的 Skill。

规则：

- 手动运行 Work 时，必须至少能看到 primary Skill。
- Loop 有映射 Skill 时，Loop 运行前必须加载对应 Skill。
- Skill 不能授予工具权限，只能改变判断框架和执行步骤。

### 4.4 Loop Bindings

Loop 是 Work 内部的持续任务，不是孤立自动任务：

- `id`
- `name`
- `status`
- `triggerType`
- `nextScheduledRunAt`
- `requiredFields`
- `skillName`
- `skillStatus`
- `hasActionPolicy`
- `hasVerification`

后续要把 Loop 最近运行、失败原因、字段验证结果纳入 Work 面板。

### 4.5 Memory Policy

记忆是状态估计器，不是聊天记录堆积：

- 可读记忆类型：finding、watchlist、boundary、source_note、mistake。
- 高影响结论必须有证据来源。
- 可复用经验写入记忆，但不能绕过边界自我放权。

### 4.6 Artifact Policy

产物是 Work 的输出层：

- 事件：source_checked、decision、memory_written、watchlist_proposal、workshop_agent_change_proposed。
- 提案：watchlist_change_proposal、workshop_agent_change_proposal、video_review。
- 外发：通过 outbox 或审核面，不直接发送。

## 5. 读取接口

新增文件：

```text
apps/web/lib/workshops/work-model.ts
```

核心函数：

```ts
buildWorkshopWorkModel(input): WorkshopWorkModel
```

新增接口：

```text
GET /api/workshops/:id/work
```

调用者不需要知道 `modelConfig`、`boundaryPolicy`、tool matrix、Loop summary 的细节，统一读取 Work 模型即可。

该接口服务于：

- 车间详情页展示 Work 结构。
- 对话智能体修改 Work 前读取现状。
- Work Change Proposal 生成 diff。
- Loop 执行器检查 Skill、工具、边界完整性。

## 6. 控制动作和工具矩阵

Work 化后的控制动作分层：

- 低风险：修改展示名、描述、普通记忆策略、文档说明。
- 中风险：修改 Skill 绑定、Loop verifier、Loop cadence、工具偏好、边界策略。
- 高风险：新增外部写入工具、解除 denied、切换 auto、真实交易、真实付款、发布、删除、配置迁移。

已有 `workshop_agent_change_proposed` 事件机制继续作为变更审核通道。当前 patch 支持：

- `name`
- `mission`
- `status`
- `autonomyLevel`
- `boundaryPolicy`
- `modelConfig`

后续扩展：

- `loop verificationConfig`
- `loop actionPolicy`
- `loop triggerConfig`
- 独立 `work_versions`
- 独立 `work_change_proposals`

## 7. 边界和审核

边界原则：

- Work 可以自我学习，但不能自我放权。
- Work 可以提出变更，但不能绕过主人审核应用高风险变更。
- `denied` 永远优先于 `allowed`。
- 外部世界动作只能通过 outbox、proposal、review surface。
- Skill 是方法论，不是权限。

审核面：

- 工具授权和边界变更：审核页。
- 自选股变更：审核页。
- 外部消息：发信页。
- Loop 激活：任务页。
- 视频发布：审核页。

## 8. 异常、扰动和降级

必须显式暴露：

- Skill 配置了但运行时不存在。
- Loop 存在但没有 Skill 映射。
- allowed 和 denied 冲突。
- Loop 没有 verifier requiredFields。
- 工具矩阵里高风险工具被允许但没有审核面。
- 心跳或 Loop 只显示“已启动”但没有最近运行。
- 数据源返回 fallback、stale 或 provider warning。

第一阶段由 `observability.warnings` 和 `observability.missing` 表示，页面展示这些问题。

## 9. 页面可观测性

车间详情页新增 Work 视图：

- 概览：Work Manifest、状态、下一次工作、可用动作、需审核动作。
- 控制契约：被控对象、观测输入、禁止动作。
- Skill：primarySkills、missingSkills。
- Loop：任务、Skill 映射、Verifier 字段。
- 变更边界：高风险、中风险、低风险变更说明。

后续页面增强：

- 展示 Work Change Proposal 列表。基础版已完成：Work 面板展示最近配置变更、提案状态、基于版本、应用后版本和过期提示。
- 展示 Work 版本历史。
- 展示 Loop 最近运行、失败原因、验证字段缺失。
- 支持从 Work 面板直接跳到对应审核项。

## 10. 对话智能体修改 Work

对话智能体修改智能体时不直接写库，必须走两步：

1. 调用 `inspectWorkshopAgent` 读取目标 Work。
2. 调用 `proposeWorkshopAgentChange` 创建变更提案。

`inspectWorkshopAgent` 返回：

- 目标车间基本配置。
- 完整 Work 模型。
- 全部可选车间列表。
- 修改说明。

`proposeWorkshopAgentChange` 只创建事件，不直接应用。主人在车间审核里确认后，才调用服务端应用 patch。

这样对话智能体可以帮你“改操盘交易员”，但不会绕过审核私自扩大权限。

## 11. 测试和验收

当前验收：

- 能从现有 Workshop 派生 Work 模型。
- 能识别 Skill 映射、缺失 Skill、未映射 Loop。
- 能识别 allowed/denied 冲突。
- API 返回结构稳定。
- 页面能展示 Work。
- 对话智能体能读取 Work 后生成变更提案。
- 变更提案中文可读，不出现乱码。
- TypeScript 检查通过。

后续验收：

- 应用提案后 Work version 增加。
- Loop 运行前能校验 Skill 和边界。
- 高风险变更不能自动应用。
- 低风险配置可记录 before/after 并支持回滚。

## 12. 分阶段落地

### Phase 1：Work 只读模型

- 新增 `work-model.ts`。
- 新增 `/api/workshops/:id/work`。
- 新增单元测试。
- 写入本技术方案和领域术语。

状态：已完成。

### Phase 2：Work 页面可视化

- 车间详情页新增 Work tab。
- 展示 Manifest、Control Contract、Skill、Loop、工具冲突、缺失项。

状态：已完成基础版。

### Phase 3：Work Change Proposal 标准化

- 对话智能体修改车间时先读 Work。
- 生成结构化 patch。
- 高风险变更进入审核。

状态：已完成基础版，当前支持 workshop 级配置 patch。

### Phase 4：Work 版本化

- 增加版本快照。
- 每次应用提案记录 before/after。
- 支持回滚低风险配置。

状态：已完成轻量版。当前应用提案时会写入 `modelConfig.workVersion`，并在应用事件中记录 `workVersionBefore`、`workVersionAfter`、`before`、`after`。应用前会检查提案创建时的 Work 版本，避免旧提案覆盖新配置。完整 `work_versions` 表和回滚能力待开发。

### Phase 5：Work 文件化

- 可选把稳定配置导出为 `work.yaml`。
- 支持导入、复制、模板化 Work。

状态：待开发。

## 13. 下一步开发

建议下一步做 Phase 4 的页面和冲突检测：

- Work 面板已增加“最近配置变更”区域。
- 对话智能体提案时已经记录 `workModelVersion`，页面已展示版本来源。
- 应用提案前已经检查当前版本是否仍等于提案版本，下一步在冲突时展示更友好的恢复入口。
- 审核页已在过期提案上禁用“应用修改”，展示基于版本和当前版本，并提供“重新生成提案”入口。重建会把旧提案标记为 `workshop_agent_change_superseded`，再基于当前 Work 版本生成一份新的待审核提案。
- 服务端对过期提案返回 `409` 和 `WORK_VERSION_STALE`，便于后续前端和对话智能体识别冲突类型。
- 后续再建设独立 `work_versions` 表和低风险回滚。

这一步符合工程控制论：先让配置变更形成可观测、可追溯、可回放的闭环，再考虑让智能体更大范围地自主改造自己。
