import { describe, expect, it } from "vitest";
import {
  buildLoopTaskStateJsonAfterUpdate,
  buildLoopTaskUpdateFromDraft,
  canDeleteLoopTaskFromChat,
  resolveLoopCreationWorkshopTarget,
} from "@/lib/ai/mcp/tools/loop-tasks";

describe("loop task chat tools", () => {
  it("does not allow ordinary chat to delete workshop-owned loops", () => {
    expect(canDeleteLoopTaskFromChat({ workshopId: "workshop-1" })).toBe(false);
    expect(canDeleteLoopTaskFromChat({ workshopId: null })).toBe(true);
  });

  it("binds new loop tasks to an explicitly referenced workshop", () => {
    expect(
      resolveLoopCreationWorkshopTarget({
        intent:
          "\u7ed9\u81ea\u9009\u80a1\u730e\u624b\u8f66\u95f4\u6bcf\u592917\u70b9\u521b\u5efa\u590d\u76d8\u4efb\u52a1",
        workshops: [
          { id: "workshop-1", name: "\u81ea\u9009\u80a1\u730e\u624b" },
          { id: "workshop-2", name: "\u64cd\u76d8\u4ea4\u6613\u5458" },
        ],
      }),
    ).toEqual({
      status: "workshop",
      workshopId: "workshop-1",
      workshopName: "\u81ea\u9009\u80a1\u730e\u624b",
    });
  });

  it("refuses workshop-flavored loop creation when no unique workshop is known", () => {
    expect(
      resolveLoopCreationWorkshopTarget({
        intent:
          "\u7ed9\u4e0d\u5b58\u5728\u7684\u8f66\u95f4\u521b\u5efa\u6bcf\u5929\u4efb\u52a1",
        workshops: [{ id: "workshop-1", name: "\u81ea\u9009\u80a1\u730e\u624b" }],
      }),
    ).toMatchObject({
      status: "missing",
    });
  });

  it("updates workshop loop schedules in place without replacing its control policy", () => {
    const update = buildLoopTaskUpdateFromDraft(
      {
        workshopId: "workshop-1",
        name: "交易日收盘后自选股筛选",
        goal: "原有目标",
        description: "原有描述",
        triggerConfig: {
          type: "cron",
          expression: "0 15 * * 1-5",
          timezone: "Asia/Shanghai",
          tradingDayOnly: true,
          tradingCalendar: "a-share",
        },
        actionPolicy: { allowed: ["quantPaperGetWatchlist"] },
        verificationConfig: {
          requiredFields: [
            "marketScanSummary",
            "currentWatchlistReview",
            "candidatePool",
            "watchlistDecision",
          ],
        },
      },
      {
        name: "每天17点执行",
        description: "新描述",
        spec: {
          trigger: {
            type: "cron",
            expression: "0 17 * * 1-5",
            timezone: "Asia/Shanghai",
            tradingDayOnly: true,
            tradingCalendar: "a-share",
          },
        },
      },
      "把自选股猎手的任务改到每天17点",
    );

    expect(update.workshopId).toBeUndefined();
    expect(update.name).toBeUndefined();
    expect(update.goal).toBeUndefined();
    expect(update.description).toBeUndefined();
    expect(update.actionPolicy).toBeUndefined();
    expect(update.verificationConfig).toBeUndefined();
    expect(update.triggerConfig).toEqual({
      type: "cron",
      expression: "0 17 * * 1-5",
      timezone: "Asia/Shanghai",
      tradingDayOnly: true,
      tradingCalendar: "a-share",
    });
  });

  it("refreshes persisted scheduler state when a loop schedule is updated", () => {
    const updatedAt = new Date("2026-08-02T12:21:13.879Z");
    const stateJson = buildLoopTaskStateJsonAfterUpdate({
      stateJson: {
        loopSpec: {
          trigger: {
            type: "cron",
            expression: "0 17 * * 1-5",
            timezone: "Asia/Shanghai",
          },
          metadata: {
            skillName: "watchlist-selection-control",
          },
        },
        nextScheduledRunAt: "2026-08-03T09:00:00.000Z",
        schedulerStatus: "idle",
        schedulerError: "stale",
      },
      updates: {
        triggerConfig: {
          type: "cron",
          expression: "0 16 * * 1-5",
          timezone: "Asia/Shanghai",
        },
      },
      intent:
        "\u4ea4\u6613\u65e5\u6536\u76d8\u540e\u81ea\u9009\u80a1\u7b5b\u9009\uff0c\u6539\u4e3a\u6bcf\u4e2a\u4ea4\u6613\u65e5\u4e0b\u53484\u70b9\u6267\u884c",
      updatedAt,
      nextScheduledRunAt: "2026-08-03T08:00:00.000Z",
    });

    expect(stateJson.nextScheduledRunAt).toBe("2026-08-03T08:00:00.000Z");
    expect(stateJson.schedulerStatus).toBe("idle");
    expect(stateJson.schedulerError).toBeUndefined();
    expect(stateJson.loopSpec).toMatchObject({
      trigger: {
        type: "cron",
        expression: "0 16 * * 1-5",
        timezone: "Asia/Shanghai",
      },
      metadata: {
        skillName: "watchlist-selection-control",
        lastUpdatedAt: "2026-08-02T12:21:13.879Z",
      },
    });
  });
});
