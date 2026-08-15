import { describe, expect, it } from "vitest";

import {
  assertQuantCandidatesUsableForControl,
  assertQuantDashboardUsableForControl,
} from "@/lib/quant/control-guards";
import type {
  QuantDashboard,
  QuantMarketCandidatesResponse,
} from "@/lib/quant/types";

const liveDashboard: QuantDashboard = {
  generated_at: "2026-08-08T00:00:00.000Z",
  service_mode: "live",
  data_provider: "tencent",
  data_source_detail: "tencent_realtime",
  market: {
    trade_date: "20260808",
    temperature: 50,
    up_count: 1,
    down_count: 1,
    flat_count: 0,
    turnover_billion: 100,
    indices: [],
    sectors: [],
  },
  watchlist: [],
  signals: [],
  portfolio: {
    mode: "paper",
    total_value: 100000,
    cash: 100000,
    daily_pnl: 0,
    daily_pnl_pct: 0,
    total_pnl: 0,
    total_pnl_pct: 0,
    max_drawdown_pct: 0,
    positions: [],
    risk: {
      cash_weight_pct: 100,
      largest_position_pct: 0,
      sector_concentration: "-",
      alerts: [],
    },
  },
  daily_report: {
    title: "Daily",
    summary: "No action.",
    next_actions: [],
  },
};

const liveCandidates: QuantMarketCandidatesResponse = {
  generated_at: "2026-08-08T00:00:00.000Z",
  provider: "tencent",
  data_source_detail: "tencent_realtime",
  theme: "AI",
  keywords: ["AI"],
  filters: {
    limit: 10,
    min_turnover_billion: 0.3,
    exclude_watchlist: true,
    exclude_st: true,
  },
  concept_sources: [{ source: "tencent_quote", keyword: "AI" }],
  items: [],
};

describe("quant control guards", () => {
  it("allows live dashboard observations for control", () => {
    expect(() =>
      assertQuantDashboardUsableForControl(liveDashboard),
    ).not.toThrow();
  });

  it("blocks dashboard control when quant observations are sample data", () => {
    expect(() =>
      assertQuantDashboardUsableForControl({
        ...liveDashboard,
        service_mode: "sample",
        data_source_detail: "sample_static",
      }),
    ).toThrow(/not live/);
  });

  it("blocks candidate-pool writes from fallback or local-seed discovery", () => {
    expect(() =>
      assertQuantCandidatesUsableForControl({
        ...liveCandidates,
        data_source_detail: "tencent_theme_seed_fallback",
        concept_sources: [
          { source: "local_theme_seed+tencent_quote", keyword: "AI" },
        ],
      }),
    ).toThrow(/degraded data/);
  });

  it("allows candidate-pool writes from live candidate observations", () => {
    expect(() =>
      assertQuantCandidatesUsableForControl(liveCandidates),
    ).not.toThrow();
  });
});
