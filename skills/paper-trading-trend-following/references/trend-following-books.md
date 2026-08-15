# Trend Following Book Canon

This reference turns well-known trend-following and momentum-trading books into rules the paper-trading workshop can use. It is not a recommendation to trade real money.

## Source Map

- Michael W. Covel, `Trend Following`: use as the philosophy layer. The useful rule is to follow observed price trends with repeatable rules instead of prediction. Source: https://www.wiley-vch.de/ISBN978-1-119-37187-8 and https://www.trendfollowing.com/about/
- Andreas F. Clenow, `Following the Trend`: use as the systematic layer. The useful rule is diversified, rules-based trading with risk sizing and repeatable execution. Source: https://www.wiley.com/en-us/Following%2Bthe%2BTrend%3A%2BDiversified%2BManaged%2BFutures%2BTrading%2C%2B2nd%2BEdition-p-9781119908982
- Curtis M. Faith, `Way of the Turtle`: use as the mechanical execution layer. The useful rule is explicit breakout/pullback entry, volatility-based position sizing, and predefined exits. Source: https://books.google.com/books/about/Way_of_the_Turtle_The_Secret_Methods_tha.html?id=tatZTyKeL2AC
- Stan Weinstein, `Secrets For Profiting in Bull and Bear Markets`: use as the stage-analysis layer. The useful rule is to classify market/stock life cycle before buying, prefer advancing stages, and exit deteriorating stages. Source: https://www.amazon.com/Stan-Weinsteins-Secrets-Profiting-Markets/dp/1556236832 and https://www.stageanalysis.net/
- William J. O'Neil, `How to Make Money in Stocks`: use as the leading-stock and market-direction layer. The useful rule is to combine earnings/quality, chart bases, market direction, and strict loss control. Source: https://www.mheducation.com/highered/mhp/product/how-make-money-stocks-complete-investing-system-your-ultimate-guide-winning-good-times-bad.html
- Mark Minervini, `Trade Like a Stock Market Wizard`: use as the precise-entry and risk-control layer. The useful rule is to select strong stocks, wait for specific entry points, preserve capital, and journal decisions. Source: https://www.mheducation.com/highered/mhp/product/trade-like-stock-market-wizard-how-achieve-super-performance-stocks-any-market.html
- Jack D. Schwager, `Market Wizards`: use as the discipline layer. The useful rule is that different methods can work only when matched with solid methodology, risk control, and trading psychology. Source: https://www.wiley.com/en-us/-p-9781118273050
- Perry J. Kaufman, `Trading Systems and Methods`: use as the system-design layer. The useful rule is to treat a trading idea as a testable system with indicators, algorithms, risk models, and known failure modes. Source: https://www.wiley.com/en-us/Trading%2BSystems%2Band%2BMethods%2C%2B6th%2BEdition-p-9781119605393 and https://kaufmansignals.com/books/

## Book-Derived Rules

1. Do not predict. Classify the current state from observable price, moving averages, relative strength, volume, market mood, and data quality.
2. Trade only when the trend state is favorable. Favor strong uptrend, early breakout, or constructive pullback; avoid range, downtrend, broken, and overextended moves.
3. Define invalidation before entry. Every order needs a stop, thesis, and next verification point before it is submitted.
4. Size by risk, not excitement. Position size must be constrained by account exposure, available cash, stop distance, volatility, and concentration.
5. Prefer leading strength. The target should be stronger than its industry, watchlist peers, and broad market; do not buy weak stocks just because they look cheap.
6. Add to winners only after confirmation. Do not average down a broken trend.
7. Sell faster when the trend breaks. A deteriorating holding should not be protected by narrative, news, or hope.
8. Treat news as context, not command. News can raise or lower confidence only after price/volume/trend confirms or invalidates it.
9. Log every decision as a system sample. The agent must write what it observed, what rule fired, what it did, and what would prove the decision wrong.
10. Learn from closed loops. Memory should store reusable patterns, missed triggers, rule violations, data-source failures, and validated trade management rules.

## A-Share Adaptation

- Respect T+1 selling, price limits, board-specific volatility, lot size, and ETF precision.
- Use `aStockTrend` fields already available in this project as the core signal set: `phase`, `trendScore`, `ma20`, `ma60`, `ma20SlopePct`, `atr14`, `distanceToMa20Pct`, `initialStop`, and `recentKlines`.
- Use `aStockSignals` and market news as confidence modifiers. If fund-flow or industry-comparison data is degraded, record the limitation and reduce confidence.
- For Weinstein-style stage thinking, use MA60 and higher-timeframe trend if available. If only MA20/MA60 are available, treat the result as a short/mid-term proxy, not a full long-term stage model.
- For O'Neil/Minervini-style momentum thinking, require relative strength, a clear entry structure, and a strict stop; do not use daily gain alone as the buy reason.

## Anti-Patterns

- Buying because a stock is popular today without a stop.
- Holding a broken trend because the story still sounds good.
- Adding to a loser without a new confirmed trend structure.
- Treating degraded data as if it were complete.
- Calling every rise a breakout.
- Generating memory from routine daily noise.
