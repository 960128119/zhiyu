import { describe, expect, it } from "vitest";
import {
  chatLoopGuardContextFromLoop,
  evaluateChatToolActionGuard,
} from "@/lib/loops";
import type { Loop } from "@/lib/db/schema";

describe("chat loop guard", () => {
  it("evaluates chat tool actions in advisory mode from loop context", () => {
    const context = chatLoopGuardContextFromLoop({
      id: "loop-1",
      name: "Customer Reply Loop",
      actionPolicy: {},
      approvalPolicy: {
        externalWrites: "require_approval",
      },
    } as Pick<Loop, "id" | "name" | "actionPolicy" | "approvalPolicy">);

    const result = evaluateChatToolActionGuard({
      context,
      toolName: "mcp__business-tools__sendReply",
    });

    expect(result).toMatchObject({
      mode: "advisory",
      blocked: false,
      requiresApproval: true,
    });
    expect(result.decisions[0]).toMatchObject({
      behavior: "audit",
      decision: "require_approval",
    });
  });
});
