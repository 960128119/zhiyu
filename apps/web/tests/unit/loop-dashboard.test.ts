import { describe, expect, it } from "vitest";
import {
  deriveLoopDashboardStatus,
  summarizeLoopRun,
  type LoopRunDashboardSummary,
} from "@/lib/loops";
import type { Loop, LoopRun, LoopState } from "@/lib/db/schema";

const now = new Date("2026-06-16T00:00:00.000Z");

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: "loop-1",
    userId: "user-1",
    name: "Loop",
    description: null,
    goal: "Review risk",
    status: "active",
    triggerConfig: {},
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

function state(overrides: Partial<LoopState> = {}): LoopState {
  return {
    loopId: "loop-1",
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

describe("loop dashboard", () => {
  it("summarizes run verification and approval state", () => {
    const summary = summarizeLoopRun({
      id: "run-1",
      loopId: "loop-1",
      status: "needs_approval",
      startedAt: now,
      completedAt: now,
      outputSummary: "Needs approval",
      error: null,
      triggerReason: {},
      inputSnapshot: {},
      verificationResult: {
        verification: { passed: true },
        checker: { checkerType: "hybrid" },
        decision: { action: "needs_approval" },
        approval: { requiresApproval: true, denied: false },
        actionGuard: { mode: "advisory", blocked: false },
        modelChecker: {
          enabled: true,
          reason: "Model checker is enabled for this loop.",
        },
      },
      createdAt: now,
      updatedAt: now,
    } as LoopRun);

    expect(summary).toMatchObject({
      verificationPassed: true,
      checkerAction: "needs_approval",
      checkerType: "hybrid",
      requiresApproval: true,
      denied: false,
      actionGuardMode: "advisory",
      actionGuardBlocked: false,
      modelCheckerEnabled: true,
      modelCheckerReason: "Model checker is enabled for this loop.",
    });
  });

  it("derives needs approval before blocked or error", () => {
    const latestRun: LoopRunDashboardSummary = {
      id: "run-1",
      status: "blocked",
      startedAt: now,
      completedAt: now,
      outputSummary: null,
      error: null,
      verificationPassed: false,
      checkerAction: "block",
      checkerType: "deterministic",
      requiresApproval: true,
      denied: false,
      actionGuardMode: null,
      actionGuardBlocked: false,
      modelCheckerEnabled: false,
      modelCheckerReason: null,
    };

    expect(
      deriveLoopDashboardStatus({
        loop: loop(),
        state: state({ currentPhase: "blocked" }),
        latestRun,
      }),
    ).toBe("needs_approval");
  });

  it("derives blocked and error dashboard states", () => {
    expect(
      deriveLoopDashboardStatus({
        loop: loop(),
        state: state({ currentPhase: "retry_recommended" }),
        latestRun: null,
      }),
    ).toBe("blocked");

    expect(
      deriveLoopDashboardStatus({
        loop: loop(),
        state: state({ currentPhase: "error" }),
        latestRun: null,
      }),
    ).toBe("error");
  });

  it("derives blocked when action guard enforces a block", () => {
    const latestRun: LoopRunDashboardSummary = {
      id: "run-1",
      status: "success",
      startedAt: now,
      completedAt: now,
      outputSummary: null,
      error: null,
      verificationPassed: true,
      checkerAction: "complete",
      checkerType: "deterministic",
      requiresApproval: false,
      denied: true,
      actionGuardMode: "enforce",
      actionGuardBlocked: true,
      modelCheckerEnabled: false,
      modelCheckerReason: null,
    };

    expect(
      deriveLoopDashboardStatus({
        loop: loop(),
        state: state(),
        latestRun,
      }),
    ).toBe("blocked");
  });
});
