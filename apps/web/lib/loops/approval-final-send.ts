import {
  evaluateExternalReplyDraftEligibility,
  type LoopExternalReplyDraft,
} from "./approval-drafts";
import type { LoopJson } from "./types";

export interface LoopExternalFinalSendAdapter {
  platform: string;
  description: string;
  riskLevel: "medium" | "high";
  requiresConfirmation: boolean;
  execute: (input: {
    draft: LoopExternalReplyDraft;
    idempotencyKey: string;
  }) => Promise<LoopJson>;
}

export interface LoopExternalFinalSendAdapterSummary {
  platform: string;
  description: string;
  riskLevel: LoopExternalFinalSendAdapter["riskLevel"];
  requiresConfirmation: boolean;
}

export interface LoopExternalFinalSendPlan {
  status: "ready" | "blocked";
  draftId: string;
  approvalRequestId: string;
  idempotencyKey: string;
  confirmationRequired: boolean;
  confirmationToken: string;
  reason: string | null;
}

export interface LoopExternalFinalSendResult {
  status: "blocked" | "success" | "failed";
  draftId: string;
  approvalRequestId: string;
  idempotencyKey: string;
  outputSummary: string;
  reason?: string | null;
  adapterResult?: LoopJson | null;
}

export const DEFAULT_LOOP_EXTERNAL_FINAL_SEND_ADAPTERS: LoopExternalFinalSendAdapter[] =
  [];

export function listExternalFinalSendAdapters(
  adapters: LoopExternalFinalSendAdapter[] = DEFAULT_LOOP_EXTERNAL_FINAL_SEND_ADAPTERS,
): LoopExternalFinalSendAdapterSummary[] {
  return adapters.map((adapter) => ({
    platform: adapter.platform,
    description: adapter.description,
    riskLevel: adapter.riskLevel,
    requiresConfirmation: adapter.requiresConfirmation,
  }));
}

export function buildExternalFinalSendConfirmationToken(
  draft: LoopExternalReplyDraft,
): string {
  return [
    "confirm-final-send",
    draft.loopId,
    draft.approvalRequestId,
    draft.idempotencyKey,
  ].join(":");
}

export function createExternalFinalSendPlan(input: {
  draft: LoopExternalReplyDraft;
  adapters?: LoopExternalFinalSendAdapter[];
  confirmationToken?: string | null;
}): LoopExternalFinalSendPlan {
  const eligibility = evaluateExternalReplyDraftEligibility(input.draft);
  const confirmationToken = buildExternalFinalSendConfirmationToken(input.draft);
  const base = {
    draftId: input.draft.id,
    approvalRequestId: input.draft.approvalRequestId,
    idempotencyKey: eligibility.finalSendIdempotencyKey,
    confirmationRequired: true,
    confirmationToken,
  };

  if (!eligibility.eligible) {
    return {
      ...base,
      status: "blocked",
      reason: eligibility.reasons.join("; "),
    };
  }
  if (input.confirmationToken !== confirmationToken) {
    return {
      ...base,
      status: "blocked",
      reason: "Final send confirmation is required",
    };
  }
  if ((input.adapters ?? []).length === 0) {
    return {
      ...base,
      status: "blocked",
      reason:
        "No final-send adapter is allowlisted with proven delivery idempotency",
    };
  }

  return {
    ...base,
    status: "ready",
    reason: null,
  };
}

export async function runExternalFinalSendAdapter(input: {
  draft: LoopExternalReplyDraft;
  adapters?: LoopExternalFinalSendAdapter[];
  confirmationToken?: string | null;
}): Promise<LoopExternalFinalSendResult> {
  const adapters = input.adapters ?? DEFAULT_LOOP_EXTERNAL_FINAL_SEND_ADAPTERS;
  const plan = createExternalFinalSendPlan({
    draft: input.draft,
    adapters,
    confirmationToken: input.confirmationToken ?? null,
  });

  if (plan.status === "blocked") {
    return {
      status: "blocked",
      draftId: plan.draftId,
      approvalRequestId: plan.approvalRequestId,
      idempotencyKey: plan.idempotencyKey,
      outputSummary: plan.reason ?? "Final send blocked",
      reason: plan.reason,
    };
  }

  const adapter = adapters[0];
  try {
    const adapterResult = await adapter.execute({
      draft: input.draft,
      idempotencyKey: plan.idempotencyKey,
    });
    return {
      status: "success",
      draftId: plan.draftId,
      approvalRequestId: plan.approvalRequestId,
      idempotencyKey: plan.idempotencyKey,
      outputSummary: `Final send adapter executed for ${adapter.platform}.`,
      adapterResult,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      draftId: plan.draftId,
      approvalRequestId: plan.approvalRequestId,
      idempotencyKey: plan.idempotencyKey,
      outputSummary: reason,
      reason,
    };
  }
}
