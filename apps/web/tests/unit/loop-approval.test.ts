import { describe, expect, it } from "vitest";
import {
  classifyLoopAction,
  decideLoopActionApproval,
  evaluateLoopApprovals,
  extractActionNamesFromJobResult,
} from "@/lib/loops";

describe("loop approval policy", () => {
  it("classifies common action names", () => {
    expect(classifyLoopAction("searchUnifiedMemory")).toBe("read");
    expect(classifyLoopAction("modifyInsight")).toBe("write_internal");
    expect(classifyLoopAction("sendMessage")).toBe("write_external");
    expect(classifyLoopAction("Bash")).toBe("dangerous");
  });

  it("requires approval for external writes by default", () => {
    const decision = decideLoopActionApproval({
      actionName: "sendEmail",
      actionPolicy: {},
      approvalPolicy: {},
    });

    expect(decision).toMatchObject({
      capability: "write_external",
      decision: "require_approval",
    });
  });

  it("honors explicit allowed, requires approval, and denied action lists", () => {
    expect(
      decideLoopActionApproval({
        actionName: "sendMessage",
        actionPolicy: { allowed: ["sendMessage"] },
        approvalPolicy: { externalWrites: "require_approval" },
      }).decision,
    ).toBe("allow");

    expect(
      decideLoopActionApproval({
        actionName: "modifyInsight",
        actionPolicy: { requiresApproval: ["modifyInsight"] },
        approvalPolicy: { defaultMode: "allow" },
      }).decision,
    ).toBe("require_approval");

    expect(
      decideLoopActionApproval({
        actionName: "deleteInsight",
        actionPolicy: { denied: ["deleteInsight"] },
        approvalPolicy: { defaultMode: "allow" },
      }).decision,
    ).toBe("deny");
  });

  it("denies dangerous actions even when default mode allows", () => {
    const decision = decideLoopActionApproval({
      actionName: "sudo rm -rf",
      actionPolicy: {},
      approvalPolicy: { defaultMode: "allow", externalWrites: "allow" },
    });

    expect(decision).toMatchObject({
      capability: "dangerous",
      decision: "deny",
    });
  });

  it("extracts suggested action names from structured job results", () => {
    const actions = extractActionNamesFromJobResult({
      status: "success",
      duration: 1,
      result: {
        structuredReport: {
          suggestedActions: [
            { type: "send_message", label: "Send Slack update" },
            { type: "create_task", label: "Create Jira follow-up" },
          ],
        },
      },
    });

    expect(actions).toEqual([
      "Create Jira follow-up",
      "Send Slack update",
      "create_task",
      "send_message",
    ]);
  });

  it("summarizes loop approval evaluation", () => {
    const evaluation = evaluateLoopApprovals({
      actionNames: ["searchUnifiedMemory", "sendMessage", "Bash"],
      actionPolicy: {},
      approvalPolicy: {},
    });

    expect(evaluation.requiresApproval).toBe(true);
    expect(evaluation.denied).toBe(true);
    expect(evaluation.decisions.map((decision) => decision.decision)).toEqual([
      "allow",
      "require_approval",
      "deny",
    ]);
  });
});
