import type { LoopApprovalRequest } from "@/lib/db/schema";
import type { LoopApprovalContinuation, LoopJson } from "./types";

function asRecord(value: unknown): LoopJson | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LoopJson)
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function buildLoopApprovalContinuation(input: {
  request: LoopApprovalRequest;
  approvedBy: string;
  approvedAt?: Date;
  resumeMode?: LoopApprovalContinuation["resumeMode"];
}): LoopApprovalContinuation {
  const actionPayload = asRecord(input.request.actionPayload);
  const toolInput = asRecord(input.request.toolInput);
  const toolUseID = stringOrNull(actionPayload?.toolUseID);
  const approvedAt = input.approvedAt ?? new Date();

  return {
    type: "tool_call",
    status: toolInput ? "ready" : "not_resumable",
    approvalRequestId: input.request.id,
    loopId: input.request.loopId,
    loopRunId: input.request.loopRunId,
    actionName: input.request.actionName,
    capability: input.request.capability,
    toolUseID,
    toolInput,
    approvedBy: input.approvedBy,
    approvedAt: approvedAt.toISOString(),
    resumeMode: input.resumeMode ?? "manual_review",
    reason: input.request.reason,
  };
}

export function mergeLoopApprovalContinuationPayload(input: {
  existingPayload: LoopJson | null;
  continuation: LoopApprovalContinuation;
}): LoopJson {
  return {
    ...(input.existingPayload ?? {}),
    continuation: input.continuation,
  };
}
