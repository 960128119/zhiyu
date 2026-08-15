---
name: paper-trading-trend-following
description: Use when a workshop agent makes A-share or ETF paper-trading decisions with a trend-following and relative-strength method, including trend state classification, breakout or pullback entries, sell/reduce decisions, trade thesis creation, moving stops, and post-trade learning.
---

# Paper Trading Trend Following

This skill gives the paper-trading agent a repeatable trading mind. It is active, but not impulsive: observe the market, classify trend state, form a falsifiable thesis, act only inside boundaries, and feed the result back into memory.

Use this for trend-following buy, sell, reduce, add, holding, or no-action decisions in the A-share paper account.

The book-derived canon behind this skill is summarized in `references/trend-following-books.md`. Use it when refining the method, debugging a bad decision, or explaining why the strategy behaves this way. The core influences are Covel's trend-following philosophy, Clenow's systematic/risk-sized execution, Turtle-style mechanical rules, Weinstein stage analysis, O'Neil/Minervini leading-stock momentum, Schwager discipline, and Kaufman system design.

## Trading Mind

- Do not predict. Classify what the market is doing from observable signals, then act only when the state, risk, and boundary gates agree.
- Treat every trade as a control loop: observation -> state estimate -> action -> stop/verification -> feedback memory. In the simulator, prefer bounded action over endless observation so the loop produces learning samples.
- Prefer rules that survive noise: trend, relative strength, volatility, market regime, data quality, and account risk.
- Use news as context, not command. News can adjust confidence only after price, volume, trend, and risk confirm the trade.
- Protect capital before seeking return. A trade without an invalidation point is not a trade.

## Control Object

- Controlled object: the paper-trading account, current holdings, open orders, available cash, and current watchlist.
- The agent may trade only the simulated account.
- The agent may not place real broker orders.
- The agent may not maintain the watchlist. New symbols belong to the watchlist-selection workshop.

## Required Observation Order

Call tools in this order when available:

1. `quantPaperGetAccount`
   - Read cash, exposure, holdings, available quantity, open orders, recent fills, realized PnL, and frozen cash.

2. `quantPaperGetWatchlist`
   - Read the current watchlist and quote snapshot.
   - The trade candidate must be in this watchlist unless the task is only reviewing a current holding.

3. `quantTradePlanList`
   - Read active plans and due plans before classifying new action candidates.
   - Treat the ledger as hard prior state for planned price, invalidation, blocker, and next verification.

4. `workshopReadMemory` or `workshopSearchMemory`
   - Read active trading rules, prior mistakes, position triggers, distribution warnings, and data-source limitations.

5. `aStockMarketMood`
   - Classify broad market state: `risk_off`, `mixed`, `risk_on`, `overheated`, or `unknown`.

6. `aStockTrendStateHistory`
   - Use when evaluating deterioration, recovery, repeated stop warnings, or whether a signal is new versus persistent.
   - Compare prior `lifecycleState`, `relativeStrength`, `trendScore`, `trailingStop`, `controlAction`, and `dataQualityStatus` with the current run.

7. `aStockTrendSystem`
   - Required before portfolio-level buy, add, reduce, sell, or hold decisions.
   - Use it as the state estimator for K-line structure, relative-strength ranking, lifecycle state, stop engine, portfolio risk, and strategy statistics.
   - It persists one trend-state snapshot per observed symbol for future replay and statistics.
   - If no `codes` are provided, it should use the current watchlist plus holdings.

8. `aStockTrendStrategyStats`
   - Use before changing trading rules, promoting a lifecycle state to automatic buyability, or writing post-market learning.
   - Treat small samples as weak evidence. Do not overfit one or two wins/losses.
   - Compare outcomes by `lifecycleState`, not only by symbol.

9. `aStockTrend`
   - Use for single-symbol drilldown after `aStockTrendSystem` flags a concrete action candidate.
   - Use `phase`, `trendScore`, `ma20`, `ma60`, `ma20SlopePct`, `atr14`, `distanceToMa20Pct`, `structure`, `returns`, `initialStop`, and `recentKlines`.

10. `aStockSignals`
   - Use for fund flow, industry comparison, concept membership, and lockup risk.
   - If fund-flow data is degraded, treat it as lower confidence, not as proof.

11. `aStockNewsAndFilings`
   - Use for material news, announcements, and abnormal moves.
   - News is a reference signal. It cannot override a broken trend or absent risk plan.

12. `aStockQuote`
   - Refresh executable price immediately before calling `quantPaperPlaceOrder` when price may have changed.

## Trend State Model

Classify each candidate into exactly one state:

- `strong_uptrend`: price above MA20, MA20 above MA60, MA20 rising, not too extended.
- `early_breakout`: price is near or above the recent 20-day high with supportive volume and valid risk/reward.
- `constructive_pullback`: price remains above MA60 and is near MA20 after a prior uptrend.
- `extended`: price is more than 8% above MA20 or the stop distance makes risk/reward poor.
- `range`: no clear trend edge.
- `downtrend`: price below falling MA20/MA60 structure.
- `broken`: predefined stop, MA20/ATR stop, or thesis invalidation is triggered.

Use this book-derived interpretation:

- Weinstein-style stage thinking: buy only advancing or early-advancing structures; reduce or sell deteriorating and broken structures.
- Turtle-style discipline: breakout and stop rules must be mechanical enough to audit later.
- O'Neil/Minervini-style momentum: favor leaders with relative strength, not laggards that merely look cheap.
- Clenow/Kaufman-style systems thinking: treat every classification as uncertain when source freshness or data coverage is degraded.

## Buy Gate

Only buy when all gates pass:

- Market gate: market state is not `risk_off` or `unknown`. `mixed` permits smaller pilot or rotation trades when the symbol is a relative-strength leader and has a nearby invalidation.
- Boundary gate: symbol is in the current watchlist, and the action is paper-only.
- Trend gate: trendScore is normally at least 60, and state is `strong_uptrend`, `early_breakout`, or `constructive_pullback`.
- Entry gate: price is not more than 10% above MA20 unless it is a fresh breakout with volume confirmation and a nearby stop.
- Risk gate: initial stop is explicit, position risk is acceptable, and risk/reward is at least 1:1.5 for pilot trades or 1:2 for larger adds.
- Execution gate: buy order includes `plannedPrice`, normally `maxBuyDeviationPct=3`, and current executable price is within tolerance.
- Thesis gate: `quantPaperPlaceOrder` must include `tradeThesis`.
- Leadership gate: candidate shows better relative strength than broad market and most watchlist peers, or the thesis explains why this is an early confirmed reversal.
- State gate: `aStockTrendSystem.lifecycleState` is `breakout_confirmed`, `add_candidate`, or a clean `watch_setup` that became an intraday breakout with current quote confirmation.
- Feedback gate: if `aStockTrendStrategyStats` shows the same lifecycle state has poor or very small evidence, lower position size rather than defaulting to no trade when the current setup is clean.

Do not buy because a stock is merely rising today.
Do not buy because of a news headline without a valid trend state and stop.
Do not average down a losing position unless the original trend thesis is still valid and the new entry independently passes every buy gate.

Use 8%-15% initial capital for clean simulated entries and normally cap one symbol at 18%. Use 5%-8% when the market is mixed but the relative-strength edge is clear.

## Sell Or Reduce Gate

Consider sell or reduction when any of these occur:

- `broken` trend state or close below the MA20/ATR stop.
- trendScore falls below 60 and relative strength is weak.
- price rises strongly while main fund flow is materially negative, especially if repeated.
- material negative filing or news changes the thesis.
- holding is weak while a better watchlist candidate has a clearer trend and risk/reward; this should normally trigger a rotation decision.
- position exceeds intended risk because volatility expanded.
- a prior leader loses relative strength and fails to recover on the next verification point.

T+1 sellability and available quantity must be checked before any sell order.

Do not keep a broken trend because the narrative still sounds attractive.

## Trend Signal To Order Chain

`aStockTrendSystem` is a state estimator. It does not complete the trading loop by itself.

For every relevant holding, open order, or watchlist symbol flagged by `aStockTrendSystem`, create one `trendFollowDecision.candidateDecisions[]` entry:

- `code`
- `positionState`: `no_position|holding|open_order|holding_and_order`
- `profitState`: `positive|negative|flat|unknown`
- `availableQuantity`
- `lifecycleState`
- `trendScore`
- `controlAction`
- `decision`: `enter|add|hold|tighten_stop|reduce_partial|exit|blocked`
- `orderIntent`
- `orderId` or `blockedReason`
- `nextVerification`

If the decision is `enter`, `add`, `reduce_partial`, or `exit`, either call `quantPaperPlaceOrder` in the same run or write a machine-readable `blockedReason`. Acceptable blockers include `data_quality`, `price_deviation`, `trend_not_confirmed`, `t1_unavailable`, `cash`, `lot_size`, `limit_price`, `risk_reward`, `market_state`, and `break_warning_ambiguous`.

Do not finish with only watch/observe language. A no-order run is valid only when the no-order reason is auditable. Generic caution is not enough; name the exact data, price, risk, cash, T+1, or boundary blocker.

After acting or blocking action, update the ledger:

- call `quantTradePlanReview` for due plans that were executed, partially executed, blocked, skipped, or invalidated;
- call `quantTradePlanUpsert` for new or revised next-session plans;
- include the related `trendFollowDecision` entry in `sourceDecision`.

## Break Warning Handling

When `lifecycleState`, `controlAction`, or history contains `break_warning`, `reduce_watch`, `exit_required`, or `broken`, the candidate decision must include `breakWarningHandling`.

Use this table:

| Position state | Profit state | Warning state | Default action |
| --- | --- | --- | --- |
| holding | positive | first or mild `break_warning` above stop | `tighten_stop` or small `reduce_partial`; no add |
| holding | positive | persistent `break_warning` or close below trailing stop/invalidation | `reduce_partial` or `exit` if T+1 available |
| holding | negative | any confirmed `break_warning` | reduce or exit more aggressively if available |
| no_position | any | `break_warning` or `reduce_watch` | block entry until repair |
| any | any | `exit_required` or `broken` | exit/reduce if sellable; otherwise record T+1 blocker and next check |

Profitable `break_warning` is not a binary sell/hold signal. In this aggressive profile it is a profit-protection and rotation signal: tighten the stop, and use partial reduction earlier when the capital can rotate into a stronger watchlist candidate.

## Trade Thesis Contract

Every simulated order must include:

- strategy: `trend_following`
- trendState
- trendScore
- lifecycleState
- relativeStrength rank or percentile
- entryReason
- stopPrice
- trailingStop when holding or adding
- targetPrice or holding plan
- invalidation
- riskAmount when calculable
- evidenceSourceEventIds from same-run observations when available

The visible note must be readable Chinese and include: why now, what would prove wrong, where to stop, and why this is still inside account risk.

## Book-Derived Decision Checklist

Before any buy/add/reduce/sell action, answer these in Chinese:

1. 趋势处于什么阶段？证据来自哪些字段？
2. 它是不是当前自选股里相对更强的标的？
3. 当前市场环境允许主动承担风险吗？
4. 如果我错了，哪个价格、日期、数据或结构会证明我错？
5. 仓位风险、集中度、可用现金、T+1 和数据质量是否允许这个动作？
6. 当前生命周期状态是否允许动作，还是只能观察？
7. 下一次验证应该看什么？

If any answer is missing, either do not trade or reduce the action to a smaller, clearly bounded paper order.

## Required Event Prefixes

Before finishing, call `workshopLogEvent` with these exact title prefixes when applicable:

- `trendStateReview: ...`
- `tradeThesis: ...`
- `marketScanSummary: ...`
- `riskAssessment: ...`
- `actionTaken: ...`

## Memory Rules

Write memory only for reusable learning:

- a stopped-out trend trade and why it failed,
- a validated continuation pattern,
- a false breakout pattern,
- an improved stop or add rule,
- a data-source limitation that changed confidence,
- a rule violation or missed trigger.

Do not write routine daily price movement as memory.

When a trade closes or a stop/reduce rule fires, write a concise memory if it improves the future control loop: pattern, trigger, action, result, and revised rule.

## Final JSON Contract

The final `<structured-output>` JSON must include:

```json
{
  "trendStateReview": "trend states and scores for acted or blocked candidates",
  "tradeThesis": "submitted order thesis or why no valid thesis exists",
  "riskAssessment": "market state, position risk, stop, data quality, and boundary checks",
  "actionTaken": "simulated order details or no operation with exact blocking reason",
  "tradePlanLedger": "plan ids read, execution updates made, and next plans written",
  "trendFollowDecision": {
    "marketState": "risk_off|mixed|risk_on|overheated|unknown",
    "candidateDecisions": [
      {
        "code": "symbol code",
        "positionState": "no_position|holding|open_order|holding_and_order",
        "profitState": "positive|negative|flat|unknown",
        "availableQuantity": 0,
        "lifecycleState": "watch_setup|breakout_confirmed|trend_holding|add_candidate|break_warning|exit_required|avoid|unknown",
        "trendScore": 0,
        "controlAction": "buy_allowed|hold|add_watch|reduce_watch|sell_watch|blocked",
        "decision": "enter|add|hold|tighten_stop|reduce_partial|exit|blocked",
        "orderIntent": "buy/sell quantity and limit, or none",
        "orderId": "paper order id when submitted",
        "blockedReason": "required when no order is submitted for an actionable signal",
        "breakWarningHandling": "required for break_warning/reduce_watch/exit_required/broken",
        "nextVerification": "next trigger, time, or price condition"
      }
    ],
    "orders": [],
    "blockedReasons": [],
    "nextVerification": []
  }
}
```
