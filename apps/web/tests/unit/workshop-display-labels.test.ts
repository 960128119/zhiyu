import { describe, expect, it } from "vitest";
import { workDisplayLabel } from "@/lib/workshops/display-labels";

describe("workshop display labels", () => {
  it("localizes watchlist hunter control keys", () => {
    expect(workDisplayLabel("market_candidate_pool")).toBe("市场候选池");
    expect(workDisplayLabel("core_watchlist_pool")).toBe("核心自选股池");
    expect(workDisplayLabel("trading_watchlist_pool")).toBe("交易关注池");
    expect(workDisplayLabel("holding_watchlist_pool")).toBe("持仓跟踪池");
    expect(workDisplayLabel("watchlist_change_events")).toBe("自选股调整记录");
  });

  it("localizes common loop and skill keys", () => {
    expect(workDisplayLabel("cron")).toBe("定时");
    expect(workDisplayLabel("watchlist-selection-control")).toBe(
      "自选股筛选方法论",
    );
    expect(workDisplayLabel("quantMarketDiscoverCandidates")).toBe(
      "发现市场候选股",
    );
  });

  it("localizes MCP-prefixed and generic tool names", () => {
    expect(workDisplayLabel("mcp__workshop-tools__aStockQuote")).toBe(
      "读取 A 股行情",
    );
    expect(workDisplayLabel("mcp__workshop-tools__quantPaperGetAccount")).toBe(
      "读取模拟盘账户",
    );
    expect(workDisplayLabel("mcp__workshop-tools__aStockTrendSystem")).toBe(
      "读取趋势跟随系统",
    );
    expect(workDisplayLabel("mcp__workshop-tools__aStockTrendStateHistory")).toBe(
      "读取趋势状态历史",
    );
    expect(workDisplayLabel("mcp__workshop-tools__aStockTrendStrategyStats")).toBe(
      "读取趋势策略样本",
    );
    expect(workDisplayLabel("WebSearch")).toBe("网页搜索");
    expect(workDisplayLabel("Bash")).toBe("运行命令");
  });
});
