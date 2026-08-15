import { describe, expect, it } from "vitest";
import { extractTrendStateSnapshots } from "@/lib/workshops/trend-state-snapshots";

describe("trend state snapshots", () => {
  it("extracts replayable state rows from a trend system result", () => {
    const rows = extractTrendStateSnapshots({
      workshopId: "workshop-1",
      runId: "run-1",
      loopId: "loop-1",
      loopRunId: "loop-run-1",
      sourceEventId: "event-1",
      result: {
        ok: true,
        action: "trend_system",
        fetchedAt: "2026-08-06T07:30:00.000Z",
        data: {
          benchmark: { code: "399300.SZ" },
          items: [
            {
              code: "159278.SZ",
              lifecycleState: "trend_holding",
              trend: {
                name: "机器人ETF鹏华",
                phase: "uptrend",
                trendScore: 78,
                latest: { date: "2026-08-06", close: 0.957 },
              },
              relativeStrength: {
                rank: 2,
                percentile: 92.5,
                score: 84,
                relativeReturn60d: 6.2,
              },
              stopEngine: {
                trailingStop: 0.91,
                hardStop: 0.89,
                action: "hold",
              },
              controlSuggestion: {
                action: "hold",
                tradeAllowed: false,
              },
              dataQuality: { status: "ok" },
              warnings: [],
            },
          ],
        },
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workshopId: "workshop-1",
      runId: "run-1",
      sourceEventId: "event-1",
      code: "159278.SZ",
      name: "机器人ETF鹏华",
      tradeDate: "2026-08-06",
      benchmarkCode: "399300.SZ",
      lifecycleState: "trend_holding",
      trendPhase: "uptrend",
      trendScore: 78,
      rsRank: 2,
      rsPercentile: 92.5,
      trailingStop: 0.91,
      hardStop: 0.89,
      controlAction: "hold",
      dataQualityStatus: "ok",
    });
    expect(rows[0].snapshot.relativeStrength).toMatchObject({ rank: 2 });
  });

  it("ignores failed or non-trend-system results", () => {
    expect(
      extractTrendStateSnapshots({
        workshopId: "workshop-1",
        result: { ok: false, action: "trend_system" },
      }),
    ).toEqual([]);
    expect(
      extractTrendStateSnapshots({
        workshopId: "workshop-1",
        result: { ok: true, action: "quote", data: {} },
      }),
    ).toEqual([]);
  });
});
