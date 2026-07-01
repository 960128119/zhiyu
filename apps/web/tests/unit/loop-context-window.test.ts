import { describe, expect, it } from "vitest";
import type { LoopState } from "@/lib/db/schema";
import { prepareLoopContextWindow } from "@/lib/loops/context-window";
import { parseLoopSpec } from "@/lib/loops/spec";

const loopSpec = parseLoopSpec({
  goal: "Send a daily report",
  trigger: { type: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
  context: { sources: [] },
  actions: { allowed: ["wechatDesktopSendMessage"], requiresApproval: [], denied: [] },
  verification: {
    type: "structured_check",
    requiredSources: ["wechatDesktopSendMessage"],
  },
});

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
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  } as LoopState;
}

describe("loop context window", () => {
  it("keeps small durable state unchanged", () => {
    const result = prepareLoopContextWindow({
      loopSpec,
      state: state({
        stateJson: {
          loopSpec,
          lastLoopRunId: "run-1",
        },
      }),
      maxChars: 10_000,
    });

    expect(result.compacted).toBe(false);
    expect(result.durableState.stateJson).toMatchObject({
      lastLoopRunId: "run-1",
    });
  });

  it("compacts oversized state while preserving essential loop state", () => {
    const result = prepareLoopContextWindow({
      loopSpec,
      state: state({
        memorySummary: "important memory",
        openQuestions: Array.from({ length: 20 }, (_, index) => ({
          id: index,
        })),
        stateJson: {
          loopSpec,
          lastLoopRunId: "run-2",
          nextScheduledRunAt: "2026-06-30T01:00:00.000Z",
          noisyScratchpad: "x".repeat(20_000),
        },
      }),
      maxChars: 3_000,
    });

    expect(result.compacted).toBe(true);
    expect(result.durableState.memorySummary).toBe("important memory");
    expect(result.durableState.openQuestions).toHaveLength(8);
    expect(result.durableState.stateJson).toMatchObject({
      lastLoopRunId: "run-2",
      nextScheduledRunAt: "2026-06-30T01:00:00.000Z",
    });
    expect(result.durableState.stateJson.loopSpec).toBeTruthy();
    expect(result.omittedStateKeys).toContain("noisyScratchpad");
    expect(result.durableState.stateJson._contextCompaction).toMatchObject({
      omittedStateKeys: ["noisyScratchpad"],
    });
  });
});
