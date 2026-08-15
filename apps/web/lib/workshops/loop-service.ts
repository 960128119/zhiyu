import type { Loop } from "@/lib/db/schema";
import {
  createLoop,
  createLoopFromNaturalLanguage,
  createLoopFromTemplate,
  draftLoopFromNaturalLanguage,
  computeNextLoopRun,
  getLoopInWorkshop,
  getLoopState,
  listLoopsForWorkshop,
  loopSpecToCreateLoopInput,
  updateLoop,
  upsertLoopState,
  WORK_SELF_AUDIT_TEMPLATE_ID,
  type LoopTemplateId,
  type LoopTemplateInput,
  type NaturalLanguageLoopDraft,
} from "@/lib/loops";
import { appendWorkshopEvent, getWorkshop } from "./service";

type TemplateInputOverrides = Partial<
  Omit<LoopTemplateInput, "userId" | "workshopId" | "templateId">
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPendingOwnerActivation(stateJson: Record<string, unknown>) {
  const status = stateJson.ownerActivationStatus;
  return (
    stateJson.requiresOwnerActivation === true &&
    (status === undefined || status === "pending")
  );
}

async function assertWorkshopAccess(input: {
  userId: string;
  workshopId: string;
}) {
  const workshop = await getWorkshop(input.userId, input.workshopId);
  if (!workshop) {
    throw new Error("Workshop not found");
  }
  return workshop;
}

async function appendLoopCreatedEvent(input: {
  workshopId: string;
  loop: Loop;
  source: "template" | "natural_language";
}) {
  await appendWorkshopEvent({
    workshopId: input.workshopId,
    loopId: input.loop.id,
    type: "loop_created",
    title: `Task created: ${input.loop.name}`,
    body: input.loop.description ?? input.loop.goal,
    metadata: {
      loopId: input.loop.id,
      source: input.source,
      triggerConfig: input.loop.triggerConfig,
    },
  });
}

export async function createWorkshopLoopFromTemplate(input: {
  userId: string;
  workshopId: string;
  templateId: LoopTemplateId;
  templateInput?: TemplateInputOverrides;
}): Promise<Loop> {
  await assertWorkshopAccess(input);

  const loop = await createLoopFromTemplate({
    ...(input.templateInput ?? {}),
    userId: input.userId,
    workshopId: input.workshopId,
    templateId: input.templateId,
  } as LoopTemplateInput);

  await appendLoopCreatedEvent({
    workshopId: input.workshopId,
    loop,
    source: "template",
  });

  return loop;
}

function isWorkSelfAuditLoop(loop: Loop) {
  const triggerConfig = asRecord(loop.triggerConfig);
  const metadata = asRecord(triggerConfig.metadata);
  return (
    loop.status !== "archived" &&
    (loop.name === "Work 自检升级" ||
      loop.goal.includes("Work self-audit") ||
      loop.goal.includes("Work 模型") ||
      metadata.templateId === WORK_SELF_AUDIT_TEMPLATE_ID)
  );
}

export async function ensureWorkshopWorkSelfAuditLoop(input: {
  userId: string;
  workshopId: string;
  timezone?: string;
  cronExpression?: string;
}): Promise<{ loop: Loop; created: boolean }> {
  await assertWorkshopAccess(input);
  const existing = (
    await listLoopsForWorkshop({
      userId: input.userId,
      workshopId: input.workshopId,
      limit: 200,
    })
  ).find(isWorkSelfAuditLoop);

  if (existing) {
    return { loop: existing, created: false };
  }

  const loop = await createWorkshopLoopFromTemplate({
    userId: input.userId,
    workshopId: input.workshopId,
    templateId: WORK_SELF_AUDIT_TEMPLATE_ID,
    templateInput: {
      timezone: input.timezone ?? "Asia/Shanghai",
      cronExpression: input.cronExpression ?? "0 3 * * *",
    },
  });

  await appendWorkshopEvent({
    workshopId: input.workshopId,
    loopId: loop.id,
    type: "work_upgrade_loop_ready",
    title: "Work 自检升级任务已就绪",
    body:
      "车间现在会持续检查 Work 模型、工具边界、Skill、Loop 和版本状态，并在需要时生成可审核改造提案。",
    metadata: {
      loopId: loop.id,
      templateId: WORK_SELF_AUDIT_TEMPLATE_ID,
      triggerConfig: loop.triggerConfig,
    },
  });

  return { loop, created: true };
}

export async function draftWorkshopLoopFromNaturalLanguage(input: {
  userId: string;
  workshopId: string;
  intent: string;
  timezone?: string;
  externalWriteMode?: "manual_approval" | "loop_approved";
}): Promise<NaturalLanguageLoopDraft> {
  await assertWorkshopAccess(input);
  return draftLoopFromNaturalLanguage({
    userId: input.userId,
    workshopId: input.workshopId,
    intent: input.intent,
    timezone: input.timezone,
    externalWriteMode: input.externalWriteMode,
  });
}

export async function createWorkshopLoopFromNaturalLanguage(input: {
  userId: string;
  workshopId: string;
  intent: string;
  timezone?: string;
  externalWriteMode?: "manual_approval" | "loop_approved";
}): Promise<{ loop: Loop; draft: NaturalLanguageLoopDraft }> {
  await assertWorkshopAccess(input);

  const result = await createLoopFromNaturalLanguage({
    userId: input.userId,
    workshopId: input.workshopId,
    intent: input.intent,
    timezone: input.timezone,
    externalWriteMode: input.externalWriteMode,
  });

  await appendLoopCreatedEvent({
    workshopId: input.workshopId,
    loop: result.loop,
    source: "natural_language",
  });

  return result;
}

export async function proposeWorkshopLoopFromNaturalLanguage(input: {
  userId: string;
  workshopId: string;
  intent: string;
  timezone?: string;
  proposedBy?: "workshop_agent" | "user";
  runId?: string | null;
  proposalReason?: string | null;
}): Promise<{ loop: Loop; draft: NaturalLanguageLoopDraft }> {
  await assertWorkshopAccess(input);

  const draft = await draftLoopFromNaturalLanguage({
    userId: input.userId,
    workshopId: input.workshopId,
    intent: input.intent,
    timezone: input.timezone,
    externalWriteMode: "manual_approval",
  });

  if (draft.extracted.missingFields.length > 0) {
    throw new Error(
      `Missing required loop fields: ${draft.extracted.missingFields.join(", ")}`,
    );
  }

  const createInput = loopSpecToCreateLoopInput({
    userId: input.userId,
    workshopId: input.workshopId,
    name: draft.name,
    description: draft.description,
    spec: draft.spec,
  });
  const loop = await createLoop({
    ...createInput,
    status: "paused",
    initialState: {
      ...(createInput.initialState ?? {}),
      currentPhase: "approval",
      lastObservation: "Workshop agent proposed this task.",
      nextAction: "Owner should review and activate this task if useful.",
      blockedReason: "Awaiting owner activation before scheduling.",
      stateJson: {
        ...(createInput.initialState?.stateJson ?? {}),
        workshopId: input.workshopId,
        proposedBy: input.proposedBy ?? "workshop_agent",
        proposedFromRunId: input.runId ?? null,
        proposalReason: input.proposalReason ?? null,
        requiresOwnerActivation: true,
        ownerActivationStatus: "pending",
      },
    },
  });

  await appendWorkshopEvent({
    workshopId: input.workshopId,
    runId: input.runId ?? null,
    loopId: loop.id,
    type: "loop_proposed",
    title: `Task proposed: ${loop.name}`,
    body: loop.description ?? loop.goal,
    metadata: {
      loopId: loop.id,
      source: input.proposedBy ?? "workshop_agent",
      triggerConfig: loop.triggerConfig,
      status: "paused",
      requiresOwnerActivation: true,
      proposalReason: input.proposalReason ?? null,
      draft,
    },
  });

  return { loop, draft };
}

async function getPendingWorkshopLoopProposal(input: {
  userId: string;
  workshopId: string;
  loopId: string;
}) {
  await assertWorkshopAccess(input);

  const [loop, state] = await Promise.all([
    getLoopInWorkshop(input),
    getLoopState(input.loopId),
  ]);

  if (!loop) {
    throw new Error("Workshop loop not found");
  }

  const stateJson = asRecord(state?.stateJson);
  if (!isPendingOwnerActivation(stateJson)) {
    throw new Error("Loop proposal is not awaiting owner activation");
  }

  return { loop, state, stateJson };
}

export async function activateWorkshopLoopProposal(input: {
  userId: string;
  workshopId: string;
  loopId: string;
  activatedBy?: "owner" | "system";
}): Promise<Loop> {
  const { loop, state, stateJson } = await getPendingWorkshopLoopProposal(input);
  const now = new Date();
  const nextRun = computeNextLoopRun({
    triggerConfig: loop.triggerConfig,
    from: now,
  });
  const activatedLoop =
    (await updateLoop(input.userId, input.loopId, {
      status: "active",
    })) ?? ({ ...loop, status: "active" } as Loop);

  await upsertLoopState(input.loopId, {
    currentPhase: state?.currentPhase === "approval" ? "idle" : state?.currentPhase ?? "idle",
    nextAction: nextRun
      ? `Next scheduled run at ${nextRun.toISOString()}`
      : "Run manually or update the task schedule.",
    blockedReason: null,
    stateJson: {
      ...stateJson,
      requiresOwnerActivation: false,
      ownerActivationStatus: "activated",
      ownerActivatedAt: now.toISOString(),
      ownerActivatedBy: input.activatedBy ?? "owner",
      nextScheduledRunAt:
        nextRun?.toISOString() ??
        (typeof stateJson.nextScheduledRunAt === "string"
          ? stateJson.nextScheduledRunAt
          : undefined),
      schedulerStatus:
        nextRun !== null
          ? "idle"
          : typeof stateJson.schedulerStatus === "string"
            ? stateJson.schedulerStatus
            : undefined,
      schedulerError: undefined,
    },
  });

  await appendWorkshopEvent({
    workshopId: input.workshopId,
    loopId: input.loopId,
    type: "loop_activated",
    title: `Task activated: ${activatedLoop.name}`,
    body: nextRun
      ? `Next scheduled run: ${nextRun.toISOString()}`
      : "Task activated without a native schedule; it can be run manually.",
    metadata: {
      loopId: input.loopId,
      nextScheduledRunAt: nextRun?.toISOString() ?? null,
      activatedBy: input.activatedBy ?? "owner",
    },
  });

  return activatedLoop;
}

export async function rejectWorkshopLoopProposal(input: {
  userId: string;
  workshopId: string;
  loopId: string;
  reason?: string | null;
}): Promise<Loop> {
  const { loop, stateJson } = await getPendingWorkshopLoopProposal(input);
  const now = new Date();
  const rejectedLoop =
    (await updateLoop(input.userId, input.loopId, {
      status: "archived",
    })) ?? ({ ...loop, status: "archived" } as Loop);

  await upsertLoopState(input.loopId, {
    currentPhase: "rejected",
    nextAction: null,
    blockedReason: input.reason ?? "Owner rejected this task proposal.",
    stateJson: {
      ...stateJson,
      requiresOwnerActivation: false,
      ownerActivationStatus: "rejected",
      ownerRejectedAt: now.toISOString(),
      ownerRejectionReason: input.reason ?? null,
      nextScheduledRunAt: undefined,
      schedulerStatus: undefined,
      schedulerError: undefined,
    },
  });

  await appendWorkshopEvent({
    workshopId: input.workshopId,
    loopId: input.loopId,
    type: "loop_rejected",
    title: `Task rejected: ${rejectedLoop.name}`,
    body: input.reason ?? "Owner rejected this task proposal.",
    metadata: {
      loopId: input.loopId,
      reason: input.reason ?? null,
    },
  });

  return rejectedLoop;
}
