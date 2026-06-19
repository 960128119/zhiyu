import { describe, expect, it } from "vitest";
import {
  classifyLoopAction,
  createLoopToolPermissionHandler,
  decideLoopToolPermission,
  extractActionNamesFromJobResult,
  summarizeLoopToolGate,
} from "@/lib/loops";
import type { JobExecutionResult } from "@/lib/cron/types";

describe("loop tool gate", () => {
  it("classifies MCP-prefixed external write tools by leaf name", () => {
    expect(classifyLoopAction("mcp__business-tools__sendReply")).toBe(
      "write_external",
    );
  });

  it("denies tools that require approval in non-interactive loop execution", () => {
    const decision = decideLoopToolPermission({
      toolName: "mcp__business-tools__sendReply",
      actionPolicy: {
        allowed: ["chatInsight"],
        requiresApproval: ["sendReply"],
        denied: [],
      },
      approvalPolicy: {
        defaultMode: "allow",
        externalWrites: "require_approval",
      },
    });

    expect(decision).toMatchObject({
      actionName: "mcp__business-tools__sendReply",
      capability: "write_external",
      decision: "require_approval",
      behavior: "deny",
    });
  });

  it("allows explicitly approved read tools", async () => {
    const decisions: unknown[] = [];
    const handler = createLoopToolPermissionHandler({
      actionPolicy: {
        allowed: ["chatInsight"],
        requiresApproval: [],
        denied: [],
      },
      approvalPolicy: {
        defaultMode: "allow",
        externalWrites: "require_approval",
      },
      onDecision: (decision) => decisions.push(decision),
    });

    const result = await handler({
      toolName: "mcp__business-tools__chatInsight",
      toolInput: { query: "risk" },
      toolUseID: "tool-1",
    });

    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { query: "risk" },
    });
    expect(summarizeLoopToolGate(decisions as never[])).toMatchObject({
      denied: false,
      requiresApproval: false,
    });
    expect(decisions[0]).toMatchObject({
      toolInput: { query: "risk" },
      toolUseID: "tool-1",
    });
  });

  it("adds tool gate decisions to approval action extraction", () => {
    const result: JobExecutionResult = {
      status: "success",
      duration: 0,
      result: {
        toolGate: {
          decisions: [
            {
              actionName: "mcp__business-tools__sendReply",
              decision: "require_approval",
            },
          ],
        },
        structuredReport: {
          suggestedActions: [
            {
              type: "custom",
              label: "Draft follow-up",
              requiresConfirmation: true,
            },
          ],
        },
      },
    };

    expect(extractActionNamesFromJobResult(result)).toContain(
      "mcp__business-tools__sendReply",
    );
  });
});
