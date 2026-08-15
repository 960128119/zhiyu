# Work Runtime 收紧方案

## 判断

项目还未上线，允许删除式重排。当前不应继续把能力摊在页面、API、Loop、工具、记忆各处，而应把“智能体车间”升级为唯一长期控制对象 `Work`。

删除式重排不是先删文件，而是先删除旧认知入口：

- 页面不直接理解 Loop、工具、记忆、发信、量化细节。
- 对话智能体不直接改 Loop 表、自选股表、记忆表。
- Loop 不绕过 Work 归属运行。
- 工具不绕过权限与审核执行。

## 新主干

```text
Observation -> State -> Work Runtime -> Action -> Feedback
```

对应代码模块：

- `apps/web/lib/work-runtime`：Work 的统一命令与查询接口。
- `apps/web/lib/workshops`：降级为 Work Runtime 的内部实现模块。
- `apps/web/lib/loops`：降级为 Loop 执行引擎，不再作为产品入口。
- `apps/web/lib/agent-tools`：降级为工具矩阵与权限适配器。
- `apps/web/lib/memory` / `owner-context`：降级为状态估计器。

## 新接口

查询只走快照：

- `listWorks`
- `getWorkSnapshot`
- `getWorkModelSnapshot`

写入只走命令：

- `createWork`
- `updateWork`
- `deleteWork`
- `startWorkRun`
- `createWorkLoop`
- `updateWorkLoopActivation`
- `runWorkLoop`
- `restoreWorkVersion`

每个命令必须携带或生成：

- `commandId`
- `source`
- `reason`

## 迁移规则

1. 旧 HTTP 路径暂时保留返回形状，但内部必须调用 Work Runtime。
2. 新功能禁止直接调用 `workshops/service.ts` 和 `loops/service.ts`，除非是在 Runtime 内部。
3. 页面只能读 projection/snapshot，不能拼装运行状态。
4. 智能体修改车间必须发 Work Command，不允许直接更新底层表。
5. 后续删除优先级：重复 API、页面内业务拼装、跨模块直接写 DB。

## 控制论约束

- 被控对象：Work、Loop、工具动作、记忆状态、外部发布/交易动作。
- 观测输入：事件、消息、行情、新闻、运行结果、审核结果。
- 状态存储：原始事实、理解结果、控制命令、执行结果分层保存。
- 控制动作：统一从 Work Runtime 发出，必须可审计。
- 安全边界：`denied` 优先于 `allowed`，外部动作默认审核。
- 反馈信号：运行结果、验证字段、失败原因、用户审核、后续表现。
- 降级策略：数据源失败必须显式写 provider/detail/warning。
