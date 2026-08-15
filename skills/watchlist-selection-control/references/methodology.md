# Methodology Reference

This reference explains the research synthesis behind `watchlist-selection-control`. Load it when adjusting the selection method, diagnosing repeated failures, or explaining why the watchlist hunter should select in this style.

## Research Sources Studied

- Qian Xuesen / Hsue Shen Tsien, *Engineering Cybernetics*: control systems, feedback, stability, disturbance, and bounded action.
- Stan Weinstein, *Secrets for Profiting in Bull and Bear Markets*: stage analysis, relative strength, market breadth, and avoiding weak-stage securities.
- William J. O'Neil, *How to Make Money in Stocks*: CAN SLIM, leaders over laggards, institutional demand, market direction, and loss control.
- Mark Minervini, *Trade Like a Stock Market Wizard* and *Think & Trade Like a Champion*: trend template, volatility contraction, leadership, and strict risk filters.
- John Murphy, *Technical Analysis of the Financial Markets*: trend, volume, support/resistance, sector confirmation, and multiple time-frame context.
- Alexander Elder, *Trading for a Living*: triple-screen thinking, impulse control, and separating trade decision layers.
- Van K. Tharp, *Trade Your Way to Financial Freedom*: position sizing, expectancy, risk unit thinking, and system objectives.
- Mark Douglas, *Trading in the Zone*: probabilistic thinking, avoiding emotional certainty, and following process rather than prediction.
- Brett Steenbarger, *The Daily Trading Coach*: journaling, deliberate practice, process feedback, and behavioral correction.
- SSE and SZSE trading rules: A-share trading hours, price-limit regimes, lot constraints, and practical market microstructure.
- CFA Institute investor policy statement materials: translating objectives and constraints into bounded investment policy.

## Why This Project Should Use a Watchlist-Control Method

The project is a personal AI workshop, not a professional discretionary trading desk. Its strengths are:

- repeatable observation,
- structured evidence,
- memory of past mistakes,
- proposal and review workflow,
- separation between selector and trader.

Its weaknesses are:

- market data quality can degrade,
- the model can overreact to the most recent move,
- candidate discovery may collapse into a low-diversity fallback pool,
- the system can confuse "interesting" with "actionable",
- user trust depends on auditability more than boldness.

Therefore the watchlist hunter should not optimize for maximum short-term alpha claims. It should optimize for a stable, inspectable candidate state that helps the paper trader make bounded decisions.

## Selected Method Style

Use a low-frequency, evidence-weighted, trend-and-relative-strength watchlist method.

Core beliefs:

1. Market regime comes first.
2. Leaders are better than laggards.
3. Price/volume and relative strength are the first tradability filters.
4. Fundamentals and news are supporting filters, not standalone triggers.
5. Watchlist capacity is scarce; adding a name has an opportunity cost.
6. A symbol must have a role and an invalidation rule.
7. A proposal is a control action and must be auditable.
8. No-change is a valid decision when evidence is weak.

## Excluded Styles

Do not turn the hunter into:

- a pure news chaser,
- a limit-up board chaser,
- a high-frequency scanner,
- a pure valuation screener,
- a one-theme promotion machine,
- a model-confidence ranking table with no evidence,
- a trader that places orders.

## Engineering-Cybernetics Mapping

Controlled object:

- Paper-trading watchlist.

Observation inputs:

- Current watchlist quote snapshot.
- Market mood and breadth.
- Market candidate discovery output.
- Quote, signals, fundamentals, news, filings.
- Workshop memory and previous proposal outcomes.

State model:

- Market regime.
- Current watchlist buckets.
- Candidate pool roles.
- Data-source reliability.
- Pending proposal state.
- Reusable selection lessons.

Control action:

- `quantPaperProposeWatchlistChange`, which creates a pending proposal event rather than directly applying changes.

Boundary:

- No real trading.
- No paper order placement.
- No direct watchlist mutation.
- No external send.
- Owner review applies proposal.

Feedback:

- Proposal accepted/rejected.
- Candidate subsequent performance.
- Paper trader's ability to use the list.
- Data-source failures or stale fields.
- Repeated false positives.

## Candidate Scoring Model

Use qualitative buckets instead of fake precision unless the data source provides reliable numeric fields.

Score each candidate across:

- market-regime fit,
- theme/sector fit,
- relative strength,
- price-volume structure,
- liquidity,
- fund-flow quality,
- fundamentals sanity,
- news/filing risk,
- watchlist diversity contribution,
- paper-trader usefulness,
- data confidence.

The candidate must have both support and opposition. If no opposition can be named, the analysis is probably shallow.

## Admission Threshold

Add proposal threshold:

- at least one current source event,
- current quote or same-day quote snapshot,
- at least one corroborating signal beyond discovery,
- no hard risk flag,
- clear role in watchlist,
- clear invalidation or observation trigger,
- better than the weakest removable current watchlist name.

Observe threshold:

- interesting theme but weak confirmation,
- strong move but extended,
- good fundamentals but weak price action,
- good price action but missing signals,
- data source degraded but not hopeless.

Reject threshold:

- fallback-only evidence,
- obvious underperformance,
- unexplainable abnormal fields,
- repeated source conflict,
- poor liquidity,
- concentrated duplicate exposure,
- thesis depends on rumors.

## Removal Threshold

Remove proposal threshold:

- not held and no open orders,
- thesis invalidated or stale,
- weaker than available replacements,
- persistent underperformance,
- serious data/news/fund-flow risk,
- duplicated exposure with a better representative available.

Do not remove:

- held positions,
- symbols with open orders,
- owner-forced symbols,
- ETFs that are intentionally used to reduce single-name risk,
- names with temporary weakness but a still-valid observation purpose.

## Anti-Overfitting Rules

- Do not rewrite the method after one bad candidate.
- Do not increase theme concentration after one strong day.
- Do not trust zero PE/ROE fields unless the provider explains why.
- Do not treat fund flow as truth when the provider is unstable.
- Do not confuse "high attention" with "good candidate".
- Keep rejected candidates and data-source problems as memory only when they teach a future rule.

## Review Questions

Before proposing a change, ask:

1. What is the current market regime?
2. Which current symbol becomes less useful if this candidate enters?
3. What independent evidence supports the candidate?
4. What evidence argues against it?
5. What would invalidate it in the next one to five trading days?
6. Does this improve diversity or merely add another similar exposure?
7. Can the paper trader act on this tomorrow without guessing?
8. If the owner reviews this proposal later, can they see the evidence trail?
