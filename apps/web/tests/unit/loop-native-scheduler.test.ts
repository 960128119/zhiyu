import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Loop, LoopState } from "@/lib/db/schema";

const now = new Date("2026-06-16T00:00:00.000Z");

const stateByLoopId = vi.hoisted(() => new Map<string, LoopState>());
const loops = vi.hoisted(() => [] as Loop[]);
const runLoopHarnessMock = vi.hoisted(() => vi.fn());
const runWorkshopLoopOnceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/loops/service", () => ({
  getLoopState: vi.fn(async (loopId: string) => stateByLoopId.get(loopId) ?? null),
  listLoops: vi.fn(async () => loops),
  upsertLoopState: vi.fn(async (loopId: string, input: Partial<LoopState>) => {
    const existing = stateByLoopId.get(loopId) ?? state(loopId);
    const updated = {
      ...existing,
      ...input,
      stateJson: {
        ...(existing.stateJson as Record<string, unknown>),
        ...((input.stateJson as Record<string, unknown> | undefined) ?? {}),
      },
      updatedAt: now,
    } as LoopState;
    stateByLoopId.set(loopId, updated);
    return updated;
  }),
}));

vi.mock("@/lib/loops/harness", () => ({
  runLoopHarness: runLoopHarnessMock,
}));

vi.mock("@/lib/workshops/loop-runtime", () => ({
  runWorkshopLoopOnce: runWorkshopLoopOnceMock,
}));

import { listDueNativeLoops, runDueNativeLoops } from "@/lib/loops/native-scheduler";

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: "loop-1",
    userId: "user-1",
    workshopId: null,
    name: "Loop",
    description: null,
    goal: "Review risk",
    status: "active",
    triggerConfig: { type: "once", at: "2026-06-16T00:00:00.000Z" },
    contextConfig: {},
    actionPolicy: {},
    verificationConfig: {},
    approvalPolicy: {},
    retryPolicy: {},
    escalationPolicy: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Loop;
}

function state(loopId = "loop-1", overrides: Partial<LoopState> = {}): LoopState {
  return {
    loopId,
    currentPhase: "idle",
    memorySummary: null,
    openQuestions: [],
    lastObservation: null,
    nextAction: null,
    blockedReason: null,
    stateJson: {},
    updatedAt: now,
    ...overrides,
  } as LoopState;
}

describe("native loop scheduler", () => {
  beforeEach(() => {
    stateByLoopId.clear();
    loops.length = 0;
    runLoopHarnessMock.mockReset();
    runWorkshopLoopOnceMock.mockReset();
  });

  it("lists due loops from persisted nextScheduledRunAt", async () => {
    const dueLoop = loop();
    loops.push(dueLoop);
    stateByLoopId.set(
      dueLoop.id,
      state(dueLoop.id, {
        stateJson: {
          nextScheduledRunAt: "2026-06-16T00:00:00.000Z",
          schedulerStatus: "idle",
        },
      }),
    );

    const due = await listDueNativeLoops({
      userId: "user-1",
      now: new Date("2026-06-16T00:01:00.000Z"),
    });

    expect(due).toHaveLength(1);
    expect(due[0].loop.id).toBe(dueLoop.id);
  });

  it("runs due loops in dry-run mode without an agent executor", async () => {
    const dueLoop = loop();
    loops.push(dueLoop);
    stateByLoopId.set(
      dueLoop.id,
      state(dueLoop.id, {
        stateJson: {
          nextScheduledRunAt: "2026-06-16T00:00:00.000Z",
        },
      }),
    );
    runLoopHarnessMock.mockResolvedValue({
      result: {
        status: "success",
        output: "ok",
        duration: 0,
        result: {},
      },
      harness: { name: "loop-run-harness", mode: "dry_run" },
    });

    const result = await runDueNativeLoops({
      userId: "user-1",
      now: new Date("2026-06-16T00:01:00.000Z"),
      executionMode: "dry_run",
      awaitCompletion: true,
    });

    expect(result).toEqual({ launched: 1, skipped: 0 });
    expect(runLoopHarnessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        loopId: dueLoop.id,
        mode: "dry_run",
        triggeredBy: "scheduler",
      }),
    );
    expect(stateByLoopId.get(dueLoop.id)?.stateJson).toMatchObject({
      schedulerStatus: "completed_once",
      lastScheduledRunAt: "2026-06-16T00:00:00.000Z",
    });
    expect(runWorkshopLoopOnceMock).not.toHaveBeenCalled();
  });

  it("runs workshop-owned due loops through the workshop runtime bridge", async () => {
    const dueLoop = loop({ workshopId: "workshop-1" });
    loops.push(dueLoop);
    stateByLoopId.set(
      dueLoop.id,
      state(dueLoop.id, {
        stateJson: {
          nextScheduledRunAt: "2026-06-16T00:00:00.000Z",
        },
      }),
    );
    runWorkshopLoopOnceMock.mockResolvedValue({
      loop: dueLoop,
      loopRunId: "loop-run-1",
      result: {
        status: "success",
        output: "ok",
        duration: 0,
        result: {},
      },
      harness: { name: "loop-run-harness", mode: "dry_run" },
      outboxDrafts: [],
    });

    const result = await runDueNativeLoops({
      userId: "user-1",
      now: new Date("2026-06-16T00:01:00.000Z"),
      executionMode: "dry_run",
      awaitCompletion: true,
    });

    expect(result).toEqual({ launched: 1, skipped: 0 });
    expect(runLoopHarnessMock).not.toHaveBeenCalled();
    expect(runWorkshopLoopOnceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workshopId: "workshop-1",
        loopId: dueLoop.id,
        mode: "dry_run",
        triggeredBy: "scheduler",
        reason: {
          type: "native_scheduler",
          scheduledAt: "2026-06-16T00:00:00.000Z",
        },
      }),
    );
    expect(stateByLoopId.get(dueLoop.id)?.stateJson).toMatchObject({
      schedulerStatus: "completed_once",
      lastScheduledRunAt: "2026-06-16T00:00:00.000Z",
    });
  });

  it("skips stale missed cron runs and advances to the next occurrence", async () => {
    const dueLoop = loop({
      triggerConfig: {
        type: "cron",
        expression: "0 9 * * *",
        timezone: "Asia/Shanghai",
      },
    });
    loops.push(dueLoop);
    stateByLoopId.set(
      dueLoop.id,
      state(dueLoop.id, {
        stateJson: {
          nextScheduledRunAt: "2026-07-03T01:00:00.000Z",
        },
      }),
    );

    const due = await listDueNativeLoops({
      userId: "user-1",
      now: new Date("2026-07-03T10:39:00.000Z"),
    });

    expect(due).toHaveLength(0);
    expect(stateByLoopId.get(dueLoop.id)?.stateJson).toMatchObject({
      lastMissedRunAt: "2026-07-03T01:00:00.000Z",
      nextScheduledRunAt: "2026-07-04T01:00:00.000Z",
      schedulerStatus: "idle",
    });
    expect(runLoopHarnessMock).not.toHaveBeenCalled();
  });

  it("skips A-share trading-day loops on official exchange holidays", async () => {
    const dueLoop = loop({
      triggerConfig: {
        type: "cron",
        expression: "10 9 * * 1-5",
        timezone: "Asia/Shanghai",
        tradingCalendar: "a-share",
      },
    });
    loops.push(dueLoop);
    stateByLoopId.set(
      dueLoop.id,
      state(dueLoop.id, {
        stateJson: {
          nextScheduledRunAt: "2026-10-01T01:10:00.000Z",
          schedulerStatus: "idle",
        },
      }),
    );

    const due = await listDueNativeLoops({
      userId: "user-1",
      now: new Date("2026-10-01T01:11:00.000Z"),
    });

    expect(due).toHaveLength(0);
    expect(stateByLoopId.get(dueLoop.id)).toMatchObject({
      lastObservation: "Skipped non-trading day run: 国庆节休市",
      stateJson: {
        lastSkippedTradingCalendarAt: "2026-10-01T01:10:00.000Z",
        lastSkippedTradingCalendarDate: "2026-10-01",
        lastSkippedTradingCalendarReason: "国庆节休市",
        nextScheduledRunAt: "2026-10-02T01:10:00.000Z",
        schedulerStatus: "idle",
      },
    });
    expect(runLoopHarnessMock).not.toHaveBeenCalled();
  });

  it("preserves runtime state when marking scheduler errors", async () => {
    const dueLoop = loop({
      triggerConfig: { type: "interval", minutes: 15 },
    });
    loops.push(dueLoop);
    stateByLoopId.set(
      dueLoop.id,
      state(dueLoop.id, {
        stateJson: {
          nextScheduledRunAt: "2026-06-16T00:00:00.000Z",
        },
      }),
    );
    runLoopHarnessMock.mockImplementation(async () => {
      const current = stateByLoopId.get(dueLoop.id) ?? state(dueLoop.id);
      stateByLoopId.set(dueLoop.id, {
        ...current,
        stateJson: {
          ...(current.stateJson as Record<string, unknown>),
          lastLoopRunId: "run-failed",
          lastVerificationPassed: false,
        },
      });
      throw new Error("agent failed");
    });

    const result = await runDueNativeLoops({
      userId: "user-1",
      now: new Date("2026-06-16T00:01:00.000Z"),
      executionMode: "dry_run",
      awaitCompletion: true,
    });

    expect(result).toEqual({ launched: 1, skipped: 0 });
    expect(stateByLoopId.get(dueLoop.id)).toMatchObject({
      currentPhase: "error",
      blockedReason: "agent failed",
      stateJson: {
        lastLoopRunId: "run-failed",
        lastVerificationPassed: false,
        schedulerStatus: "idle",
        schedulerError: "agent failed",
      },
    });
  });
});
