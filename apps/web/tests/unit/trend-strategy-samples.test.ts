import { describe, expect, it } from "vitest";
import {
  summarizeTrendStrategySamples,
  type TrendStrategySampleView,
} from "@/lib/workshops/trend-strategy-samples";

function sample(
  input: Partial<TrendStrategySampleView>,
): TrendStrategySampleView {
  const now = new Date("2026-08-06T07:30:00.000Z");
  return {
    id: crypto.randomUUID(),
    workshopId: "workshop-1",
    snapshotId: crypto.randomUUID(),
    sourceEventId: null,
    code: "159278.SZ",
    name: "机器人ETF鹏华",
    tradeDate: "2026-08-06",
    lifecycleState: "trend_holding",
    trendPhase: "uptrend",
    controlAction: "hold",
    observedPrice: 1,
    observedAt: now,
    evaluationAt: now,
    latestPrice: 1,
    returnPct: 0,
    horizonDays: 0,
    holdingQuantity: 0,
    realizedPnl: 0,
    outcomeStatus: "watch_only",
    exitReason: null,
    result: {},
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

describe("trend strategy samples", () => {
  it("summarizes outcomes by lifecycle state", () => {
    const stats = summarizeTrendStrategySamples([
      sample({
        lifecycleState: "breakout_confirmed",
        returnPct: 6,
        outcomeStatus: "open",
      }),
      sample({
        lifecycleState: "breakout_confirmed",
        returnPct: -2,
        outcomeStatus: "closed",
      }),
      sample({
        lifecycleState: "watch_setup",
        returnPct: null,
        outcomeStatus: "watch_only",
      }),
    ]);

    expect(stats.sampleSize).toBe(3);
    expect(stats.evaluableSize).toBe(2);
    expect(stats.avgReturnPct).toBe(2);
    expect(stats.winRatePct).toBe(50);
    expect(stats.byLifecycleState[0]).toMatchObject({
      lifecycleState: "breakout_confirmed",
      sampleSize: 2,
      avgReturnPct: 2,
      winRatePct: 50,
    });
    expect(stats.byLifecycleState[1]).toMatchObject({
      lifecycleState: "watch_setup",
      sampleSize: 1,
      evaluableSize: 0,
    });
  });
});
