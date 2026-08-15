# 趋势跟随交易员底座技术方案

## 目标

把操盘交易员从“临场看涨跌 + prompt 判断”升级为一个可观测、可审计、可复盘的趋势跟随控制器。

本阶段目标不是接实盘，也不是证明策略赚钱，而是让模拟盘中的趋势交易决策具备五个底座：

1. 完整日 K 线结构评估。
2. 自选股/候选池内相对强弱排名。
3. 单票趋势生命周期状态估计。
4. 初始止损与移动止盈/退出建议。
5. 基于模拟盘成交的策略统计入口。

指导原则：

> 先观测，再建模；先闭环，再自动；先边界，再行动；先稳定，再智能。

## 被控对象

- 模拟盘账户：现金、冻结现金、持仓、委托、成交、已实现盈亏。
- 当前自选股池：操盘交易员只能消费自选股，不负责扩池。
- 趋势候选：从自选股和当前持仓中生成，不直接越权扫描全市场。
- 交易动作：仅 `quantPaperPlaceOrder` / `quantPaperCancelOrder`，不连接实盘。

## 观测输入

### 已有输入

- `quantPaperGetAccount`：账户、持仓、委托、成交。
- `quantPaperGetWatchlist`：当前自选股与报价快照。
- `aStockTrend`：日 K、MA、ATR、趋势评分、初始止损。
- `aStockSignals`：资金流、行业对比、概念、解禁风险。
- `aStockNewsAndFilings`：新闻和公告。
- `aStockMarketMood`：涨停情绪、热度、市场温度。

### 本次新增输入

- `aStockTrendSystem`：一次性返回股票池的趋势结构、RS 排名、状态估计、止损建议和统计摘要。
- `aStockTrendStateHistory`：读取已沉淀的趋势状态快照，用于判断状态改善、恶化、反复预警和策略回放。
- `aStockTrendStrategyStats`：读取趋势策略样本，把状态快照与当前模拟盘持仓/成交结果关联，按生命周期状态汇总表现。

## 状态模型

趋势状态不是自然语言结论，而是结构化状态估计。

单票状态：

- `watch_setup`：建仓观察。趋势未完全满足，但接近可交易结构。
- `breakout_confirmed`：突破确认。接近或突破 20/60 日高点，并有趋势分和量能支持。
- `trend_holding`：持有趋势。价格在 MA20/MA60 上方，趋势仍有效。
- `add_candidate`：加仓候选。趋势有效、回踩健康、风险收益仍可接受。
- `break_warning`：破位预警。跌破 MA20、趋势分下降或相对强弱恶化。
- `exit_required`：退出。跌破硬止损、结构破坏或数据无法支撑继续持有。
- `avoid`：回避。区间、下跌、过热或数据质量不足。
- `unknown`：无法判断。K 线不足或数据不可用。

状态估计输入：

- `phase`
- `trendScore`
- `close / ma20 / ma60`
- `ma20SlopePct`
- `distanceToMa20Pct`
- `distanceToHigh20Pct`
- `volumeRatio20`
- `atr14 / atrPct`
- `relativeStrength`
- `positionContext`
- `dataQuality`

## 控制动作

本阶段新增工具不直接下单，只输出动作建议：

- `buy_allowed`
- `hold`
- `add_watch`
- `reduce_watch`
- `sell_watch`
- `blocked`

真正下单仍必须经过 `quantPaperPlaceOrder`，并写入 `tradeThesis`。

## 安全边界

- `aStockTrendSystem` 是只读工具，只做状态估计和建议，不修改账户。
- 非自选股不进入操盘交易员主动交易池。
- 数据源降级时输出 `dataQuality.status=degraded|unavailable`，并降低置信度。
- 没有日 K 的标的不能给出买入建议。
- 没有止损价的标的不能给出买入建议。
- 统计样本不足时必须返回 `sampleSizeWarning`，不得伪装成有效结论。

## 模块接口设计

### Python 行情模块

文件：`apps/web/tools/a-stock-data/a_stock_data.py`

新增 action：

```json
{
  "action": "trend_system",
  "args": {
    "codes": ["159278.SZ", "300124.SZ"],
    "benchmark": "399300.SZ",
    "days": 120,
    "positions": [
      {
        "code": "159278.SZ",
        "quantity": 30500,
        "cost": 0.883,
        "highestPrice": 0.985
      }
    ],
    "fills": [
      {
        "code": "159278.SZ",
        "side": "sell",
        "realized_pnl": 1200,
        "strategy": "trend_following"
      }
    ]
  }
}
```

返回：

- `items[]`：每只票的趋势结构、生命周期状态、RS、止损计划、动作建议。
- `relativeStrengthRanking[]`：股票池内 RS 排名。
- `portfolioRisk[]`：持仓止损/减仓/退出建议。
- `strategyStats`：基于输入成交的胜率、平均盈亏、期望值、样本警告。
- `systemWarnings[]`：数据源降级、样本不足、K 线不足等。

### MCP 工具层

文件：`apps/web/lib/workshops/mcp-tools.ts`

新增工具：

- `aStockTrendSystem`

默认行为：

- 如果没有传 `codes`，从模拟盘账户持仓和自选股中自动合并。
- 自动读取模拟盘账户，把持仓和成交传入趋势系统。
- 工具事件写入 `source_checked`，可被交易假设引用。

## 反馈闭环

每次趋势交易要落下三类事件：

- 观测：`aStockTrendSystem` 输出源事件。
- 状态：每次 `aStockTrendSystem` 调用后，按标的写入 `quant_trend_state_snapshots`。
- 控制：`tradeThesis` 和模拟委托事件。
- 反馈：盘后复盘读取成交和状态变化，写入策略记忆。

### 趋势状态快照表

表：`quant_trend_state_snapshots`

用途：

- 保存每次趋势系统对每只票的状态估计。
- 支持智能体在下一次运行前读取历史，判断“新信号”还是“持续恶化/持续改善”。
- 支持后续统计不同生命周期状态后的收益、回撤和误判率。

关键字段：

- `workshop_id / run_id / loop_id / loop_run_id / source_event_id`：追溯该状态来自哪个车间、哪次运行、哪个源事件。
- `code / name / trade_date / benchmark_code`：标的和交易日上下文。
- `lifecycle_state / trend_phase / trend_score`：趋势生命周期状态。
- `rs_rank / rs_percentile / rs_score / relative_return_60d`：相对强弱状态。
- `trailing_stop / hard_stop / stop_action`：止损/移动止盈状态。
- `control_action / trade_allowed`：控制建议，不直接下单。
- `data_quality_status`：数据质量，显式暴露降级。
- `snapshot`：完整工具输出片段，保留可回放证据。

策略统计先从成交回放开始：

- `sampleSize`
- `winRate`
- `avgWin`
- `avgLoss`
- `payoffRatio`
- `expectancy`
- `realizedPnl`
- `bySymbol`

后续可扩展为多窗口收益评价，把状态快照与未来 1/3/5/10/20 日收益、实际成交和退出原因关联起来。

### 趋势策略样本表

表：`quant_trend_strategy_samples`

用途：

- 每条样本引用一条 `quant_trend_state_snapshots`，形成“状态估计 -> 后续结果”的闭环。
- 初次由 `aStockTrendSystem` 自动创建，避免只看到了状态却没有后续评价入口。
- 由 `aStockTrendStrategyStats` 根据模拟盘当前持仓和成交进行结算，输出样本统计。

关键字段：

- `snapshot_id`：关联原始状态估计。
- `observed_price / observed_at`：当时观察价格和时间。
- `evaluation_at / latest_price / return_pct / horizon_days`：后续评价结果。
- `holding_quantity / realized_pnl / outcome_status / exit_reason`：模拟盘反馈信号。
- `result`：保留评价证据，如成交 ID、账户更新时间、当前持仓数量。

第一版评价边界：

- 当前仍持仓：`outcome_status=open`，用当前模拟盘持仓价计算样本收益。
- 已卖出：`outcome_status=closed`，用后续卖出成交价/已实现盈亏评价。
- 没有持仓也没有卖出证据：`outcome_status=watch_only`，不强行计算收益。

## 降级策略

- 日 K 主源失败，使用腾讯日 K fallback。
- benchmark 获取失败，RS 只给池内动量排名，不给 benchmark-relative 判断。
- 成交样本少于 10，统计只作为观察，不作为硬规则。
- 某只票 K 线少于 60，不能用于严格趋势买入，只能观察。

## 测试计划

- 单元测试：
  - K 线结构识别突破、回踩、破位。
  - RS 排名能按 20/60/120 日表现排序。
  - 持仓止损能识别硬止损、移动止盈、继续持有。
  - 策略统计能计算胜率、平均盈亏和期望值。
- 类型检查：
  - `pnpm --filter web tsc`
- 工具烟测：
  - 调用 `trend_system` 的 CLI action，确认 JSON 可解析、中文不乱码。
- 数据库验证：
  - 迁移创建 `quant_trend_state_snapshots`。
  - 迁移创建 `quant_trend_strategy_samples`。
  - `aStockTrendSystem` 成功返回后快照写入数量大于 0。
  - `aStockTrendStateHistory` 能按车间和标的读取最近历史。
  - `aStockTrendStrategyStats` 能按生命周期状态汇总样本表现。

## 当前实施状态

- 已实现 `aStockTrendSystem`。
- 已实现 K 线结构、RS 排名、生命周期状态机、止损建议和基础策略统计。
- 已新增 `quant_trend_state_snapshots` 表及 Postgres/SQLite 迁移。
- 已新增 `quant_trend_strategy_samples` 表及 Postgres/SQLite 迁移。
- 已实现 `aStockTrendStateHistory` 历史读取工具。
- 已实现 `aStockTrendStrategyStats` 策略样本统计工具。
- 已将趋势历史和策略样本读取接入车间/Loop allowlist、中文显示名、工具注册表和趋势跟随 skill。
