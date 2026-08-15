import type { LoopApprovalContinuation } from "./types";
import type {
  LoopApprovalReplayPlan,
  LoopApprovalReplayResult,
  LoopJson,
} from "./types";

export interface LoopApprovalReplayAdapter {
  actionName: string;
  capability: LoopApprovalContinuation["capability"];
  riskLevel: "low" | "medium" | "high";
  description: string;
  requiresConfirmation: boolean;
  execute: (input: {
    continuation: LoopApprovalContinuation;
    idempotencyKey: string;
  }) => Promise<LoopJson>;
}

export interface LoopApprovalReplayAdapterSummary {
  actionName: string;
  capability: LoopApprovalContinuation["capability"];
  riskLevel: LoopApprovalReplayAdapter["riskLevel"];
  description: string;
  requiresConfirmation: boolean;
}

function leafActionName(actionName: string): string {
  const parts = actionName.split("__").filter(Boolean);
  return parts.at(-1) ?? actionName;
}

function stablePart(value: string | null | undefined): string {
  return value?.trim() || "none";
}

function requiresReplayConfirmation(continuation: LoopApprovalContinuation) {
  return (
    continuation.capability === "write_external" ||
    continuation.capability === "dangerous"
  );
}

function shouldRedactKey(key: string): boolean {
  return /(authorization|cookie|password|secret|token|api[_-]?key|access[_-]?key)/i.test(
    key,
  );
}

export function sanitizeReplayToolInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeReplayToolInput(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : sanitizeReplayToolInput(child),
    ]),
  );
}

export function buildLoopApprovalReplayIdempotencyKey(
  continuation: LoopApprovalContinuation,
): string {
  return [
    "loop-approval-replay",
    continuation.loopId,
    continuation.approvalRequestId,
    stablePart(continuation.toolUseID),
    leafActionName(continuation.actionName),
  ].join(":");
}

export function buildLoopApprovalReplayConfirmationToken(
  continuation: LoopApprovalContinuation,
): string {
  return [
    "confirm-replay",
    continuation.approvalRequestId,
    stablePart(continuation.toolUseID),
    leafActionName(continuation.actionName),
  ].join(":");
}

export function createLoopApprovalReplayPlan(input: {
  continuation: LoopApprovalContinuation;
  adapters?: LoopApprovalReplayAdapter[];
  confirmationToken?: string | null;
}): LoopApprovalReplayPlan {
  const idempotencyKey = buildLoopApprovalReplayIdempotencyKey(
    input.continuation,
  );
  const confirmationRequired = requiresReplayConfirmation(input.continuation);
  const expectedConfirmationToken = confirmationRequired
    ? buildLoopApprovalReplayConfirmationToken(input.continuation)
    : null;
  const basePlan = {
    approvalRequestId: input.continuation.approvalRequestId,
    actionName: input.continuation.actionName,
    idempotencyKey,
    confirmationRequired,
    confirmationToken: expectedConfirmationToken,
  };
  if (input.continuation.status !== "consumed") {
    return {
      ...basePlan,
      status: "blocked",
      reason: `Continuation must be consumed before replay; current status is ${input.continuation.status}`,
    };
  }
  if (!input.continuation.toolInput) {
    return {
      ...basePlan,
      status: "blocked",
      reason: "Continuation has no tool input to replay",
    };
  }
  if (
    confirmationRequired &&
    input.confirmationToken !== expectedConfirmationToken
  ) {
    return {
      ...basePlan,
      status: "blocked",
      reason: `Replay confirmation is required for ${input.continuation.capability}`,
    };
  }

  const adapter = findReplayAdapter(input.continuation.actionName, input.adapters ?? []);
  if (!adapter) {
    return {
      ...basePlan,
      status: "blocked",
      reason: `No replay adapter is allowlisted for ${input.continuation.actionName}`,
    };
  }

  return {
    ...basePlan,
    status: "ready",
    reason: null,
  };
}

export function findReplayAdapter(
  actionName: string,
  adapters: LoopApprovalReplayAdapter[],
): LoopApprovalReplayAdapter | null {
  const leaf = leafActionName(actionName);
  return (
    adapters.find(
      (adapter) =>
        adapter.actionName === actionName || adapter.actionName === leaf,
    ) ?? null
  );
}

export function listLoopApprovalReplayAdapters(
  adapters: LoopApprovalReplayAdapter[] = DEFAULT_LOOP_APPROVAL_REPLAY_ADAPTERS,
): LoopApprovalReplayAdapterSummary[] {
  return adapters.map((adapter) => ({
    actionName: adapter.actionName,
    capability: adapter.capability,
    riskLevel: adapter.riskLevel,
    description: adapter.description,
    requiresConfirmation: adapter.requiresConfirmation,
  }));
}

function asRecord(value: unknown): LoopJson | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LoopJson)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function hasApprovalReplayHistory(input: {
  stateJson: LoopJson;
  idempotencyKey: string;
}): boolean {
  return asArray(input.stateJson.approvalReplayHistory).some((item) => {
    const record = asRecord(item);
    return record?.idempotencyKey === input.idempotencyKey;
  });
}

export function appendApprovalReplayHistory(input: {
  stateJson: LoopJson;
  replayResult: LoopApprovalReplayResult;
  recordedAt?: Date;
}): LoopJson {
  return {
    ...input.stateJson,
    approvalReplayHistory: [
      ...asArray(input.stateJson.approvalReplayHistory),
      {
        idempotencyKey: input.replayResult.idempotencyKey,
        approvalRequestId: input.replayResult.approvalRequestId,
        actionName: input.replayResult.actionName,
        status: input.replayResult.status,
        reason: input.replayResult.reason ?? null,
        adapterResult: input.replayResult.adapterResult ?? null,
        recordedAt: (input.recordedAt ?? new Date()).toISOString(),
      },
    ],
  };
}

export async function runLoopApprovalReplayAdapter(input: {
  continuation: LoopApprovalContinuation;
  adapters: LoopApprovalReplayAdapter[];
  confirmationToken?: string | null;
}): Promise<LoopApprovalReplayResult> {
  const plan = createLoopApprovalReplayPlan(input);
  if (plan.status === "blocked") {
    return {
      status: "blocked",
      approvalRequestId: plan.approvalRequestId,
      actionName: plan.actionName,
      idempotencyKey: plan.idempotencyKey,
      outputSummary: plan.reason ?? "Replay blocked",
      reason: plan.reason,
    };
  }

  const adapter = findReplayAdapter(input.continuation.actionName, input.adapters);
  if (!adapter) {
    return {
      status: "blocked",
      approvalRequestId: plan.approvalRequestId,
      actionName: plan.actionName,
      idempotencyKey: plan.idempotencyKey,
      outputSummary: "Replay adapter disappeared before execution",
      reason: "Replay adapter disappeared before execution",
    };
  }

  try {
    const adapterResult = await adapter.execute({
      continuation: input.continuation,
      idempotencyKey: plan.idempotencyKey,
    });
    return {
      status: "success",
      approvalRequestId: plan.approvalRequestId,
      actionName: plan.actionName,
      idempotencyKey: plan.idempotencyKey,
      outputSummary: `Replay adapter executed for ${plan.actionName}.`,
      adapterResult,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      approvalRequestId: plan.approvalRequestId,
      actionName: plan.actionName,
      idempotencyKey: plan.idempotencyKey,
      outputSummary: reason,
      reason,
    };
  }
}

export function createRecordLoopAuditReplayAdapter(): LoopApprovalReplayAdapter {
  return {
    actionName: "recordLoopAudit",
    capability: "write_internal",
    riskLevel: "low",
    description:
      "将已批准的续跑记录为内部循环审计产物。",
    requiresConfirmation: false,
    execute: async ({ continuation, idempotencyKey }) => ({
      type: "loop_replay_audit_record",
      idempotencyKey,
      approvalRequestId: continuation.approvalRequestId,
      loopId: continuation.loopId,
      loopRunId: continuation.loopRunId,
      actionName: continuation.actionName,
      capability: continuation.capability,
      toolUseID: continuation.toolUseID,
      approvedBy: continuation.approvedBy,
      approvedAt: continuation.approvedAt,
      reason: continuation.reason,
      sanitizedToolInput: sanitizeReplayToolInput(continuation.toolInput),
      recordedAt: new Date().toISOString(),
    }),
  };
}

export function createDraftExternalReplyReplayAdapter(): LoopApprovalReplayAdapter {
  return {
    actionName: "draftExternalReply",
    capability: "write_external",
    riskLevel: "medium",
    description:
      "创建已批准的外部回复草稿，不会实际发送。",
    requiresConfirmation: true,
    execute: async ({ continuation, idempotencyKey }) => {
      const toolInput = asRecord(continuation.toolInput) ?? {};
      return {
        type: "loop_external_reply_draft",
        idempotencyKey,
        approvalRequestId: continuation.approvalRequestId,
        loopId: continuation.loopId,
        sourceActionName: continuation.actionName,
        toolUseID: continuation.toolUseID,
        draft: sanitizeReplayToolInput({
          channel: toolInput.channel ?? toolInput.platform ?? null,
          recipient: toolInput.recipient ?? toolInput.to ?? null,
          subject: toolInput.subject ?? null,
          body: toolInput.body ?? toolInput.message ?? toolInput.content ?? null,
          context: toolInput.context ?? null,
        }),
        sent: false,
        requiresFinalSendAdapter: true,
        recordedAt: new Date().toISOString(),
      };
    },
  };
}

export const DEFAULT_LOOP_APPROVAL_REPLAY_ADAPTERS: LoopApprovalReplayAdapter[] =
  [
    createRecordLoopAuditReplayAdapter(),
    createDraftExternalReplyReplayAdapter(),
  ];
