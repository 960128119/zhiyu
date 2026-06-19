import { describe, expect, it } from "vitest";
import { buildLoopApprovalContinuation } from "@/lib/loops";
import type { LoopApprovalRequest } from "@/lib/db/schema";

const now = new Date("2026-06-16T00:00:00.000Z");

function request(
  overrides: Partial<LoopApprovalRequest> = {},
): LoopApprovalRequest {
  return {
    id: "approval-1",
    loopId: "loop-1",
    loopRunId: "run-1",
    userId: "user-1",
    status: "pending",
    source: "tool_gate",
    actionName: "sendReply",
    capability: "write_external",
    reason: "External write needs approval",
    message: "Approval required",
    toolInput: { body: "hello" },
    actionPayload: { toolUseID: "tool-1" },
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as LoopApprovalRequest;
}

describe("loop approval continuation", () => {
  it("builds a ready manual continuation for approved tool calls", () => {
    const continuation = buildLoopApprovalContinuation({
      request: request(),
      approvedBy: "user-1",
      approvedAt: now,
    });

    expect(continuation).toMatchObject({
      type: "tool_call",
      status: "ready",
      approvalRequestId: "approval-1",
      actionName: "sendReply",
      toolUseID: "tool-1",
      toolInput: { body: "hello" },
      resumeMode: "manual_review",
    });
  });

  it("marks requests without tool input as not resumable", () => {
    const continuation = buildLoopApprovalContinuation({
      request: request({ toolInput: null }),
      approvedBy: "user-1",
      approvedAt: now,
    });

    expect(continuation.status).toBe("not_resumable");
  });
});
