import { describe, expect, it } from "vitest";
import { evaluateLoopActionGuard } from "@/lib/loops";

describe("loop action guard", () => {
  it("audits approval-required actions in advisory mode", () => {
    const result = evaluateLoopActionGuard({
      mode: "advisory",
      actionNames: ["sendReply"],
      actionPolicy: {},
      approvalPolicy: {
        externalWrites: "require_approval",
      },
    });

    expect(result).toMatchObject({
      mode: "advisory",
      allowed: true,
      blocked: false,
      requiresApproval: true,
    });
    expect(result.decisions[0]).toMatchObject({
      actionName: "sendReply",
      decision: "require_approval",
      behavior: "audit",
    });
  });

  it("blocks approval-required actions in enforce mode", () => {
    const result = evaluateLoopActionGuard({
      mode: "enforce",
      actionNames: ["sendReply"],
      actionPolicy: {},
      approvalPolicy: {
        externalWrites: "require_approval",
      },
    });

    expect(result).toMatchObject({
      mode: "enforce",
      allowed: false,
      blocked: true,
      requiresApproval: true,
    });
    expect(result.decisions[0]).toMatchObject({
      actionName: "sendReply",
      behavior: "block",
    });
  });
});
