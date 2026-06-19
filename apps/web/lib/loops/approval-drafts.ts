import type { LoopJson } from "./types";

export type LoopExternalDraftStatus =
  | "draft"
  | "needs_revision"
  | "ready_to_send"
  | "discarded";

export interface LoopExternalReplyDraft {
  id: string;
  approvalRequestId: string;
  idempotencyKey: string;
  loopId: string;
  actionName: string;
  status: LoopExternalDraftStatus;
  draft: {
    channel: unknown;
    recipient: unknown;
    subject: unknown;
    body: unknown;
    context: unknown;
  };
  sent: false;
  requiresFinalSendAdapter: true;
  recordedAt: string | null;
  updatedAt: string | null;
}

export interface LoopExternalReplyDraftEligibility {
  eligible: boolean;
  reasons: string[];
  finalSendIdempotencyKey: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toDraftItem(record: Record<string, unknown>): LoopExternalReplyDraft | null {
  const adapterResult = asRecord(record.adapterResult);
  if (adapterResult?.type !== "loop_external_reply_draft") return null;

  const draft = asRecord(adapterResult.draft) ?? {};
  const idempotencyKey = stringOrNull(adapterResult.idempotencyKey);
  const approvalRequestId = stringOrNull(adapterResult.approvalRequestId);
  const loopId = stringOrNull(adapterResult.loopId);
  if (!idempotencyKey || !approvalRequestId || !loopId) return null;

  return {
    id: idempotencyKey,
    approvalRequestId,
    idempotencyKey,
    loopId,
    actionName:
      stringOrNull(adapterResult.sourceActionName) ??
      stringOrNull(record.actionName) ??
      "draftExternalReply",
    status:
      adapterResult.status === "needs_revision" ||
      adapterResult.status === "ready_to_send" ||
      adapterResult.status === "discarded"
        ? adapterResult.status
        : "draft",
    draft: {
      channel: draft.channel ?? null,
      recipient: draft.recipient ?? null,
      subject: draft.subject ?? null,
      body: draft.body ?? null,
      context: draft.context ?? null,
    },
    sent: false,
    requiresFinalSendAdapter: true,
    recordedAt: stringOrNull(adapterResult.recordedAt),
    updatedAt: stringOrNull(adapterResult.updatedAt),
  };
}

export function listExternalReplyDraftsFromState(
  stateJson: LoopJson,
): LoopExternalReplyDraft[] {
  return asArray(stateJson.approvalReplayHistory)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(toDraftItem)
    .filter((item): item is LoopExternalReplyDraft => Boolean(item));
}

export function evaluateExternalReplyDraftEligibility(
  draft: LoopExternalReplyDraft,
): LoopExternalReplyDraftEligibility {
  const reasons: string[] = [];
  if (draft.status !== "ready_to_send") {
    reasons.push("Draft must be marked ready_to_send");
  }
  if (draft.sent !== false) {
    reasons.push("Draft has already been sent");
  }
  if (draft.requiresFinalSendAdapter !== true) {
    reasons.push("Draft is not configured for a final send adapter");
  }
  if (!stringOrNull(draft.idempotencyKey)) {
    reasons.push("Draft is missing an idempotency key");
  }
  if (!stringOrNull(draft.draft.recipient)) {
    reasons.push("Draft recipient is required");
  }
  if (!stringOrNull(draft.draft.body)) {
    reasons.push("Draft body is required");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    finalSendIdempotencyKey: [
      "loop-final-send",
      draft.loopId,
      draft.approvalRequestId,
      draft.idempotencyKey,
    ].join(":"),
  };
}

export function updateExternalReplyDraftInState(input: {
  stateJson: LoopJson;
  draftId: string;
  updates: {
    status?: LoopExternalDraftStatus;
    draft?: Partial<LoopExternalReplyDraft["draft"]>;
  };
  updatedAt?: Date;
}): { stateJson: LoopJson; draft: LoopExternalReplyDraft | null } {
  let updatedDraft: LoopExternalReplyDraft | null = null;
  const updatedAt = (input.updatedAt ?? new Date()).toISOString();

  const approvalReplayHistory = asArray(input.stateJson.approvalReplayHistory).map(
    (item) => {
      const record = asRecord(item);
      const draft = record ? toDraftItem(record) : null;
      if (!record || !draft || draft.id !== input.draftId) return item;

      const adapterResult = asRecord(record.adapterResult) ?? {};
      const nextAdapterResult = {
        ...adapterResult,
        status: input.updates.status ?? draft.status,
        draft: {
          ...draft.draft,
          ...(input.updates.draft ?? {}),
        },
        updatedAt,
      };
      const nextRecord = {
        ...record,
        adapterResult: nextAdapterResult,
      };
      updatedDraft = toDraftItem(nextRecord);
      return nextRecord;
    },
  );

  return {
    stateJson: {
      ...input.stateJson,
      approvalReplayHistory,
    },
    draft: updatedDraft,
  };
}
