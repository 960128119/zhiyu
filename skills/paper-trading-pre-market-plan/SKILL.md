---
name: paper-trading-pre-market-plan
description: Use when a workshop agent is preparing an A-share paper-trading pre-market plan, especially before market open, before a simulated trading day, or when it must define observation priorities, no-trade conditions, risk boundaries, and if-then triggers for the paper account.
---

# Paper Trading Pre-Market Plan

This skill turns the pre-market run into a control-plan pass, not a prediction pass. The agent should define what it will observe, what would invalidate action, and what must remain untouched.

Use this for the `开盘前观察计划` loop or any similar A-share paper-trading pre-open planning task.

## Core Philosophy

- Treat the paper account as a controlled experiment.
- Do not predict the day. Prepare conditional responses.
- Prefer no operation unless current account state, market regime, watchlist evidence, risk/reward, and boundary policy all agree.
- Never let news, one quote, or a single fund-flow number become an action by itself.
- Use yesterday's review and active workshop memory as the state estimate; verify high-impact memories with current data before relying on them.
- Respect A-share constraints: T+1, price-limit regimes, lunch break, closing auction, lot-size constraints, and delayed correction after opening mistakes.

## Required Observation Order

Call tools in this order when available and within budget:

1. `quantPaperGetAccount`
   - Read cash, total asset, realized PnL, positions, available quantity, open orders, fills, and trading enabled state.
   - Stop if account data is missing, stale, or internally inconsistent.

2. `quantPaperGetWatchlist`
   - Read current watchlist and quote snapshot.
   - Stay inside current watchlist. This skill does not discover or propose watchlist changes.

3. `quantTradePlanList`
   - Read active and recent trade plans before creating new triggers.
   - Review whether prior plans are still valid, superseded, blocked, or due today.

4. `workshopReadMemory` or `workshopSearchMemory`
   - Read active trading rules, yesterday's plan, known mistakes, position-specific triggers, and source limitations.
   - For high-impact memories, use `workshopGetMemoryEvidence` if uncertainty could change an action.

5. `aStockMarketMood`
   - Classify the market into one of: `red`, `yellow`, `green`, or `unknown`.
   - Use breadth, limit-up/limit-down, hot themes, and large-style direction.

6. `aStockQuote`
   - Refresh holdings first, then watchlist focus names.
   - Current price data beats old workshop events.

7. `aStockTrend`
   - Required for held positions, open-order candidates, and focus names that may become action candidates.
   - Use phase, trendScore, MA20/MA60 structure, ATR stop, extension, and invalidation as the primary method layer.

8. `aStockSignals`
   - Use for holdings and high-priority watchlist names.
   - Treat fund-flow degradation or source conflicts as a risk flag, not as proof.

9. `aStockNewsAndFilings`
   - Use for held positions, open-order candidates, abnormal moves, or major planned decisions.
   - News is supporting evidence only.

## Numeric Rule Discipline

Before concluding that any price, stop, invalidation, breakout, cash, position-size, profit-protection, or risk/reward rule has triggered or failed, batch the comparisons and call `quantRuleEvaluate`.

- One model response may contain many numeric checks. Put them in one `quantRuleEvaluate.rules[]` call when possible instead of doing mental arithmetic.
- Use stable rule ids such as `000977_buy_invalid_line`, `159278_profit_stop`, or `cash_position_cap`.
- Every actionable trigger in `preMarketPlan.ifThenTriggers[]` must carry `ruleEvidence` with `tool: "quantRuleEvaluate"`, `ruleId`, `actual`, `operator`, threshold or range, `triggered`, and `comparisonText`.
- If `quantRuleEvaluate` evidence is missing, write the plan as `pending_tool_check` and do not claim that a trigger, stop, or invalidation fired.

## Market State Model

Assign exactly one state:

`red`
- Broad market is in retreat, limit-down risk is elevated, hot themes are collapsing, data sources are unreliable, or account risk is already above boundary.
- Output: no new buy. Only plan defensive checks.

`yellow`
- Market is mixed, rotating, overextended, data is partially degraded, or signals conflict.
- Output: observe. New buys require unusually clean evidence and small size.

`green`
- Breadth, leading themes, liquidity, and watchlist behavior are aligned.
- Output: allow conditional triggers, but still require risk/reward and position rules.

`unknown`
- Data freshness or source quality is insufficient.
- Output: no operation; log the data gap.

## Watchlist Classification

Classify each relevant symbol:

- `leader`: stronger than market and sector, liquidity acceptable, not extended far beyond a valid base or plan.
- `constructive`: improving but still waiting for confirmation.
- `laggard`: underperforms its sector/market or has weak relative strength.
- `risk`: has source conflict, negative event, stop-risk, liquidity issue, or gap risk.
- `ignore_today`: not relevant to today's control objective.

Do not create a watchlist change proposal. That belongs to the watchlist-selection workshop.

## Pre-Market Action Rules

Default action is `no operation`.

Allow a planned simulated buy only if all gates pass:

- Account gate: cash, available quantity, open orders, and trading enabled state are known.
- Market gate: market state is not `red` or `unknown`.
- Symbol gate: target is in current watchlist.
- Evidence gate: price/volume, relative strength, fund flow, and news context do not conflict materially.
- Trend gate: trendScore is normally at least 65, trend state is `strong_uptrend`, `early_breakout`, or `constructive_pullback`, and the stop/invalidation line is explicit.
- Risk gate: planned stop is explicit and risk/reward is at least 1:2.
- Position gate: position size will not concentrate the account or violate existing workshop memory.
- Execution gate: every planned buy must name a `plannedPrice` and an execution tolerance. Default tolerance is `plannedPrice + 2%`; use a limit order and explain why it is not chasing the open.

Block action when:

- Data is stale, missing, or contradictory.
- The plan depends on news that is unverified, promotional, old, or not material.
- The symbol is outside the watchlist.
- The action was invented in this run without prior setup.
- Opening price has moved enough that the original risk/reward is gone.
- Current executable buy price is more than 2% above the planned entry price and no fresh risk/reward plan has replaced it.
- Trend state is `range`, `downtrend`, `broken`, or `extended` without a fresh breakout thesis.
- The model is trying to "make something happen" because a loop ran.

## Required Visible Output

Before finishing, call `workshopLogEvent` with these exact title prefixes:

- `marketScanSummary: ...`
- `trendStateReview: ...`
- `riskAssessment: ...`
- `actionTaken: ...`

Use `workshopWriteMemory` only for reusable state:

- a concrete trigger plan that future runs must check,
- a source-quality limitation,
- a trading-rule correction,
- a mistake or boundary lesson,
- a position-specific invalidation rule.

Do not write routine summaries as memory unless they contain a reusable rule or a next-run trigger.

If the run creates, revises, or carries forward a concrete plan, call `quantTradePlanUpsert` before finishing. Each plan must include `planDate`, `code`, `action`, `triggerCondition`, `invalidation`, `rationale`, and `dueAt` when known.

## Final JSON Contract

The final `<structured-output>` JSON must include:

```json
{
  "marketScanSummary": "market, account, holdings, watchlist and evidence summary",
  "riskAssessment": "risk state, data quality, invalidation conditions, and why action is or is not allowed",
  "actionTaken": "simulated order submitted, no operation, or blocked with reason",
  "tradePlanLedger": "prior plans reviewed and new plans written with quantTradePlanUpsert",
  "preMarketPlan": {
    "marketState": "red|yellow|green|unknown",
    "focusSymbols": [],
    "noTradeConditions": [],
    "ifThenTriggers": []
  }
}
```

## Reference Basis

For deeper rationale, read `references/methodology.md`. Use it only when the task needs method explanation or rule revision.
