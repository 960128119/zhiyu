---
name: paper-trading-intraday-check
description: Use when a workshop agent is running an A-share paper-trading intraday check, especially low-frequency market-hours inspection of account risk, holdings, current watchlist, trigger conditions, simulated order eligibility, no-trade reasons, and paper-trading action boundaries.
---

# Paper Trading Intraday Check

This skill turns intraday work into trigger verification, not market chasing. The agent should react only to previously defined or objectively validated conditions.

Use this for the `盘中模拟盘巡检` loop or any similar A-share market-hours paper-trading inspection.

## Core Philosophy

- Intraday noise is the default, but this workshop is a simulated learning trader: controlled action is preferred over passive observation when gates are adequate.
- The first job is to protect the paper account from uncontrolled behavior.
- The second job is to verify whether pre-defined triggers fired.
- The third job is to record useful observations for later review.
- Do not become a watchlist hunter; only inspect current watchlist and current positions.
- Do not trade because the market is exciting, because a symbol is moving, or because the loop ran.

## Required Observation Order

Call tools in this order when available:

1. `quantPaperGetAccount`
   - Read total asset, cash, positions, available quantity, open orders, fills, and realized PnL.
   - If open orders exist, inspect whether they are still valid before considering new orders.

2. `quantPaperGetWatchlist`
   - Read current watchlist with fresh quotes.
   - Never add, remove, replace, or propose watchlist changes in this skill.

3. `quantTradePlanList`
   - Read active plans before deciding whether a trigger fired.
   - Treat due plans as hard prior state. A due plan must become executed, blocked, skipped, or still pending with an explicit reason.

4. `workshopReadMemory` or `workshopSearchMemory`
   - Read active position rules, stop lines, prior mistakes, pre-market triggers, and source-quality warnings.
   - For a high-impact action, verify memory evidence if the memory is old or disputed.

5. `aStockQuote`
   - Refresh held positions and trigger candidates if the watchlist snapshot is stale or incomplete.

6. `aStockTrend`
   - Required for any held position or watchlist symbol near buy, add, reduce, sell, or hold thresholds.
   - Use phase, trendScore, MA20/MA60 structure, ATR stop, extension, and invalidation before deciding.

7. `aStockSignals`
   - Use for held positions and symbols whose trigger is near.
   - Interpret fund-flow failures, fallback data, or provider conflict as a reason to reduce confidence.

8. `aStockMarketMood`
   - Check market breadth, hot themes, limit-up/limit-down pressure, and whether the market is becoming overheated.

9. `aStockNewsAndFilings`
   - Use only for abnormal moves, held positions near action thresholds, or potential trade decisions.
   - News adjusts confidence; it does not trigger trades alone.

## Numeric Rule Discipline

Before concluding that any price, stop, invalidation, breakout, cash, position-size, profit-protection, or risk/reward rule has triggered or failed, batch the comparisons and call `quantRuleEvaluate`.

- One run may need many comparisons. Put all current trigger, stop, buy-deviation, cash, quantity, and rotation checks into one `quantRuleEvaluate.rules[]` call when possible.
- Do not let the model compare numbers in prose. For example, `77.66 < 77.61` is false and must be represented by tool output, not by reasoning text.
- Every `trendFollowDecision.candidateDecisions[]` entry with `buy`, `sell`, `reduce`, `exit`, `tighten_stop`, `blocked`, `invalidated`, or `triggered` must include `ruleEvidence` with `tool: "quantRuleEvaluate"`, `ruleId`, `actual`, `operator`, threshold or range, `triggered`, and `comparisonText`.
- If rule evidence is missing, the only allowed conclusion is `blocked_pending_rule_check`; do not place, cancel, or mark a plan complete.

## Intraday Decision Gates

Every action must pass all gates. If any gate fails, default to no operation.

### 1. Data Gate

Block action if:

- account or position data is missing,
- price data is stale,
- fund-flow source is degraded and the decision depends on it,
- current price conflicts with another same-run source,
- ETF or stock-specific fields are structurally unavailable and the rule needs them.

### 2. Boundary Gate

Block action if:

- the symbol is outside the current watchlist,
- the action is a real broker order,
- the action maintains the watchlist instead of trading the paper account,
- the action would exceed current workshop boundary policy,
- the order cannot be expressed as an auditable simulated limit order.

### 3. Market Gate

Classify intraday market state:

- `risk_off`: broad weakness, limit-down pressure, hot themes collapsing, or high uncertainty.
- `mixed`: rotation or conflicting signals.
- `risk_on`: breadth and leading themes aligned.
- `overheated`: broad surge with chasing risk, high break-board risk, or extended watchlist moves.

Do not buy in `risk_off` or `unknown`. In `mixed`, allow smaller rotation or pilot buys when relative strength and stop distance are clean. In `overheated`, prefer rotation from weak holdings into stronger names only if the entry is still near plan.

### 4. Position Gate

For existing positions:

- Stop-loss checks come before opportunity checks.
- Available quantity matters under T+1.
- If stop, invalidation, or risk-reduction conditions are met, reduce or exit promptly when T+1 availability permits.
- If the position is profitable but extended, protect gains with a tighter stop or partial reduction; do not let "观察" replace a concrete protection action.

For new or add-on buys:

- Prefer a pre-market, ledger, or memory-defined trigger. A same-run fresh trigger is allowed if it is backed by `aStockTrendSystem`, current quote, clear invalidation, and a written `quantTradePlanUpsert` replacement plan.
- Require a valid trend state: `strong_uptrend`, `early_breakout`, or `constructive_pullback`.
- Require trendScore normally at least 60 and no `downtrend` or `broken` state. `extended` blocks chasing, but does not block a tightly risk-managed breakout pilot when risk/reward remains valid.
- Require relative strength versus sector and market.
- Require a nearby invalidation point.
- Require at least 1:1.5 risk/reward for pilot trades and 1:2 for larger adds.
- Treat `plannedPrice` as the execution anchor. A buy can execute only when the current executable limit price is no more than 3% above `plannedPrice`, unless this same run creates a fresh plan and recalculates the risk/reward.
- Prefer 8%-15% initial capital for clean signals, 5%-8% when market or data state is `mixed`, and normally cap one symbol at 18%.

### 5. Relative-Strength Gate

Use relative strength as a filter:

- Market strong + sector strong + symbol weak = weakness divergence; do not add, and consider reducing it to fund a stronger watchlist candidate.
- Market weak + symbol strong + fund flow supportive = constructive, but still wait for a controlled entry.
- Symbol up sharply + fund flow negative = possible distribution; do not add and consider verification day.
- ETF strong after sharp prior decline = possible rebound. It can justify a small pilot only with a nearby invalidation line.

### 6. News Gate

Classify news reference:

- `material_positive`
- `material_negative`
- `neutral`
- `stale`
- `unverified`
- `not_checked`

If news is unverified or stale, do not let it change the action from no operation to buy/sell.

## Simulated Order Rules

Only call `quantPaperPlaceOrder` when all of the following are true:

- action side, code, quantity, limit price, stop/invalidation, and reason are explicit,
- the symbol is in the current watchlist,
- the same run has read current account and quote data,
- the order is consistent with prior plan or a hard risk rule,
- every buy order includes `plannedPrice` and normally `maxBuyDeviationPct=3`,
- every trend-following order includes `tradeThesis` with trendState, trendScore, stopPrice, invalidation, and same-run evidence when available,
- the buy limit price is within `plannedPrice * 1.03`; if it is above that range, wait for pullback or replace the plan with a fresh risk/reward calculation before buying,
- the action is not chasing a fast move without a newly calculated stop and target,
- a no-action alternative was considered and rejected with evidence.

If the agent writes "准备买入", "计划减仓", "下次验证", or similar language without placing an order, it must log the exact blocking reason and the next verification condition.

For this aggressive profile, "继续观察" is allowed only when there is a concrete blocker. If at least one held symbol is weak and one watchlist symbol is stronger, the default decision should be rotation, not observation.

After checking orders, fills, or trigger outcomes, call `quantTradePlanReview` for every due plan whose status changed or whose blocker is now known. If this run replaces the plan with a new trigger or price, call `quantTradePlanUpsert` and link the decision in `sourceDecision`.

## Trend Decision Contract

When `aStockTrendSystem` or `aStockTrend` is used, the intraday result must include `trendFollowDecision`.

For each holding, open order, triggered symbol, and no-trade candidate, write one `candidateDecisions[]` entry with:

- `code`
- `positionState`
- `profitState`
- `availableQuantity`
- `lifecycleState`
- `trendScore`
- `controlAction`
- `decision`
- `orderIntent`
- `orderId` or `blockedReason`
- `ruleEvidence`
- `nextVerification`

For `break_warning`, `reduce_watch`, `exit_required`, or `broken`, include `breakWarningHandling`. If the position is profitable, the default is profit protection, not vague observation: tighten the trailing stop, block adding, and reduce or exit only when the warning is confirmed, persistent, below stop/invalidation, or market state deteriorates.

## Required Visible Output

Before finishing, call `workshopLogEvent` with these exact title prefixes:

- `marketScanSummary: ...`
- `trendStateReview: ...`
- `riskAssessment: ...`
- `tradeThesis: ...`
- `actionTaken: ...`

Write memory only when the run creates reusable knowledge:

- trigger fired or failed,
- weak divergence repeated,
- distribution signal,
- data-source limitation,
- a mistake in earlier plan,
- a rule update that should affect future runs.

Do not create outbox drafts for routine intraday observations.

## Final JSON Contract

The final `<structured-output>` JSON must include:

```json
{
  "marketScanSummary": "fresh account, holdings, watchlist, market and news reference",
  "riskAssessment": "data quality, market state, position risk, trigger status, and boundary checks",
  "actionTaken": "simulated order details or no operation with the exact blocking reason",
  "tradePlanLedger": "plans read, executed/blocked/skipped updates, and any replacement plans written",
  "trendFollowDecision": {
    "marketState": "risk_off|mixed|risk_on|overheated|unknown",
    "candidateDecisions": [],
    "orders": [],
    "blockedReasons": [],
    "nextVerification": []
  },
  "intradayDecision": {
    "marketState": "risk_off|mixed|risk_on|overheated|unknown",
    "triggeredSymbols": [],
    "blockedReasons": [],
    "nextVerification": []
  }
}
```

## Reference Basis

For deeper rationale, read `references/methodology.md`. Use it only when revising rules or explaining why this skill is conservative.
