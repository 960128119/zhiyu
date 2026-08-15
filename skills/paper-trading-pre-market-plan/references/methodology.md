# Methodology Basis

This skill uses a low-frequency, risk-first A-share paper-trading framework. It is not investment advice and must remain inside the simulated paper account.

## Sources Studied

- Stan Weinstein, `Secrets for Profiting in Bull and Bear Markets`: stage analysis, market phase, relative strength, and avoiding weak stages.
- William J. O'Neil, `How to Make Money in Stocks`: market direction, leaders over laggards, and buying only when multiple growth/technical conditions align.
- Mark Minervini, `Trade Like a Stock Market Wizard`: trend template, avoiding falling knives, volatility contraction, and strict risk control.
- Alexander Elder, `Trading for a Living` / `The New Trading for a Living`: mind, method, money; multiple screens; plan before action.
- John J. Murphy, `Technical Analysis of the Financial Markets`: trend, support/resistance, volume confirmation, and multi-timeframe context.
- Van K. Tharp, `Trade Your Way to Financial Freedom`: expectancy, position sizing, and risk per trade as the core of a system.
- Mark Douglas, `Trading in the Zone`: probabilistic thinking and process discipline over prediction.
- Brett Steenbarger, `The Daily Trading Coach`: review, self-coaching, and turning repeated behavior into deliberate improvement.

## Synthesis For This Project

The agent should not imitate a discretionary trader. It should behave like a control system:

1. Observe current account, market, watchlist, and data quality.
2. Estimate state: market regime, position risk, relative strength, and confidence.
3. Apply stable control rules.
4. Act only when all gates pass.
5. Record event evidence.
6. Feed outcomes into memory after review.

## Chosen Trading Style

Use `low-frequency trend and relative-strength trading with strict risk control`.

Reason:

- The system has daily/low-frequency scheduling, not tick-level execution.
- A-share T+1 and price-limit rules make impulsive intraday correction expensive.
- The agent has good memory and review capacity, so process discipline is more valuable than prediction.
- Market/news/fund-flow tools can degrade, so decisions must require redundancy.

## Deliberately Excluded Styles

- Pure day trading or scalping: insufficient latency and order-book depth.
- Limit-up board chasing: too dependent on queue, sentiment, and second-level execution.
- Pure news trading: too vulnerable to rumor, stale news, and title bias.
- Pure value investing: time horizon is too long for daily intraday loops.
- Indicator-only systems: wastes the account, memory, news, and review context.

## Control-Law Priorities

1. Survival and auditability.
2. Data freshness and source quality.
3. Market regime.
4. Position risk.
5. Relative strength.
6. Risk/reward.
7. News and filings as confidence modifiers.
8. Simulated execution.
9. Review and memory update.

## Rule Quality Standard

A rule is worth memory only when it has:

- evidence,
- scope,
- invalidation,
- future-use condition,
- confidence,
- at least one counter-risk.

Single-day observations should usually remain low-confidence unless they repeat.
