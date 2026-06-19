import type { JobExecutionResult } from "@/lib/cron/types";
import type { StructuredExecutionOutput } from "@/lib/types/execution-result";
import { loopActionPolicySchema, loopApprovalPolicySchema } from "./spec";
import type { LoopJson } from "./types";

export type LoopCapabilityClass =
  | "read"
  | "write_internal"
  | "write_external"
  | "dangerous";

export type LoopApprovalDecisionStatus = "allow" | "require_approval" | "deny";

export interface LoopActionApprovalDecision {
  actionName: string;
  capability: LoopCapabilityClass;
  decision: LoopApprovalDecisionStatus;
  reason: string;
}

export interface LoopApprovalEvaluation {
  decisions: LoopActionApprovalDecision[];
  requiresApproval: boolean;
  denied: boolean;
  evaluatedAt: string;
}

const READ_PREFIXES = [
  "read",
  "get",
  "list",
  "search",
  "query",
  "fetch",
  "download",
  "chatinsight",
  "searchunifiedmemory",
  "searchmemorypath",
];

const INTERNAL_WRITE_PREFIXES = [
  "createinsight",
  "modifyinsight",
  "updateinsight",
  "save",
  "write",
  "createnote",
  "updateloop",
  "createscheduledjob",
  "updatescheduledjob",
];

const EXTERNAL_WRITE_PREFIXES = [
  "send",
  "reply",
  "email",
  "createcalendar",
  "modifyexternal",
  "updatejira",
  "createjira",
  "hubspot",
  "asana",
  "slack",
  "telegram",
  "whatsapp",
  "gmail",
];

const DANGEROUS_PREFIXES = [
  "bash",
  "shell",
  "exec",
  "sudo",
  "delete",
  "remove",
  "drop",
  "truncate",
  "rm",
];

function normalizeActionName(actionName: string): string {
  const leafName = actionName.includes("__")
    ? (actionName.split("__").pop() ?? actionName)
    : actionName;
  return leafName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function matchesAnyPrefix(normalized: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

export function classifyLoopAction(actionName: string): LoopCapabilityClass {
  const normalized = normalizeActionName(actionName);

  if (matchesAnyPrefix(normalized, DANGEROUS_PREFIXES)) {
    return "dangerous";
  }
  if (matchesAnyPrefix(normalized, READ_PREFIXES)) {
    return "read";
  }
  if (matchesAnyPrefix(normalized, INTERNAL_WRITE_PREFIXES)) {
    return "write_internal";
  }
  if (matchesAnyPrefix(normalized, EXTERNAL_WRITE_PREFIXES)) {
    return "write_external";
  }

  return "write_external";
}

function actionListed(actionName: string, list: string[]): boolean {
  const normalized = normalizeActionName(actionName);
  return list.some((item) => normalizeActionName(item) === normalized);
}

export function decideLoopActionApproval(input: {
  actionName: string;
  actionPolicy: LoopJson;
  approvalPolicy: LoopJson;
}): LoopActionApprovalDecision {
  const actionPolicy = loopActionPolicySchema.parse(input.actionPolicy ?? {});
  const approvalPolicy = loopApprovalPolicySchema.parse(
    input.approvalPolicy ?? {},
  );
  const capability = classifyLoopAction(input.actionName);

  if (actionListed(input.actionName, actionPolicy.denied)) {
    return {
      actionName: input.actionName,
      capability,
      decision: "deny",
      reason: "Action is explicitly denied by loop action policy",
    };
  }

  if (capability === "dangerous") {
    return {
      actionName: input.actionName,
      capability,
      decision: "deny",
      reason: "Dangerous capability is denied by default",
    };
  }

  if (actionListed(input.actionName, actionPolicy.requiresApproval)) {
    return {
      actionName: input.actionName,
      capability,
      decision: "require_approval",
      reason: "Action is explicitly marked as requiring approval",
    };
  }

  if (actionListed(input.actionName, actionPolicy.allowed)) {
    return {
      actionName: input.actionName,
      capability,
      decision: "allow",
      reason: "Action is explicitly allowed by loop action policy",
    };
  }

  if (capability === "write_external") {
    return {
      actionName: input.actionName,
      capability,
      decision: approvalPolicy.externalWrites,
      reason: "External write follows loop external write approval policy",
    };
  }

  return {
    actionName: input.actionName,
    capability,
    decision: approvalPolicy.defaultMode,
    reason: "Action follows loop default approval policy",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractStructuredReport(
  result: JobExecutionResult,
): StructuredExecutionOutput | null {
  const report = asRecord(result.result).structuredReport;
  return report && typeof report === "object"
    ? (report as StructuredExecutionOutput)
    : null;
}

export function extractActionNamesFromJobResult(
  result: JobExecutionResult,
): string[] {
  const names = new Set<string>();
  const report = extractStructuredReport(result);
  const resultData = asRecord(result.result);
  const toolGate = asRecord(resultData.toolGate);
  const toolGateDecisions = Array.isArray(toolGate.decisions)
    ? toolGate.decisions
    : [];

  for (const action of report?.suggestedActions ?? []) {
    names.add(action.type);
    if (action.label) names.add(action.label);
  }

  for (const decision of toolGateDecisions) {
    const record = asRecord(decision);
    if (typeof record.actionName === "string") {
      names.add(record.actionName);
    }
  }

  return [...names].filter((name) => name.trim().length > 0).sort();
}

export function evaluateLoopApprovals(input: {
  actionNames: string[];
  actionPolicy: LoopJson;
  approvalPolicy: LoopJson;
}): LoopApprovalEvaluation {
  const decisions = input.actionNames.map((actionName) =>
    decideLoopActionApproval({
      actionName,
      actionPolicy: input.actionPolicy,
      approvalPolicy: input.approvalPolicy,
    }),
  );

  return {
    decisions,
    requiresApproval: decisions.some(
      (decision) => decision.decision === "require_approval",
    ),
    denied: decisions.some((decision) => decision.decision === "deny"),
    evaluatedAt: new Date().toISOString(),
  };
}
