import { describe, expect, it } from "vitest";
import {
  computeNextLoopRun,
  getEffectiveNextLoopRun,
  isLoopDue,
  isNativeScheduledTrigger,
  reserveNextLoopRun,
} from "@/lib/loops";

describe("loop schedule", () => {
  it("detects native scheduled triggers", () => {
    expect(isNativeScheduledTrigger({ type: "cron" })).toBe(true);
    expect(isNativeScheduledTrigger({ type: "interval" })).toBe(true);
    expect(isNativeScheduledTrigger({ type: "once" })).toBe(true);
    expect(isNativeScheduledTrigger({ type: "manual" })).toBe(false);
    expect(isNativeScheduledTrigger({ type: "scheduled_job" })).toBe(false);
  });

  it("computes interval next run", () => {
    const next = computeNextLoopRun({
      triggerConfig: { type: "interval", minutes: 15 },
      from: new Date("2026-06-16T00:00:00.000Z"),
    });

    expect(next?.toISOString()).toBe("2026-06-16T00:15:00.000Z");
  });

  it("uses persisted nextScheduledRunAt before recomputing", () => {
    const next = getEffectiveNextLoopRun({
      triggerConfig: { type: "interval", minutes: 15 },
      stateJson: {
        nextScheduledRunAt: "2026-06-16T01:00:00.000Z",
      },
      baseline: new Date("2026-06-16T00:00:00.000Z"),
    });

    expect(next?.toISOString()).toBe("2026-06-16T01:00:00.000Z");
  });

  it("marks a loop due when next run is in the past", () => {
    expect(
      isLoopDue({
        triggerConfig: { type: "interval", minutes: 15 },
        stateJson: {
          nextScheduledRunAt: "2026-06-16T00:15:00.000Z",
        },
        baseline: new Date("2026-06-16T00:00:00.000Z"),
        now: new Date("2026-06-16T00:16:00.000Z"),
      }),
    ).toBe(true);
  });

  it("reserves recurring loops with a future next run", () => {
    const reserved = reserveNextLoopRun({
      triggerConfig: { type: "interval", minutes: 30 },
      stateJson: {},
      now: new Date("2026-06-16T00:00:00.000Z"),
    });

    expect(reserved).toMatchObject({
      lastScheduledRunAt: "2026-06-16T00:00:00.000Z",
      nextScheduledRunAt: "2026-06-16T00:30:00.000Z",
      schedulerStatus: "reserved",
    });
  });

  it("does not reschedule completed one-time loops", () => {
    const reserved = reserveNextLoopRun({
      triggerConfig: { type: "once", at: "2026-06-16T00:00:00.000Z" },
      stateJson: {},
      now: new Date("2026-06-16T00:01:00.000Z"),
    });

    expect(reserved.schedulerStatus).toBe("completed_once");
    expect(
      getEffectiveNextLoopRun({
        triggerConfig: { type: "once", at: "2026-06-16T00:00:00.000Z" },
        stateJson: reserved,
        baseline: new Date("2026-06-15T00:00:00.000Z"),
      }),
    ).toBeNull();
  });
});
