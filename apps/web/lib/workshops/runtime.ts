import {
  addWorkshopMemory,
  appendWorkshopEvent,
  completeWorkshopRun,
  createOutboxDraft,
  createWorkshopRun,
  getWorkshop,
  listActiveDirectives,
  listWorkshopEvents,
  listWorkshopMemories,
  listWorkshopOutbox,
  listWorkshopSources,
} from "./service";
import { executeWorkshopAgent } from "./executor";

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function executeWorkshopRunLifecycle(input: {
  userId: string;
  workshop: NonNullable<Awaited<ReturnType<typeof getWorkshop>>>;
  run: Awaited<ReturnType<typeof createWorkshopRun>>;
}) {
  try {
    const [sources, memories, directives, events, outbox] = await Promise.all([
      listWorkshopSources(input.workshop.id),
      listWorkshopMemories(input.workshop.id, 40),
      listActiveDirectives(input.workshop.id),
      listWorkshopEvents(input.workshop.id, { limit: 80, order: "latest" }),
      listWorkshopOutbox(input.workshop.id, 20),
    ]);

    const result = await executeWorkshopAgent({
      userId: input.userId,
      workshop: input.workshop,
      runId: input.run.id,
      sources,
      memories,
      directives,
      events,
      outbox,
    });

    const structured = result.structured;

    for (const event of asRecordArray(structured?.logEvents)) {
      await appendWorkshopEvent({
        workshopId: input.workshop.id,
        runId: input.run.id,
        type: stringValue(event.type, "observation"),
        title: stringValue(event.title, "车间观察"),
        body: stringValue(event.body, ""),
        metadata:
          event.metadata && typeof event.metadata === "object"
            ? (event.metadata as Record<string, unknown>)
            : {},
      });
    }

    for (const memory of asRecordArray(structured?.memoryCandidates)) {
      const content = stringValue(memory.content).trim();
      if (!content) continue;
      await addWorkshopMemory({
        workshopId: input.workshop.id,
        kind: stringValue(memory.kind, "finding") as any,
        content,
        confidence: numberValue(memory.confidence, 50),
        tags: stringArray(memory.tags),
      });
    }

    for (const draft of asRecordArray(structured?.outboxDrafts)) {
      const message = stringValue(draft.message).trim();
      if (!message) continue;
      await createOutboxDraft({
        workshopId: input.workshop.id,
        runId: input.run.id,
        channel: "wechat_desktop",
        recipientName: stringValue(draft.recipientName, "") || null,
        message,
        confidence: numberValue(draft.confidence, 50),
        riskLevel: stringValue(draft.riskLevel, "medium") as any,
        sourceEventIds: stringArray(draft.sourceEventIds),
        boundaryResult: {
          status: "draft_only",
          reason: "Workshop runtime does not send external messages in this phase.",
        },
      });
    }

    if (structured?.nextWakeupSuggestion) {
      await appendWorkshopEvent({
        workshopId: input.workshop.id,
        runId: input.run.id,
        type: "next_wakeup_suggested",
        title: "智能体建议下次唤醒",
        body: stringValue(structured.nextWakeupSuggestion.reason),
        metadata: structured.nextWakeupSuggestion,
      });
    }

    await appendWorkshopEvent({
      workshopId: input.workshop.id,
      runId: input.run.id,
      type: result.status === "success" ? "run_completed" : "run_failed",
      title:
        result.status === "success"
          ? "本轮车间工作完成"
          : "本轮车间工作失败",
      body: result.output,
      metadata: {
        toolCallCount: result.toolCallCount,
        durationMs: result.durationMs,
      },
    });

    await completeWorkshopRun({
      runId: input.run.id,
      status: result.status === "success" ? "completed" : "failed",
      outputSummary: result.output,
      error: result.error ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendWorkshopEvent({
      workshopId: input.workshop.id,
      runId: input.run.id,
      type: "run_failed",
      title: "本轮车间工作失败",
      body: message,
    });
    await completeWorkshopRun({
      runId: input.run.id,
      status: "failed",
      outputSummary: null,
      error: message,
    });
  }
}

export async function startWorkshopRun(input: {
  userId: string;
  workshopId: string;
  triggerReason?: Record<string, unknown>;
}) {
  const workshop = await getWorkshop(input.userId, input.workshopId);
  if (!workshop) {
    throw new Error("Workshop not found");
  }

  const run = await createWorkshopRun({
    workshopId: workshop.id,
    triggerReason: input.triggerReason ?? { type: "manual" },
    inputSnapshot: {
      mission: workshop.mission,
      autonomyLevel: workshop.autonomyLevel,
    },
  });

  void executeWorkshopRunLifecycle({
    userId: input.userId,
    workshop,
    run,
  }).catch((error) => {
    console.error("[WorkshopRuntime] background run failed", error);
  });

  return run;
}
