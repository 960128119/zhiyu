import { describe, expect, it } from "vitest";
import { isAShareTradingDay } from "@/lib/markets/a-share-trading-calendar";

describe("A-share trading calendar", () => {
  it("treats a normal weekday outside 2026 holiday ranges as trading day", () => {
    const result = isAShareTradingDay(new Date("2026-07-20T01:10:00.000Z"));

    expect(result).toMatchObject({
      isTradingDay: true,
      date: "2026-07-20",
      reason: "交易日",
    });
  });

  it("treats official 2026 National Day holiday as closed", () => {
    const result = isAShareTradingDay(new Date("2026-10-01T01:10:00.000Z"));

    expect(result).toMatchObject({
      isTradingDay: false,
      date: "2026-10-01",
      reason: "国庆节休市",
    });
  });

  it("treats weekends as closed", () => {
    const result = isAShareTradingDay(new Date("2026-07-18T01:10:00.000Z"));

    expect(result).toMatchObject({
      isTradingDay: false,
      date: "2026-07-18",
      reason: "周末休市",
    });
  });
});
