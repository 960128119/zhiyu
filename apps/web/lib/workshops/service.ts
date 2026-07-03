import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deserializeJson, serializeJson } from "@/lib/db/serialization";
import {
  workshopDirectives,
  workshopEvents,
  workshopMemories,
  workshopOutbox,
  workshopRuns,
  workshops,
  workshopSources,
  type InsertWorkshop,
  type InsertWorkshopDirective,
  type InsertWorkshopEvent,
  type InsertWorkshopMemory,
  type InsertWorkshopOutboxItem,
  type InsertWorkshopRun,
  type InsertWorkshopSource,
  type Workshop,
  type WorkshopDirective,
  type WorkshopEvent,
  type WorkshopMemory,
  type WorkshopOutboxItem,
  type WorkshopRun,
  type WorkshopSource,
} from "@/lib/db/schema";
import { publishWorkshopEvent } from "./event-bus";
import type {
  AddWorkshopDirectiveInput,
  AddWorkshopMemoryInput,
  AddWorkshopSourceInput,
  AppendWorkshopEventInput,
  CompleteWorkshopRunInput,
  CreateWorkshopInput,
  CreateWorkshopOutboxDraftInput,
  CreateWorkshopRunInput,
  UpdateWorkshopInput,
  WorkshopJson,
} from "./types";

const EMPTY_OBJECT: WorkshopJson = {};
const workshopEventWriteQueues = new Map<string, Promise<void>>();

function toDbJson(value: unknown) {
  const data = value === null || value === undefined ? EMPTY_OBJECT : value;
  return serializeJson(
    data as Record<string, unknown> | unknown[] | string | number | boolean,
  ) as Record<string, unknown>;
}

function toDbArray(value: unknown[] | null | undefined) {
  return serializeJson(value ?? []) as unknown[];
}

function parseJsonObject(value: unknown): WorkshopJson {
  const parsed = deserializeJson(value as any);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as WorkshopJson;
  }
  return {};
}

function parseJsonArray<T = unknown>(value: unknown): T[] {
  const parsed = deserializeJson(value as any);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function clampConfidence(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function withWorkshopEventWriteQueue<T>(
  workshopId: string,
  task: () => Promise<T>,
) {
  const previous = workshopEventWriteQueues.get(workshopId) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const next = previous.catch(() => undefined).then(() => current);
  workshopEventWriteQueues.set(workshopId, next);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    releaseCurrent();
    if (workshopEventWriteQueues.get(workshopId) === next) {
      workshopEventWriteQueues.delete(workshopId);
    }
  }
}

function normalizeWorkshop<T extends Workshop>(workshop: T): T {
  return {
    ...workshop,
    boundaryPolicy: parseJsonObject(workshop.boundaryPolicy),
    modelConfig: parseJsonObject(workshop.modelConfig),
  };
}

function normalizeRun<T extends WorkshopRun>(run: T): T {
  return {
    ...run,
    triggerReason:
      run.triggerReason === null ? null : parseJsonObject(run.triggerReason),
    inputSnapshot:
      run.inputSnapshot === null ? null : parseJsonObject(run.inputSnapshot),
  };
}

function normalizeEvent<T extends WorkshopEvent>(event: T): T {
  return {
    ...event,
    metadata: parseJsonObject(event.metadata),
  };
}

function normalizeSource<T extends WorkshopSource>(source: T): T {
  return {
    ...source,
    config: parseJsonObject(source.config),
  };
}

function normalizeMemory<T extends WorkshopMemory>(memory: T): T {
  return {
    ...memory,
    tags: parseJsonArray<string>(memory.tags),
    sourceEventIds: parseJsonArray<string>(memory.sourceEventIds),
  };
}

function normalizeOutbox<T extends WorkshopOutboxItem>(item: T): T {
  return {
    ...item,
    sourceEventIds: parseJsonArray<string>(item.sourceEventIds),
    boundaryResult: parseJsonObject(item.boundaryResult),
  };
}

export async function createWorkshop(input: CreateWorkshopInput) {
  const now = new Date();
  const data: InsertWorkshop = {
    id: crypto.randomUUID(),
    userId: input.userId,
    name: input.name,
    mission: input.mission,
    status: input.status ?? "active",
    autonomyLevel: input.autonomyLevel ?? "draft",
    boundaryPolicy: toDbJson(input.boundaryPolicy),
    modelConfig: toDbJson(input.modelConfig),
    createdAt: now,
    updatedAt: now,
  } as InsertWorkshop;

  const [created] = await db.insert(workshops).values(data).returning();
  const workshop = normalizeWorkshop(created as Workshop);
  await appendWorkshopEvent({
    workshopId: workshop.id,
    type: "created",
    title: "车间已创建",
    body: workshop.mission,
    metadata: {
      autonomyLevel: workshop.autonomyLevel,
    },
  });
  return workshop;
}

export async function listWorkshops(userId: string, limit = 100) {
  const rows = await db
    .select()
    .from(workshops)
    .where(eq(workshops.userId, userId))
    .orderBy(desc(workshops.updatedAt))
    .limit(limit);
  return rows.map((row: unknown) => normalizeWorkshop(row as Workshop));
}

export async function getWorkshop(userId: string, workshopId: string) {
  const [row] = await db
    .select()
    .from(workshops)
    .where(and(eq(workshops.userId, userId), eq(workshops.id, workshopId)))
    .limit(1);
  return row ? normalizeWorkshop(row as Workshop) : null;
}

export async function updateWorkshop(
  userId: string,
  workshopId: string,
  input: UpdateWorkshopInput,
) {
  const updateData: Partial<InsertWorkshop> = {
    updatedAt: new Date(),
  } as Partial<InsertWorkshop>;

  if (input.name !== undefined) updateData.name = input.name;
  if (input.mission !== undefined) updateData.mission = input.mission;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.autonomyLevel !== undefined) {
    updateData.autonomyLevel = input.autonomyLevel;
  }
  if (input.boundaryPolicy !== undefined) {
    updateData.boundaryPolicy = toDbJson(input.boundaryPolicy);
  }
  if (input.modelConfig !== undefined) {
    updateData.modelConfig = toDbJson(input.modelConfig);
  }

  const [updated] = await db
    .update(workshops)
    .set(updateData)
    .where(and(eq(workshops.userId, userId), eq(workshops.id, workshopId)))
    .returning();

  if (!updated) return null;

  await appendWorkshopEvent({
    workshopId,
    type: "updated",
    title: "车间设置已更新",
    metadata: {
      fields: Object.keys(input),
    },
  });

  return normalizeWorkshop(updated as Workshop);
}

export async function getWorkshopDetail(userId: string, workshopId: string) {
  const workshop = await getWorkshop(userId, workshopId);
  if (!workshop) return null;

  const [sources, memories, outbox, runs, events] = await Promise.all([
    listWorkshopSources(workshopId),
    listWorkshopMemories(workshopId, 30),
    listWorkshopOutbox(workshopId, 30),
    listWorkshopRuns(workshopId, 20),
    listWorkshopEvents(workshopId, { limit: 200, order: "latest" }),
  ]);

  return {
    workshop,
    sources,
    memories,
    outbox,
    runs,
    events,
  };
}

export async function createWorkshopRun(input: CreateWorkshopRunInput) {
  const now = new Date();
  const data: InsertWorkshopRun = {
    id: crypto.randomUUID(),
    workshopId: input.workshopId,
    status: "running",
    triggerReason: input.triggerReason
      ? toDbJson(input.triggerReason)
      : null,
    ccSessionId: input.ccSessionId ?? null,
    inputSnapshot: input.inputSnapshot ? toDbJson(input.inputSnapshot) : null,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  } as InsertWorkshopRun;

  const [created] = await db.insert(workshopRuns).values(data).returning();
  const run = normalizeRun(created as WorkshopRun);
  await appendWorkshopEvent({
    workshopId: input.workshopId,
    runId: run.id,
    type: "run_started",
    title: "启动一轮车间工作",
    body: "运行底座已记录，正在准备 CC SDK 执行器。",
    metadata: {
      triggerReason: input.triggerReason ?? {},
    },
  });
  return run;
}

export async function completeWorkshopRun(input: CompleteWorkshopRunInput) {
  const [updated] = await db
    .update(workshopRuns)
    .set({
      status: input.status,
      outputSummary: input.outputSummary ?? null,
      error: input.error ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workshopRuns.id, input.runId))
    .returning();
  return updated ? normalizeRun(updated as WorkshopRun) : null;
}

export async function listWorkshopRuns(workshopId: string, limit = 20) {
  const rows = await db
    .select()
    .from(workshopRuns)
    .where(eq(workshopRuns.workshopId, workshopId))
    .orderBy(desc(workshopRuns.startedAt))
    .limit(limit);
  return rows.map((row: unknown) => normalizeRun(row as WorkshopRun));
}

export async function appendWorkshopEvent(input: AppendWorkshopEventInput) {
  return withWorkshopEventWriteQueue(input.workshopId, async () => {
    const latestRows = await db
      .select()
      .from(workshopEvents)
      .where(eq(workshopEvents.workshopId, input.workshopId))
      .orderBy(desc(workshopEvents.seq))
      .limit(1);
    const latest = latestRows[0] as WorkshopEvent | undefined;
    const seq = (latest?.seq ?? 0) + 1;

    const data: InsertWorkshopEvent = {
      id: crypto.randomUUID(),
      workshopId: input.workshopId,
      runId: input.runId ?? null,
      seq,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      metadata: toDbJson(input.metadata),
      visibility: input.visibility ?? "user",
      createdAt: new Date(),
    } as InsertWorkshopEvent;

    const [created] = await db.insert(workshopEvents).values(data).returning();
    const event = normalizeEvent(created as WorkshopEvent);
    publishWorkshopEvent(event);
    return event;
  });
}

export async function listWorkshopEvents(
  workshopId: string,
  options: { afterSeq?: number; limit?: number; order?: "asc" | "latest" } = {},
) {
  const limit = options.limit ?? 100;
  const baseWhere =
    options.afterSeq !== undefined
      ? and(
          eq(workshopEvents.workshopId, workshopId),
          gt(workshopEvents.seq, options.afterSeq),
        )
      : eq(workshopEvents.workshopId, workshopId);

  if (options.afterSeq === undefined && options.order === "latest") {
    const rows = await db
      .select()
      .from(workshopEvents)
      .where(baseWhere)
      .orderBy(desc(workshopEvents.seq))
      .limit(limit);
    return rows
      .map((row: unknown) => normalizeEvent(row as WorkshopEvent))
      .reverse();
  }

  const rows = await db
    .select()
    .from(workshopEvents)
    .where(baseWhere)
    .orderBy(asc(workshopEvents.seq))
    .limit(limit);
  return rows.map((row: unknown) => normalizeEvent(row as WorkshopEvent));
}

export async function addWorkshopSource(input: AddWorkshopSourceInput) {
  const now = new Date();
  const data: InsertWorkshopSource = {
    id: crypto.randomUUID(),
    workshopId: input.workshopId,
    type: input.type,
    name: input.name,
    uri: input.uri ?? null,
    content: input.content ?? null,
    config: toDbJson(input.config),
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  } as InsertWorkshopSource;

  const [created] = await db.insert(workshopSources).values(data).returning();
  const source = normalizeSource(created as WorkshopSource);
  await appendWorkshopEvent({
    workshopId: input.workshopId,
    type: "source_added",
    title: "新增资料源",
    body: source.name,
    metadata: {
      sourceId: source.id,
      type: source.type,
      uri: source.uri,
    },
  });
  return source;
}

export async function listWorkshopSources(workshopId: string, limit = 100) {
  const rows = await db
    .select()
    .from(workshopSources)
    .where(eq(workshopSources.workshopId, workshopId))
    .orderBy(desc(workshopSources.createdAt))
    .limit(limit);
  return rows.map((row: unknown) => normalizeSource(row as WorkshopSource));
}

export async function addWorkshopDirective(input: AddWorkshopDirectiveInput) {
  const data: InsertWorkshopDirective = {
    id: crypto.randomUUID(),
    workshopId: input.workshopId,
    runId: input.runId ?? null,
    content: input.content,
    priority: input.priority ?? 0,
    scope: input.scope ?? "current_run",
    status: "active",
    createdAt: new Date(),
  } as InsertWorkshopDirective;

  const [created] = await db
    .insert(workshopDirectives)
    .values(data)
    .returning();
  const directive = created as WorkshopDirective;
  await appendWorkshopEvent({
    workshopId: input.workshopId,
    runId: input.runId ?? null,
    type: "directive_added",
    title: "收到新的中途方向",
    body: directive.content,
    metadata: {
      directiveId: directive.id,
      scope: directive.scope,
      priority: directive.priority,
    },
  });
  return directive;
}

export async function listActiveDirectives(workshopId: string, limit = 50) {
  return db
    .select()
    .from(workshopDirectives)
    .where(
      and(
        eq(workshopDirectives.workshopId, workshopId),
        eq(workshopDirectives.status, "active"),
      ),
    )
    .orderBy(desc(workshopDirectives.createdAt))
    .limit(limit) as Promise<WorkshopDirective[]>;
}

export async function addWorkshopMemory(input: AddWorkshopMemoryInput) {
  const now = new Date();
  const data: InsertWorkshopMemory = {
    id: crypto.randomUUID(),
    workshopId: input.workshopId,
    kind: input.kind,
    content: input.content,
    confidence: clampConfidence(input.confidence),
    tags: toDbArray(input.tags),
    sourceEventIds: toDbArray(input.sourceEventIds),
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  } as InsertWorkshopMemory;

  const [created] = await db.insert(workshopMemories).values(data).returning();
  const memory = normalizeMemory(created as WorkshopMemory);
  await appendWorkshopEvent({
    workshopId: input.workshopId,
    type: "memory_written",
    title: "写入车间记忆",
    body: memory.content,
    metadata: {
      memoryId: memory.id,
      kind: memory.kind,
      confidence: memory.confidence,
      tags: memory.tags,
    },
  });
  return memory;
}

export async function listWorkshopMemories(workshopId: string, limit = 50) {
  const rows = await db
    .select()
    .from(workshopMemories)
    .where(eq(workshopMemories.workshopId, workshopId))
    .orderBy(desc(workshopMemories.createdAt))
    .limit(limit);
  return rows.map((row: unknown) => normalizeMemory(row as WorkshopMemory));
}

export async function createOutboxDraft(input: CreateWorkshopOutboxDraftInput) {
  const now = new Date();
  const data: InsertWorkshopOutboxItem = {
    id: crypto.randomUUID(),
    workshopId: input.workshopId,
    runId: input.runId ?? null,
    channel: input.channel ?? "wechat_desktop",
    recipientName: input.recipientName ?? null,
    message: input.message,
    status: input.status ?? "draft",
    confidence: clampConfidence(input.confidence),
    riskLevel: input.riskLevel ?? "medium",
    sourceEventIds: toDbArray(input.sourceEventIds),
    boundaryResult: toDbJson(input.boundaryResult),
    createdAt: now,
    updatedAt: now,
  } as InsertWorkshopOutboxItem;

  const [created] = await db.insert(workshopOutbox).values(data).returning();
  const outbox = normalizeOutbox(created as WorkshopOutboxItem);
  await appendWorkshopEvent({
    workshopId: input.workshopId,
    runId: input.runId ?? null,
    type: "outbox_draft",
    title: "生成发信草稿",
    body: outbox.message,
    metadata: {
      outboxId: outbox.id,
      channel: outbox.channel,
      recipientName: outbox.recipientName,
      status: outbox.status,
      confidence: outbox.confidence,
      riskLevel: outbox.riskLevel,
    },
  });
  return outbox;
}

export async function listWorkshopOutbox(workshopId: string, limit = 50) {
  const rows = await db
    .select()
    .from(workshopOutbox)
    .where(eq(workshopOutbox.workshopId, workshopId))
    .orderBy(desc(workshopOutbox.createdAt))
    .limit(limit);
  return rows.map((row: unknown) => normalizeOutbox(row as WorkshopOutboxItem));
}

export async function getWorkshopOutboxItem(
  workshopId: string,
  outboxId: string,
) {
  const [row] = await db
    .select()
    .from(workshopOutbox)
    .where(
      and(eq(workshopOutbox.workshopId, workshopId), eq(workshopOutbox.id, outboxId)),
    )
    .limit(1);
  return row ? normalizeOutbox(row as WorkshopOutboxItem) : null;
}

export async function updateWorkshopOutboxItem(
  workshopId: string,
  outboxId: string,
  input: {
    status?: string;
    recipientName?: string | null;
    boundaryResult?: Record<string, unknown>;
    sentAt?: Date | null;
  },
) {
  const updateData: Partial<InsertWorkshopOutboxItem> = {
    updatedAt: new Date(),
  } as Partial<InsertWorkshopOutboxItem>;

  if (input.status !== undefined) updateData.status = input.status;
  if (input.recipientName !== undefined) {
    updateData.recipientName = input.recipientName;
  }
  if (input.boundaryResult !== undefined) {
    updateData.boundaryResult = toDbJson(input.boundaryResult);
  }
  if (input.sentAt !== undefined) updateData.sentAt = input.sentAt;

  const [updated] = await db
    .update(workshopOutbox)
    .set(updateData)
    .where(
      and(eq(workshopOutbox.workshopId, workshopId), eq(workshopOutbox.id, outboxId)),
    )
    .returning();

  return updated ? normalizeOutbox(updated as WorkshopOutboxItem) : null;
}
