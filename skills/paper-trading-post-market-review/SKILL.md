---
name: paper-trading-post-market-review
description: Use when a workshop agent is reviewing an A-share paper-trading day after market close, especially to reconcile account results, holdings, orders, plan-versus-actual behavior, mistakes, missed triggers, data-source quality, reusable trading rules, and next-day preparation.
---

# Paper Trading Post-Market Review

This skill turns the post-market run into feedback and learning. The agent should evaluate process quality, not merely explain the day's PnL.

Use this for the `收盘后模拟复盘` loop or any similar A-share paper-trading after-close review.

## Core Philosophy

- Separate outcome from process.
- A profitable day can still contain a bad decision.
- A losing day can still contain correct risk control.
- Convert repeatable lessons into workshop memory.
- Weaken or correct memories when new evidence contradicts them.
- Do not rewrite history to fit the close.

## Required Observation Order

Call tools in this order when available:

0. Current execution time context or `time`
   - Use the authoritative local date and weekday for report titles.
   - Do not infer weekdays from memory. For example, `2026-08-05` must be rendered as `2026-08-05（周三）`.

1. `quantPaperGetAccount`
   - Read final account, cash, positions, open orders, fills, realized PnL, unrealized PnL, and total asset.
   - Reconcile whether any order executed, failed, or remained open.

2. `quantPaperGetWatchlist`
   - Read close-state watchlist quotes.
   - Compare held positions with watchlist leaders and laggards.

3. `quantTradePlanList`
   - Read today's active and historical plans before judging process quality.
   - Reconcile each due plan as executed, partially executed, blocked, skipped, superseded, or still pending with reason.

4. `workshopReadMemory` or `workshopSearchMemory`
   - Read today's pre-market plan, intraday memories, active rules, prior mistakes, and position-specific triggers.
   - If a memory drove an action or rule update, verify evidence when possible.

5. `workshopReadLinkedWorkshopEvents`
   - Read today's same-workshop events when available, especially pre-market and intraday loop events.
   - Reconcile plan versus actual behavior.

6. `aStockTrend`
   - Use for held positions, executed orders, and symbols that triggered action/no-action decisions.
   - Review whether the entry, hold, reduce, or sell decision matched trend state, trendScore, MA/ATR stop, and extension.

7. `aStockSignals`
   - Use for held positions and key watchlist symbols.
   - Record source limitations and conflicts explicitly.

8. `aStockMarketMood`
   - Summarize market breadth, theme leadership, and whether conditions validated or invalidated the day's plan.

9. `aStockNewsAndFilings`
   - Use for held positions, executed orders, abnormal moves, and material next-day risks.
   - News is a review input, not a retroactive justification.

## Review Framework

### 1. Account Reconciliation

Report:

- total asset,
- cash,
- market value,
- realized PnL,
- unrealized PnL,
- position count,
- open orders,
- filled orders,
- day change,
- exposure by symbol and theme.

If numbers conflict across sources, stop and log the conflict before drawing conclusions.

### 2. Plan Versus Actual

For each plan or trigger from the pre-market/intraday events:

- Was it observed?
- Did it fire?
- Did the agent act?
- If it acted, was the action inside the rule?
- If it did not act, was the no-action reason valid?
- Did data quality block a decision?

Do not judge decisions solely by closing PnL.

### 3. Signal Evaluation

Classify each held position:

- `validated`: price, relative strength, fund flow, and news supported the plan.
- `trend_validated`: trend state and score still support the holding thesis.
- `trend_warning`: price remains tradable but stop distance, extension, or MA structure is deteriorating.
- `warning`: one major signal diverged.
- `invalidated`: predefined stop, thesis, or risk rule failed.
- `uncertain`: source conflict or insufficient data prevents judgment.

Classify watchlist context:

- leaders,
- constructive pullbacks,
- laggards,
- overheated names,
- names to ignore tomorrow.

This skill does not maintain the watchlist. If a watchlist action is needed, record a memory for the watchlist-selection workshop rather than calling watchlist proposal tools.

### 4. Mistake Taxonomy

Use this taxonomy:

- `chasing`: acted after risk/reward was gone.
- `premature_exit`: exited before invalidation without evidence.
- `ignored_stop`: failed to obey a hard risk rule.
- `data_quality`: acted on stale, degraded, or contradictory data.
- `news_overweight`: let news dominate price/position evidence.
- `overfitting`: made a new rule from one weak example.
- `missed_trigger`: valid trigger fired but no action occurred.
- `trend_misread`: trend state, extension, or MA/ATR stop was misread.
- `good_no_action`: did nothing despite market emotion.
- `good_risk_control`: controlled downside even if PnL later improved.

### 5. Memory Update Rules

Use `workshopWriteMemory` for:

- a repeated pattern with evidence,
- a specific rule that should constrain future actions,
- a source-quality warning,
- an active position trigger,
- a mistake that should be checked next time,
- a contradicted old rule that needs weakening.

Do not write:

- generic market summary,
- one-off price moves without lesson,
- celebratory PnL notes,
- speculative claims without evidence.

When writing memory, include:

- date,
- symbol or scope,
- evidence,
- rule,
- invalidation,
- next-use condition,
- confidence.

Prefer confidence 55-70 for single-day lessons and 75+ only for repeated patterns.

## Next-Day Preparation

End with a next-day control plan:

- account risk to check first,
- position-specific triggers,
- data sources that need verification,
- no-trade conditions,
- maximum action scope for the next loop.

Avoid predicting next-day direction.

## Numeric Rule Discipline

Before judging whether a trade plan, stop, invalidation, breakout, cash, position-size, profit-protection, or risk/reward rule triggered or failed, batch the comparisons and call `quantRuleEvaluate`.

- Use `quantRuleEvaluate` to reconcile due plans before calling `quantTradePlanReview`.
- Every reviewed plan that is marked `executed`, `blocked`, `skipped`, `missed_trigger`, `invalidated`, or `superseded` because of a number must include `ruleEvidence` with `tool: "quantRuleEvaluate"`, `ruleId`, `actual`, `operator`, threshold or range, `triggered`, and `comparisonText`.
- If the rule cannot be checked due to missing or degraded data, preserve that as the blocker and do not invent the numeric outcome.

Before finishing, call `quantTradePlanReview` for today's plans and call `quantTradePlanUpsert` for concrete next-day plans. If a plan was not completed, preserve the exact `blockerReason` rather than replacing it with a generic summary.

## Required Visible Output

Before finishing, call `workshopLogEvent` with these exact title prefixes:

- `marketScanSummary: ...`
- `trendStateReview: ...`
- `riskAssessment: ...`
- `actionTaken: ...`

Also use one of these prefixes when applicable:

- `processReview: ...`
- `memoryUpdate: ...`
- `nextDayPlan: ...`

## Final JSON Contract

The final `<structured-output>` JSON must include:

```json
{
  "marketScanSummary": "account, positions, watchlist, market breadth and material news summary",
  "riskAssessment": "process risk, position risk, data quality and rule conflicts",
  "actionTaken": "orders/fills reviewed, memories written, no operation, or blocked reason",
  "tradePlanLedger": "plan-versus-actual reconciliation and next plans written",
  "postMarketReview": {
    "processGrade": "A|B|C|D|F",
    "validatedRules": [],
    "weakenedRules": [],
    "newMemories": [],
    "nextDayPlan": []
  }
}
```

## Reference Basis

For deeper rationale, read `references/methodology.md`. Use it when deciding whether a lesson deserves memory or whether a rule is overfit.
