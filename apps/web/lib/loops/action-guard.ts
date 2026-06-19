import {
  decideLoopActionApproval,
  type LoopActionApprovalDecision,
} from "./approval";
import type { LoopJson } from "./types";

export type LoopActionGuardMode = "advisory" | "enforce";

export interface LoopActionGuardDecision extends LoopActionApprovalDecision {
  mode: LoopActionGuardMode;
  behavior: "allow" | "block" | "audit";
}

export interface LoopActionGuardResult {
  mode: LoopActionGuardMode;
  decisions: LoopActionGuardDecision[];
  allowed: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  denied: boolean;
  evaluatedAt: string;
}

function guardBehavior(
  decision: LoopActionApprovalDecision,
  mode: LoopActionGuardMode,
): LoopActionGuardDecision["behavior"] {
  if (decision.decision === "allow") return "allow";
  if (mode === "advisory") return "audit";
  return "block";
}

export function evaluateLoopActionGuard(input: {
  actionNames: string[];
  actionPolicy: LoopJson;
  approvalPolicy: LoopJson;
  mode?: LoopActionGuardMode;
}): LoopActionGuardResult {
  const mode = input.mode ?? "advisory";
  const decisions = [...new Set(input.actionNames)]
    .filter((name) => name.trim().length > 0)
    .sort()
    .map((actionName) => {
      const decision = decideLoopActionApproval({
        actionName,
        actionPolicy: input.actionPolicy,
        approvalPolicy: input.approvalPolicy,
      });
      return {
        ...decision,
        mode,
        behavior: guardBehavior(decision, mode),
      };
    });
  const blocked = decisions.some((decision) => decision.behavior === "block");

  return {
    mode,
    decisions,
    allowed: !blocked,
    blocked,
    requiresApproval: decisions.some(
      (decision) => decision.decision === "require_approval",
    ),
    denied: decisions.some((decision) => decision.decision === "deny"),
    evaluatedAt: new Date().toISOString(),
  };
}
