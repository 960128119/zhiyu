import { describe, expect, it } from "vitest";
import { buildLoopCurrentTimeContext } from "@/lib/loops/time-context";

describe("loop current time context", () => {
  it("formats the authoritative Shanghai date and weekday for loop reports", () => {
    const context = buildLoopCurrentTimeContext({
      now: new Date("2026-08-05T04:00:00.000Z"),
      timezone: "Asia/Shanghai",
    });

    expect(context).toMatchObject({
      timezone: "Asia/Shanghai",
      utcIso: "2026-08-05T04:00:00.000Z",
      localDate: "2026-08-05",
      localTime: "12:00",
      weekday: "周三",
      localDateWithWeekday: "2026-08-05（周三）",
    });
  });
});
