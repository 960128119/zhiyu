import type { JobExecutionResult } from "@/lib/cron/types";
import type { LoopApprovalRequest } from "@/lib/db/schema";
import {
  completeLoopRun,
  createLoopRun,
  getLoop,
  getLoopApprovalRequest,
  getLoopState,
  updateLoopApprovalRequestPayload,
  upsertLoopState,
} from "./service";
import {
  appendApprovalReplayHistory,
  buildLoopApprovalReplayIdempotencyKey,
  DEFAULT_LOOP_APPROVAL_REPLAY_ADAPTERS,
  hasApprovalReplayHistory,
  runLoopApprovalReplayAdapter,
  type LoopApprovalReplayAdapter,
} from "./approval-replay";
import type {
  LoopApprovalContinuation,
  LoopApprovalContinuationConsumption,
  LoopApprovalReplayResult,
  LoopJson,
} from "./types";

function asRecord(value: unknown): LoopJson | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LoopJson)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isContinuation(value: unknown): value is LoopApprovalContinuation {
  const record = asRecord(value);
  return (
    record?.type === "tool_call" &&
    typeof record.approvalRequestId === "string" &&
    typeof record.actionName === "string"
  );
}

export function getApprovalRequestContinuation(
  request: LoopApprovalRequest,
): LoopApprovalContinuation | null {
  const actionPayload = asRecord(request.actionPayload);
  const continuation = actionPayload?.continuation;
  return isContinuation(continuation) ? continuation : null;
}

export function findPendingApprovalContinuation(input: {
  stateJson: LoopJson;
  approvalRequestId: string;
}): LoopApprovalContinuation | null {
  const found = asArray(input.stateJson.pendingApprovalContinuations).find(
    (item) =>
      isContinuation(item) &&
      item.approvalRequestId === input.approvalRequestId,
  );

  return isContinuation(found) ? found : null;
}

export function consumeApprovalContinuationState(input: {
  stateJson: LoopJson;
  continuation: LoopApprovalContinuation;
  consumedBy: string;
  consumedAt?: Date;
  note?: string | null;
}): LoopJson {
  const consumedAt = (input.consumedAt ?? new Date()).toISOString();
  const consumedContinuation: LoopApprovalContinuation = {
    ...input.continuation,
    status: "consumed",
  };
  const consumption: LoopApprovalContinuationConsumption = {
    continuation: consumedContinuation,
    consumedBy: input.consumedBy,
    consumedAt,
    result: "recorded",
    note: input.note ?? null,
  };

  return {
    ...input.stateJson,
    pendingApprovalContinuations: asArray(
      input.stateJson.pendingApprovalContinuations,
    ).filter(
      (item) =>
        !(
          isContinuation(item) &&
          item.approvalRequestId === input.continuation.approvalRequestId
        ),
    ),
    consumedApprovalContinuations: [
      ...asArray(input.stateJson.consumedApprovalContinuations),
      consumption,
    ],
    lastConsumedApprovalRequestId: input.continuation.approvalRequestId,
  };
}

export function buildLoopApprovalResumeResult(input: {
  continuation: LoopApprovalContinuation;
  note?: string | null;
}): JobExecutionResult {
  return {
    status: "success",
    duration: 0,
    output: `Approved continuation recorded for ${input.continuation.actionName}.`,
    result: {
      executionMode: "approval_continuation_resume",
      continuation: input.continuation,
      structuredReport: {
        summary: `Approval continuation recorded for ${input.continuation.actionName}.`,
        subtitle: "No external tool call was executed by this resume step.",
        outcome:
          "The approved continuation was consumed and recorded as a durable loop run.",
        reasoningChain: [
          {
            stepType: "input",
            summary: "Loaded approved continuation",
            description: input.continuation.reason ?? input.continuation.actionName,
            sourceType: "system",
            sourceLabel: "Loop approval",
          },
          {
            stepType: "action",
            summary: "Consumed continuation",
            description:
              input.note ??
              "Continuation was marked consumed for a later replay executor.",
            sourceType: "system",
            sourceLabel: "Loop runtime",
          },
        ],
        suggestedActions: [],
      },
    },
  };
}

export async function resumeLoopApprovalContinuation(input: {
  userId: string;
  approvalRequestId: string;
  note?: string | null;
}): Promise<{
  approvalRequest: LoopApprovalRequest;
  continuation: LoopApprovalContinuation;
  loopRunId: string;
}> {
  const approvalRequest = await getLoopApprovalRequest(
    input.userId,
    input.approvalRequestId,
  );
  if (!approvalRequest) {
    throw new Error("Approval request not found");
  }
  if (approvalRequest.status !== "approved") {
    throw new Error("Only approved requests can be resumed");
  }

  const continuation = getApprovalRequestContinuation(approvalRequest);
  if (!continuation) {
    throw new Error("Approval request has no continuation payload");
  }
  if (continuation.status !== "ready") {
    throw new Error(`Continuation is ${continuation.status}`);
  }

  const loop = await getLoop(input.userId, approvalRequest.loopId);
  if (!loop) {
    throw new Error("Loop not found");
  }

  const state = await getLoopState(loop.id);
  const stateJson = state?.stateJson ?? {};
  const pendingContinuation = findPendingApprovalContinuation({
    stateJson,
    approvalRequestId: approvalRequest.id,
  });
  if (!pendingContinuation) {
    throw new Error("Continuation is not pending on loop state");
  }

  const loopRun = await createLoopRun({
    loopId: loop.id,
    status: "running",
    triggerReason: {
      type: "approval_continuation_resume",
      approvalRequestId: approvalRequest.id,
      triggeredBy: "manual",
    },
    inputSnapshot: {
      continuation: pendingContinuation,
      note: input.note ?? null,
    },
  });
  const result = buildLoopApprovalResumeResult({
    continuation: pendingContinuation,
    note: input.note ?? null,
  });

  await completeLoopRun(loopRun.id, {
    status: "success",
    outputSummary: result.output ?? null,
    verificationResult: {
      type: "approval_continuation_resume",
      passed: true,
      continuation: pendingContinuation,
      checkedAt: new Date().toISOString(),
    },
  });

  const consumedStateJson = consumeApprovalContinuationState({
    stateJson,
    continuation: pendingContinuation,
    consumedBy: input.userId,
    note: input.note ?? null,
  });

  await upsertLoopState(loop.id, {
    currentPhase: "idle",
    lastObservation: `Approval continuation consumed for ${pendingContinuation.actionName}`,
    nextAction: "Continue normal loop execution",
    blockedReason: null,
    stateJson: {
      ...consumedStateJson,
      lastLoopRunId: loopRun.id,
      lastApprovalResumeRunId: loopRun.id,
    },
  });

  const updatedPayload = {
    ...(asRecord(approvalRequest.actionPayload) ?? {}),
    continuation: {
      ...continuation,
      status: "consumed",
    },
    consumedAt: new Date().toISOString(),
    consumedBy: input.userId,
  };
  const updatedRequest = await updateLoopApprovalRequestPayload(
    input.userId,
    approvalRequest.id,
    updatedPayload,
  );

  return {
    approvalRequest: updatedRequest ?? approvalRequest,
    continuation: {
      ...continuation,
      status: "consumed",
    },
    loopRunId: loopRun.id,
  };
}

export async function replayLoopApprovalContinuation(input: {
  userId: string;
  approvalRequestId: string;
  confirmationToken?: string | null;
  adapters?: LoopApprovalReplayAdapter[];
}): Promise<{
  approvalRequest: LoopApprovalRequest;
  replayResult: LoopApprovalReplayResult;
  loopRunId: string;
}> {
  const approvalRequest = await getLoopApprovalRequest(
    input.userId,
    input.approvalRequestId,
  );
  if (!approvalRequest) {
    throw new Error("Approval request not found");
  }
  if (approvalRequest.status !== "approved") {
    throw new Error("Only approved requests can be replayed");
  }

  const continuation = getApprovalRequestContinuation(approvalRequest);
  if (!continuation) {
    throw new Error("Approval request has no continuation payload");
  }

  const loop = await getLoop(input.userId, approvalRequest.loopId);
  if (!loop) {
    throw new Error("Loop not found");
  }

  const state = await getLoopState(loop.id);
  const stateJson = state?.stateJson ?? {};
  const adapters = input.adapters ?? DEFAULT_LOOP_APPROVAL_REPLAY_ADAPTERS;
  const idempotencyKey = buildLoopApprovalReplayIdempotencyKey(continuation);
  const replayAlreadyRecorded = hasApprovalReplayHistory({
    stateJson,
    idempotencyKey,
  });
  const replayResult = replayAlreadyRecorded
    ? {
        status: "blocked" as const,
        approvalRequestId: continuation.approvalRequestId,
        actionName: continuation.actionName,
        idempotencyKey,
        outputSummary: `Replay already recorded for ${continuation.actionName}.`,
        reason: "Replay idempotency key has already been recorded",
      }
    : await runLoopApprovalReplayAdapter({
        continuation,
        adapters,
        confirmationToken: input.confirmationToken ?? null,
      });
  const loopRun = await createLoopRun({
    loopId: loop.id,
    status: "running",
    triggerReason: {
      type: "approval_continuation_replay",
      approvalRequestId: approvalRequest.id,
      idempotencyKey: replayResult.idempotencyKey,
      triggeredBy: "manual",
    },
    inputSnapshot: {
      continuation,
      replayResult: {
        status: replayResult.status,
        reason: replayResult.reason ?? null,
      },
    },
  });

  await completeLoopRun(loopRun.id, {
    status: replayResult.status === "success" ? "success" : "blocked",
    outputSummary: replayResult.outputSummary,
    verificationResult: {
      type: "approval_continuation_replay",
      passed: replayResult.status === "success",
      idempotencyKey: replayResult.idempotencyKey,
      replayResult,
      checkedAt: new Date().toISOString(),
    },
    error:
      replayResult.status === "failed" ? replayResult.reason ?? null : null,
  });

  const replayStateJson = replayAlreadyRecorded
    ? stateJson
    : appendApprovalReplayHistory({
        stateJson,
        replayResult,
      });
  await upsertLoopState(loop.id, {
    currentPhase: replayResult.status === "success" ? "idle" : "blocked",
    lastObservation: replayResult.outputSummary,
    nextAction:
      replayResult.status === "success"
        ? "Continue normal loop execution"
        : "Review replay adapter allowlist or execution failure",
    blockedReason:
      replayResult.status === "success" ? null : replayResult.reason ?? null,
    stateJson: {
      ...replayStateJson,
      lastLoopRunId: loopRun.id,
      lastApprovalReplayRunId: loopRun.id,
      lastApprovalReplayResult: replayResult,
    },
  });

  return {
    approvalRequest,
    replayResult,
    loopRunId: loopRun.id,
  };
}
