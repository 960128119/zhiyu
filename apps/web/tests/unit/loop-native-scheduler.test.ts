import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Loop, LoopState } from "@/lib/db/schema";

const now = new Date("2026-06-16T00:00:00.000Z");

const stateByLoopId = vi.hoisted(() => new Map<string, LoopState>());
const loops = vi.hoisted(() => [] as Loop[]);
const runLoopHarnessMock = vi.hoisted(() => vi.fn());

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

import { listDueNativeLoops, runDueNativeLoops } from "@/lib/loops/native-scheduler";

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: "loop-1",
    userId: "user-1",
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
      lastScheduledRunAt: "2026-06-16T00:01:00.000Z",
    });
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
