import {
  decideLoopActionApproval,
  type LoopActionApprovalDecision,
} from "./approval";
import type { LoopJson } from "./types";

export interface LoopToolGateDecision extends LoopActionApprovalDecision {
  behavior: "allow" | "deny";
  message?: string;
  toolInput?: Record<string, unknown>;
  toolUseID?: string;
}

export interface LoopToolGateEvaluation {
  decisions: LoopToolGateDecision[];
  denied: boolean;
  requiresApproval: boolean;
}

export interface LoopPermissionRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID: string;
  decisionReason?: string;
  blockedPath?: string;
}

export interface LoopPermissionResult {
  behavior: "allow" | "deny";
  updatedInput?: Record<string, unknown>;
  message?: string;
}

function permissionMessage(decision: LoopActionApprovalDecision): string {
  if (decision.decision === "require_approval") {
    return `Loop tool gate requires human approval for ${decision.actionName}: ${decision.reason}`;
  }
  return `Loop tool gate denied ${decision.actionName}: ${decision.reason}`;
}

export function decideLoopToolPermission(input: {
  toolName: string;
  actionPolicy: LoopJson;
  approvalPolicy: LoopJson;
  toolInput?: Record<string, unknown>;
  toolUseID?: string;
}): LoopToolGateDecision {
  const decision = decideLoopActionApproval({
    actionName: input.toolName,
    actionPolicy: input.actionPolicy,
    approvalPolicy: input.approvalPolicy,
  });

  if (decision.decision === "allow") {
    return {
      ...decision,
      behavior: "allow",
      toolInput: input.toolInput,
      toolUseID: input.toolUseID,
    };
  }

  return {
    ...decision,
    behavior: "deny",
    message: permissionMessage(decision),
    toolInput: input.toolInput,
    toolUseID: input.toolUseID,
  };
}

export function createLoopToolPermissionHandler(input: {
  actionPolicy: LoopJson;
  approvalPolicy: LoopJson;
  onDecision?: (decision: LoopToolGateDecision) => void;
}) {
  return async (
    request: LoopPermissionRequest,
  ): Promise<LoopPermissionResult> => {
    const decision = decideLoopToolPermission({
      toolName: request.toolName,
      actionPolicy: input.actionPolicy,
      approvalPolicy: input.approvalPolicy,
      toolInput: request.toolInput,
      toolUseID: request.toolUseID,
    });
    input.onDecision?.(decision);

    if (decision.behavior === "allow") {
      return {
        behavior: "allow",
        updatedInput: request.toolInput,
      };
    }

    return {
      behavior: "deny",
      message: decision.message,
    };
  };
}

export function summarizeLoopToolGate(
  decisions: LoopToolGateDecision[],
): LoopToolGateEvaluation {
  return {
    decisions,
    denied: decisions.some((decision) => decision.behavior === "deny"),
    requiresApproval: decisions.some(
      (decision) => decision.decision === "require_approval",
    ),
  };
}
