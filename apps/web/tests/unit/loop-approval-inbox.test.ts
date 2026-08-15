import { describe, expect, it } from "vitest";
import {
  mapLoopApprovalRequestToInboxItem,
  summarizeLoopApprovalInboxItems,
} from "@/lib/loops";
import type { Loop, LoopApprovalRequest, LoopRun } from "@/lib/db/schema";

const now = new Date("2026-06-16T00:00:00.000Z");

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: "loop-1",
    userId: "user-1",
    name: "Risk Loop",
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

function run(overrides: Partial<LoopRun> = {}): LoopRun {
  return {
    id: "run-1",
    loopId: "loop-1",
    status: "needs_approval",
    triggerReason: {},
    inputSnapshot: {},
    outputSummary: null,
    verificationResult: {},
    error: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as LoopRun;
}

describe("loop approval inbox", () => {
  it("summarizes pending and denied tool gate items", () => {
    const items = summarizeLoopApprovalInboxItems({
      loop: loop(),
      run: run({
        verificationResult: {
          toolGate: {
            decisions: [
              {
                actionName: "mcp__business-tools__sendReply",
                capability: "write_external",
                decision: "require_approval",
                reason: "External write follows loop policy",
                message: "Approval required",
              },
              {
                actionName: "Bash",
                capability: "dangerous",
                decision: "deny",
                reason: "Dangerous capability is denied by default",
              },
            ],
          },
        },
      }),
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      status: "pending",
      source: "tool_gate",
      loopName: "Risk Loop",
      actionName: "mcp__business-tools__sendReply",
    });
    expect(items[1]).toMatchObject({
      status: "denied",
      actionName: "Bash",
    });
  });

  it("deduplicates approval decisions already represented by tool gate", () => {
    const items = summarizeLoopApprovalInboxItems({
      loop: loop(),
      run: run({
        verificationResult: {
          toolGate: {
            decisions: [
              {
                actionName: "sendReply",
                capability: "write_external",
                decision: "require_approval",
              },
            ],
          },
          approval: {
            decisions: [
              {
                actionName: "sendReply",
                capability: "write_external",
                decision: "require_approval",
              },
            ],
          },
        },
      }),
    });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("tool_gate");
  });

  it("maps persistent approval requests to inbox items", () => {
    const item = mapLoopApprovalRequestToInboxItem({
      loopName: "Risk Loop",
      request: {
        id: "approval-1",
        loopId: "loop-1",
        loopRunId: "run-1",
        userId: "user-1",
        status: "approved",
        source: "tool_gate",
        actionName: "sendReply",
        capability: "write_external",
        reason: "External write",
        message: "Approval required",
        toolInput: { body: "hello" },
        actionPayload: null,
        resolvedBy: "user-1",
        resolvedAt: now,
        resolutionNote: null,
        createdAt: now,
        updatedAt: now,
      } as LoopApprovalRequest,
    });

    expect(item).toMatchObject({
      id: "approval-1",
      status: "approved",
      loopName: "Risk Loop",
      actionName: "sendReply",
    });
    expect(item.completedAt).toEqual(now);
  });

  it("surfaces continuation status from approved request payloads", () => {
    const item = mapLoopApprovalRequestToInboxItem({
      loopName: "Risk Loop",
      request: {
        id: "approval-1",
        loopId: "loop-1",
        loopRunId: "run-1",
        userId: "user-1",
        status: "approved",
        source: "tool_gate",
        actionName: "sendReply",
        capability: "write_external",
        reason: null,
        message: null,
        toolInput: { body: "hello" },
        actionPayload: {
          continuation: {
            type: "tool_call",
            status: "consumed",
          },
        },
        resolvedBy: "user-1",
        resolvedAt: now,
        resolutionNote: null,
        createdAt: now,
        updatedAt: now,
      } as LoopApprovalRequest,
    });

    expect(item.continuationStatus).toBe("consumed");
  });
});
