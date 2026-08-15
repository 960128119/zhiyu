import type { JobExecutionResult } from "@/lib/cron/types";
import type { Loop, LoopState, WorkshopOutboxItem } from "@/lib/db/schema";
import {
  getLoopInWorkshop,
  getLoopState,
  listLoopRuns,
} from "@/lib/loops/service";
import { runLoopHarness, type LoopRunHarnessMode } from "@/lib/loops/harness";
import type { RunNativeLoopInput } from "@/lib/loops/types";
import type {
  StructuredExecutionOutput,
  SuggestedAction,
} from "@/lib/types/execution-result";
import { appendWorkshopEvent, createOutboxDraft, getWorkshop } from "./service";
import { workshopAllowsSuggestedActionOutbox } from "./outbox-boundary";

export interface RunWorkshopLoopOnceInput {
  userId: string;
  workshopId: string;
  loopId: string;
  mode?: LoopRunHarnessMode;
  triggeredBy?: RunNativeLoopInput["triggeredBy"];
  reason?: Record<string, unknown>;
  createOutboxDrafts?: boolean;
}

export interface RunWorkshopLoopOnceOutput {
  loop: Loop;
  loopRunId: string | null;
  result: JobExecutionResult;
  harness: Awaited<ReturnType<typeof runLoopHarness>>["harness"];
  outboxDrafts: WorkshopOutboxItem[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function extractStructuredReport(
  result: JobExecutionResult,
): StructuredExecutionOutput | null {
  const report = asRecord(result.result).structuredReport;
  return report && typeof report === "object"
    ? (report as StructuredExecutionOutput)
    : null;
}

function readLoopRunIdFromState(state: LoopState | null): string | null {
  return asString(asRecord(state?.stateJson).lastLoopRunId);
}

async function resolveLatestLoopRunContext(loopId: string) {
  const state = await getLoopState(loopId);
  const stateRunId = readLoopRunIdFromState(state);
  if (stateRunId) return { loopRunId: stateRunId, state };

  const [latestRun] = await listLoopRuns(loopId, { limit: 1 });
  return { loopRunId: latestRun?.id ?? null, state };
}

function recipientFromLoop(loop: Loop, state: LoopState | null): string | null {
  const stateJson = asRecord(state?.stateJson);
  const loopSpec = asRecord(stateJson.loopSpec);
  const specMetadata = asRecord(loopSpec.metadata);
  const specDelivery = asRecord(specMetadata.delivery);
  const specRecipient =
    asString(specDelivery.recipientName) ??
    asString(specMetadata.recipientName);
  if (specRecipient) return specRecipient;

  const stateConfig = asRecord(loop.contextConfig);
  const metadata = asRecord(stateConfig.metadata);
  const delivery = asRecord(metadata.delivery);
  return asString(delivery.recipientName) ?? asString(metadata.recipientName);
}

function recipientFromAction(action: SuggestedAction): string | null {
  const params = asRecord(action.params);
  return (
    asString(params.recipientName) ??
    asString(params.recipient) ??
    asString(params.to)
  );
}

function messageFromAction(action: SuggestedAction): string | null {
  const params = asRecord(action.params);
  return (
    asString(action.content) ??
    asString(params.message) ??
    asString(params.body) ??
    asString(params.content)
  );
}

function shouldCreateOutboxDraft(action: SuggestedAction) {
  return (
    action.requiresConfirmation === true ||
    action.type === "send_message" ||
    action.type === "reply_email"
  );
}

function shouldCreateOutboxDraftsFromSuggestedActions(
  loop: Loop,
  state: LoopState | null,
) {
  const stateJson = asRecord(state?.stateJson);
  const loopSpec = asRecord(stateJson.loopSpec);
  const specMetadata = asRecord(loopSpec.metadata);
  const contextMetadata = asRecord(asRecord(loop.contextConfig).metadata);

  const explicit =
    specMetadata.createOutboxDraftsFromSuggestedActions ??
    contextMetadata.createOutboxDraftsFromSuggestedActions;
  if (explicit === false) return false;
  if (explicit === true) return true;

  const delivery =
    asString(specMetadata.suggestedActionsDelivery) ??
    asString(contextMetadata.suggestedActionsDelivery);
  if (
    delivery === "internal" ||
    delivery === "internal_tasks" ||
    delivery === "none"
  ) {
    return false;
  }

  return true;
}

async function createOutboxDraftsFromActions(input: {
  workshopId: string;
  loop: Loop;
  state: LoopState | null;
  loopRunId: string | null;
  result: JobExecutionResult;
  sourceEventIds: string[];
}) {
  const report = extractStructuredReport(input.result);
  const drafts: WorkshopOutboxItem[] = [];
  const defaultRecipient = recipientFromLoop(input.loop, input.state);

  for (const action of report?.suggestedActions ?? []) {
    if (!shouldCreateOutboxDraft(action)) continue;
    const message = messageFromAction(action);
    if (!message) continue;

    const params = asRecord(action.params);
    const draft = await createOutboxDraft({
      workshopId: input.workshopId,
      runId: null,
      loopId: input.loop.id,
      loopRunId: input.loopRunId,
      channel: "wechat_desktop",
      recipientName: recipientFromAction(action) ?? defaultRecipient,
      message,
      status: "draft",
      confidence: numberValue(params.confidence, 60),
      riskLevel:
        params.riskLevel === "low" ||
        params.riskLevel === "medium" ||
        params.riskLevel === "high"
          ? params.riskLevel
          : "medium",
      sourceEventIds: input.sourceEventIds,
      boundaryResult: {
        source: "loop_suggested_action",
        loopId: input.loop.id,
        loopRunId: input.loopRunId,
        actionType: action.type,
        actionLabel: action.label,
        requiresConfirmation: action.requiresConfirmation ?? true,
        executionStatus: input.result.status,
      },
    });
    drafts.push(draft);
  }

  return drafts;
}

function loopRunEventBody(result: JobExecutionResult) {
  return result.output || result.error || `Loop run ${result.status}`;
}

function errorEventBody(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runWorkshopLoopOnce(
  input: RunWorkshopLoopOnceInput,
): Promise<RunWorkshopLoopOnceOutput> {
  const workshop = await getWorkshop(input.userId, input.workshopId);
  if (!workshop) {
    throw new Error("Workshop not found");
  }

  const loop = await getLoopInWorkshop({
    userId: input.userId,
    workshopId: input.workshopId,
    loopId: input.loopId,
  });
  if (!loop) {
    throw new Error("Loop not found in workshop");
  }

  await appendWorkshopEvent({
    workshopId: workshop.id,
    loopId: loop.id,
    type: "loop_run_started",
    title: "Loop started",
    body: loop.name,
    metadata: {
      mode: input.mode ?? "native_agent",
      triggeredBy: input.triggeredBy ?? "manual",
      reason: input.reason ?? {},
    },
  });

  const harnessMode = input.mode ?? "native_agent";
  const triggeredBy = input.triggeredBy ?? "manual";
  const fallbackHarness = {
    name: "loop-run-harness" as const,
    mode: harnessMode,
    loopId: loop.id,
    triggeredBy,
  };
  let result: JobExecutionResult;
  let harness: Awaited<ReturnType<typeof runLoopHarness>>["harness"];

  try {
    const execution = await runLoopHarness({
      userId: input.userId,
      loopId: loop.id,
      mode: harnessMode,
      triggeredBy,
      reason: {
        ...(input.reason ?? {}),
        workshopId: workshop.id,
        workshopName: workshop.name,
      },
    });
    result = execution.result;
    harness = execution.harness;
  } catch (error) {
    const { loopRunId } = await resolveLatestLoopRunContext(loop.id);
    await appendWorkshopEvent({
      workshopId: workshop.id,
      loopId: loop.id,
      loopRunId,
      type: "loop_run_failed",
      title: "Loop failed",
      body: errorEventBody(error),
      metadata: {
        status: "error",
        duration: null,
        harness: fallbackHarness,
        summary: null,
        suggestedActionCount: 0,
      },
    });
    throw error;
  }

  const { loopRunId, state } = await resolveLatestLoopRunContext(loop.id);
  const structuredReport = extractStructuredReport(result);
  const isSuccess = result.status === "success";

  const completionEvent = await appendWorkshopEvent({
    workshopId: workshop.id,
    loopId: loop.id,
    loopRunId,
    type: isSuccess ? "loop_run_completed" : "loop_run_failed",
    title: isSuccess ? "Loop completed" : "Loop failed",
    body: loopRunEventBody(result),
    metadata: {
      status: result.status,
      duration: result.duration,
      harness,
      summary: structuredReport?.summary ?? null,
      suggestedActionCount: structuredReport?.suggestedActions?.length ?? 0,
    },
  });

  const outboxDrafts =
    input.createOutboxDrafts === false ||
    !workshopAllowsSuggestedActionOutbox({
      boundaryPolicy: workshop.boundaryPolicy,
      modelConfig: workshop.modelConfig,
      actionPolicy: loop.actionPolicy,
    })
      ? []
      : input.createOutboxDrafts === undefined &&
          !shouldCreateOutboxDraftsFromSuggestedActions(loop, state)
        ? []
        : await createOutboxDraftsFromActions({
            workshopId: workshop.id,
            loop,
            state,
            loopRunId,
            result,
            sourceEventIds: [completionEvent.id],
          });

  return {
    loop,
    loopRunId,
    result,
    harness,
    outboxDrafts,
  };
}
