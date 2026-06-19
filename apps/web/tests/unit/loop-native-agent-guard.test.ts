import { describe, expect, it } from "vitest";
import {
  withNativeAgentLoopGuardMetadata,
  type ChatLoopGuardContext,
} from "@/lib/loops";

const context: ChatLoopGuardContext = {
  loopId: "loop-1",
  loopName: "Risk Review",
  actionPolicy: {
    allowed: ["Read"],
    requiresApproval: ["sendReply"],
    denied: ["WebFetch"],
  },
  approvalPolicy: {
    defaultMode: "allow",
    externalWrites: "require_approval",
  },
};

describe("native agent loop guard metadata", () => {
  it("returns the original request when there is no loop context", () => {
    const request = {
      toolName: "Bash",
      toolInput: {},
      toolUseID: "tool-1",
    };

    expect(
      withNativeAgentLoopGuardMetadata({
        context: null,
        request,
      }),
    ).toBe(request);
  });

  it("does not annotate allowed actions", () => {
    const result = withNativeAgentLoopGuardMetadata({
      context,
      request: {
        toolName: "Read",
        toolInput: {},
        toolUseID: "tool-1",
      },
    });

    expect(result.loopGuardDecision).toBeUndefined();
    expect(result.decisionReason).toBeUndefined();
  });

  it("annotates approval-required actions", () => {
    const result = withNativeAgentLoopGuardMetadata({
      context,
      request: {
        toolName: "sendReply",
        toolInput: { body: "hi" },
        toolUseID: "tool-1",
      },
    });

    expect(result).toMatchObject({
      loopGuardDecision: "require_approval",
      loopGuardLoopId: "loop-1",
    });
    expect(result.decisionReason).toContain('Loop "Risk Review" policy');
  });

  it("preserves an existing decision reason", () => {
    const result = withNativeAgentLoopGuardMetadata({
      context,
      request: {
        toolName: "WebFetch",
        toolInput: {},
        toolUseID: "tool-1",
        decisionReason: "Existing permission reason",
      },
    });

    expect(result).toMatchObject({
      decisionReason: "Existing permission reason",
      loopGuardDecision: "deny",
      loopGuardLoopId: "loop-1",
    });
  });
});
