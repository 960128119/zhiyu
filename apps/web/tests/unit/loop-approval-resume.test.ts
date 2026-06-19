import { describe, expect, it } from "vitest";
import {
  consumeApprovalContinuationState,
  findPendingApprovalContinuation,
} from "@/lib/loops";
import type { LoopApprovalContinuation } from "@/lib/loops";

const continuation: LoopApprovalContinuation = {
  type: "tool_call",
  status: "ready",
  approvalRequestId: "approval-1",
  loopId: "loop-1",
  loopRunId: "run-1",
  actionName: "sendReply",
  capability: "write_external",
  toolUseID: "tool-1",
  toolInput: { body: "hello" },
  approvedBy: "user-1",
  approvedAt: "2026-06-16T00:00:00.000Z",
  resumeMode: "manual_review",
  reason: "External write",
};

describe("loop approval resume", () => {
  it("finds pending continuations by approval request id", () => {
    const found = findPendingApprovalContinuation({
      stateJson: {
        pendingApprovalContinuations: [continuation],
      },
      approvalRequestId: "approval-1",
    });

    expect(found).toEqual(continuation);
  });

  it("moves consumed continuations from pending to consumed history", () => {
    const stateJson = consumeApprovalContinuationState({
      stateJson: {
        pendingApprovalContinuations: [continuation],
        consumedApprovalContinuations: [],
      },
      continuation,
      consumedBy: "user-1",
      consumedAt: new Date("2026-06-17T00:00:00.000Z"),
      note: "Recorded",
    });

    expect(stateJson.pendingApprovalContinuations).toEqual([]);
    expect(stateJson.lastConsumedApprovalRequestId).toBe("approval-1");
    expect(stateJson.consumedApprovalContinuations).toMatchObject([
      {
        consumedBy: "user-1",
        result: "recorded",
        note: "Recorded",
        continuation: {
          approvalRequestId: "approval-1",
          status: "consumed",
        },
      },
    ]);
  });
});
