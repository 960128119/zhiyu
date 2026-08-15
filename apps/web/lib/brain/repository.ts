import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  brainAccessGrants,
  brainContextLogs,
  brainMemories,
  brainMemoryReviews,
  brainObservations,
  brainStateSnapshots,
  type BrainAccessGrantRow,
  type BrainContextLog,
  type BrainMemoryRow,
  type BrainMemoryReview,
  type BrainObservation,
  type BrainStateSnapshot,
  type InsertBrainAccessGrantRow,
  type InsertBrainContextLog,
  type InsertBrainMemoryRow,
  type InsertBrainMemoryReview,
  type InsertBrainObservation,
  type InsertBrainStateSnapshot,
  type Workshop,
  type WorkshopMemory,
} from "@/lib/db/schema";
import { deserializeJson, serializeJson } from "@/lib/db/serialization";
import {
  buildBrainContextPack,
  type BrainContextPack,
  type BrainRecallProfile,
} from "./context";
import { workshopMemoryToBrainMemory } from "./workshop-memory";
import type { BrainRecallQualityLog } from "./recall-quality";
import type {
  BrainAccessGrant,
  BrainMemory,
  BrainMemoryStatus,
  BrainMemoryType,
  BrainRequester,
  BrainScope,
} from "./types";

function toDbJson(value: unknown) {
  return serializeJson(
    value as Record<string, unknown> | unknown[] | string | number | boolean,
  ) as any;
}

function scopeColumns(scope: BrainScope) {
  switch (scope.type) {
    case "global":
      return { scopeType: "global", scopeId: null };
    case "workspace":
      return { scopeType: "workspace", scopeId: scope.workspaceId };
    case "workshop":
      return { scopeType: "workshop", scopeId: scope.workshopId };
    case "work":
      return { scopeType: "work", scopeId: scope.workId };
  }
}

function scopeFromColumns(scopeType: unknown, scopeId: unknown): BrainScope {
  const id = typeof scopeId === "string" ? scopeId : "";
  switch (scopeType) {
    case "workspace":
      return { type: "workspace", workspaceId: id };
    case "workshop":
      return { type: "workshop", workshopId: id };
    case "work":
      return { type: "work", workId: id };
    case "global":
    default:
      return { type: "global" };
  }
}

function stringArray(value: unknown): string[] {
  const parsed = deserializeJson(value as any);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function unknownArray(value: unknown): unknown[] {
  const parsed = deserializeJson(value as any);
  return Array.isArray(parsed) ? parsed : [];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  const parsed = deserializeJson(value as any);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function dateIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function nullableDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

export function brainMemoryToInsertRow(
  memory: BrainMemory,
): InsertBrainMemoryRow {
  const scope = scopeColumns(memory.scope);
  return {
    id: memory.id,
    userId: memory.userId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    ownerType: memory.ownerType,
    ownerId: memory.ownerId,
    memoryType: memory.memoryType,
    subject: memory.subject,
    content: memory.content,
    status: memory.status,
    confidence: memory.confidence,
    evidenceRefs: toDbJson(memory.evidenceRefs),
    tags: toDbJson(memory.tags ?? []),
    metadata: toDbJson({}),
    expiresAt: memory.expiresAt ? new Date(memory.expiresAt) : null,
    supersedes: toDbJson(memory.supersedes ?? []),
    createdAt: new Date(memory.createdAt),
    updatedAt: new Date(memory.updatedAt),
  } as InsertBrainMemoryRow;
}

export function brainObservationToInsertRow(input: {
  id?: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  sourceEventId?: string | null;
  observedAt: string | Date;
  content: string;
  contentHash: string;
  trustLevel?: string;
  metadata?: Record<string, unknown>;
}): InsertBrainObservation {
  return {
    id: input.id,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceEventId: input.sourceEventId ?? null,
    observedAt:
      input.observedAt instanceof Date
        ? input.observedAt
        : new Date(input.observedAt),
    content: input.content,
    contentHash: input.contentHash,
    trustLevel: input.trustLevel ?? "raw",
    metadata: toDbJson(input.metadata ?? {}),
  } as InsertBrainObservation;
}

export function brainStateSnapshotToInsertRow(input: {
  id?: string;
  userId: string;
  scope: BrainScope;
  snapshotType: string;
  content: Record<string, unknown>;
  sourceMemoryIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string | Date;
}): InsertBrainStateSnapshot {
  const scope = scopeColumns(input.scope);
  return {
    id: input.id,
    userId: input.userId,
    ...scope,
    snapshotType: input.snapshotType,
    content: toDbJson(input.content),
    sourceMemoryIds: toDbJson(input.sourceMemoryIds ?? []),
    metadata: toDbJson(input.metadata ?? {}),
    createdAt:
      input.createdAt instanceof Date
        ? input.createdAt
        : input.createdAt
          ? new Date(input.createdAt)
          : undefined,
  } as InsertBrainStateSnapshot;
}

export function brainAccessGrantToInsertRow(
  grant: Omit<BrainAccessGrant, "id"> & { id?: string; reason?: string | null },
): InsertBrainAccessGrantRow {
  const scope = scopeColumns(grant.scope);
  return {
    id: grant.id,
    userId: grant.userId,
    subjectType: grant.subjectType,
    subjectId: grant.subjectId ?? null,
    ...scope,
    permissions: toDbJson(grant.permissions),
    memoryTypes: toDbJson(grant.memoryTypes ?? []),
    reason: grant.reason ?? null,
    expiresAt: nullableDate(grant.expiresAt),
  } as InsertBrainAccessGrantRow;
}

export function brainMemoryFromRow(row: BrainMemoryRow): BrainMemory {
  return {
    id: String(row.id),
    userId: String(row.userId),
    scope: scopeFromColumns(row.scopeType, row.scopeId),
    ownerType:
      row.ownerType === "chat" || row.ownerType === "system"
        ? row.ownerType
        : "work",
    ownerId: String(row.ownerId),
    memoryType: row.memoryType as BrainMemoryType,
    subject: String(row.subject),
    content: String(row.content),
    status: row.status as BrainMemoryStatus,
    confidence: Number(row.confidence ?? 50),
    evidenceRefs: stringArray(row.evidenceRefs),
    tags: stringArray(row.tags),
    createdAt: dateIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: dateIso(row.updatedAt) ?? new Date(0).toISOString(),
    expiresAt: dateIso(row.expiresAt),
    supersedes: stringArray(row.supersedes),
  };
}

export function brainObservationFromRow(row: BrainObservation) {
  return {
    id: row.id,
    userId: row.userId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceEventId:
      typeof row.sourceEventId === "string" ? row.sourceEventId : undefined,
    observedAt: dateIso(row.observedAt) ?? new Date().toISOString(),
    content: row.content,
    contentHash: row.contentHash,
    trustLevel: row.trustLevel,
    metadata: deserializeJson(row.metadata as any) as Record<string, unknown>,
    createdAt: dateIso(row.createdAt) ?? new Date().toISOString(),
  };
}

export function brainStateSnapshotFromRow(row: BrainStateSnapshot) {
  return {
    id: row.id,
    userId: row.userId,
    scope: scopeFromColumns(row.scopeType, row.scopeId),
    snapshotType: row.snapshotType,
    content: deserializeJson(row.content as any) as Record<string, unknown>,
    sourceMemoryIds: stringArray(row.sourceMemoryIds),
    metadata: deserializeJson(row.metadata as any) as Record<string, unknown>,
    createdAt: dateIso(row.createdAt) ?? new Date().toISOString(),
  };
}

export function brainAccessGrantFromRow(
  row: BrainAccessGrantRow,
): BrainAccessGrant {
  return {
    id: String(row.id),
    userId: String(row.userId),
    subjectType: row.subjectType as BrainAccessGrant["subjectType"],
    subjectId: typeof row.subjectId === "string" ? row.subjectId : undefined,
    scope: scopeFromColumns(row.scopeType, row.scopeId),
    permissions: stringArray(row.permissions) as BrainAccessGrant["permissions"],
    memoryTypes: stringArray(row.memoryTypes) as BrainMemoryType[],
    expiresAt: dateIso(row.expiresAt),
  };
}

export async function upsertBrainObservation(input: {
  id?: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  sourceEventId?: string | null;
  observedAt: string | Date;
  content: string;
  contentHash: string;
  trustLevel?: string;
  metadata?: Record<string, unknown>;
}) {
  const row = brainObservationToInsertRow(input);
  const [created] = await db
    .insert(brainObservations)
    .values(row)
    .onConflictDoNothing()
    .returning();
  if (created) {
    return brainObservationFromRow(created as BrainObservation);
  }
  const [existing] = await db
    .select()
    .from(brainObservations)
    .where(
      and(
        eq(brainObservations.userId, input.userId),
        eq(brainObservations.sourceType, input.sourceType),
        eq(brainObservations.sourceId, input.sourceId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("Brain observation was not persisted");
  }
  return brainObservationFromRow(existing as BrainObservation);
}

export async function listBrainObservationsForUser(input: {
  userId: string;
  limit?: number;
  sourceTypes?: string[];
}) {
  const conditions = [eq(brainObservations.userId, input.userId)];
  if (input.sourceTypes?.length) {
    conditions.push(inArray(brainObservations.sourceType, input.sourceTypes));
  }
  const rows = await db
    .select()
    .from(brainObservations)
    .where(and(...conditions))
    .orderBy(desc(brainObservations.observedAt))
    .limit(input.limit ?? 200);
  return (rows as BrainObservation[]).map(brainObservationFromRow);
}

export async function insertBrainMemory(
  memory: BrainMemory,
): Promise<BrainMemoryRow> {
  const [created] = await db
    .insert(brainMemories)
    .values(brainMemoryToInsertRow(memory))
    .returning();
  return created as BrainMemoryRow;
}

export async function getBrainMemoryById(input: {
  userId: string;
  memoryId: string;
}): Promise<BrainMemory | null> {
  const [row] = await db
    .select()
    .from(brainMemories)
    .where(
      and(
        eq(brainMemories.userId, input.userId),
        eq(brainMemories.id, input.memoryId),
      ),
    )
    .limit(1);
  return row ? brainMemoryFromRow(row as BrainMemoryRow) : null;
}

export async function upsertBrainMemory(
  memory: BrainMemory,
): Promise<BrainMemory> {
  const row = brainMemoryToInsertRow(memory);
  const [created] = await db
    .insert(brainMemories)
    .values(row)
    .onConflictDoUpdate({
      target: brainMemories.id,
      set: {
        userId: row.userId,
        scopeType: row.scopeType,
        scopeId: row.scopeId,
        ownerType: row.ownerType,
        ownerId: row.ownerId,
        memoryType: row.memoryType,
        subject: row.subject,
        content: row.content,
        status: row.status,
        confidence: row.confidence,
        evidenceRefs: row.evidenceRefs,
        tags: row.tags,
        metadata: row.metadata,
        expiresAt: row.expiresAt,
        supersedes: row.supersedes,
        updatedAt: row.updatedAt,
      },
    })
    .returning();
  return brainMemoryFromRow(created as BrainMemoryRow);
}

export function brainMemoryReviewToInsertRow(input: {
  userId: string;
  memoryId: string;
  reviewerType: BrainRequester["type"];
  reviewerId?: string | null;
  decision: "confirmed" | "dismissed" | "rejected" | "edited";
  reason?: string | null;
  evidenceRefs?: string[];
  metadata?: Record<string, unknown>;
}): InsertBrainMemoryReview {
  return {
    userId: input.userId,
    memoryId: input.memoryId,
    reviewerType: input.reviewerType,
    reviewerId: input.reviewerId ?? null,
    decision: input.decision,
    reason: input.reason ?? null,
    evidenceRefs: toDbJson(input.evidenceRefs ?? []),
    metadata: toDbJson(input.metadata ?? {}),
  } as InsertBrainMemoryReview;
}

export async function insertBrainMemoryReview(input: {
  userId: string;
  memoryId: string;
  reviewerType: BrainRequester["type"];
  reviewerId?: string | null;
  decision: "confirmed" | "dismissed" | "rejected" | "edited";
  reason?: string | null;
  evidenceRefs?: string[];
  metadata?: Record<string, unknown>;
}): Promise<BrainMemoryReview> {
  const [created] = await db
    .insert(brainMemoryReviews)
    .values(brainMemoryReviewToInsertRow(input))
    .returning();
  return created as BrainMemoryReview;
}

export async function listBrainMemoryReviewsForUser(input: {
  userId: string;
  memoryId?: string;
  limit?: number;
}): Promise<BrainMemoryReview[]> {
  const conditions = [eq(brainMemoryReviews.userId, input.userId)];
  if (input.memoryId) {
    conditions.push(eq(brainMemoryReviews.memoryId, input.memoryId));
  }
  const rows = await db
    .select()
    .from(brainMemoryReviews)
    .where(and(...conditions))
    .orderBy(desc(brainMemoryReviews.createdAt))
    .limit(input.limit ?? 100);
  return rows as BrainMemoryReview[];
}

export async function listBrainMemoriesForUser(input: {
  userId: string;
  limit?: number;
  statuses?: BrainMemoryStatus[];
  memoryTypes?: BrainMemoryType[];
  ownerType?: BrainMemory["ownerType"];
  ownerId?: string;
}): Promise<BrainMemory[]> {
  const conditions = [eq(brainMemories.userId, input.userId)];
  if (input.statuses?.length) {
    conditions.push(inArray(brainMemories.status, input.statuses));
  }
  if (input.memoryTypes?.length) {
    conditions.push(inArray(brainMemories.memoryType, input.memoryTypes));
  }
  if (input.ownerType) {
    conditions.push(eq(brainMemories.ownerType, input.ownerType));
  }
  if (input.ownerId) {
    conditions.push(eq(brainMemories.ownerId, input.ownerId));
  }
  const rows = await db
    .select()
    .from(brainMemories)
    .where(and(...conditions))
    .orderBy(desc(brainMemories.updatedAt))
    .limit(input.limit ?? 200);
  return (rows as BrainMemoryRow[]).map(brainMemoryFromRow);
}

export async function listBrainAccessGrantsForUser(input: {
  userId: string;
  limit?: number;
  subjectType?: BrainAccessGrant["subjectType"];
  subjectId?: string;
}): Promise<BrainAccessGrant[]> {
  const conditions = [eq(brainAccessGrants.userId, input.userId)];
  if (input.subjectType) {
    conditions.push(eq(brainAccessGrants.subjectType, input.subjectType));
  }
  if (input.subjectId) {
    conditions.push(eq(brainAccessGrants.subjectId, input.subjectId));
  }
  const rows = await db
    .select()
    .from(brainAccessGrants)
    .where(and(...conditions))
    .orderBy(desc(brainAccessGrants.updatedAt))
    .limit(input.limit ?? 200);
  return (rows as BrainAccessGrantRow[]).map(brainAccessGrantFromRow);
}

export async function createBrainAccessGrant(
  grant: Omit<BrainAccessGrant, "id"> & { id?: string; reason?: string | null },
): Promise<BrainAccessGrant> {
  const [created] = await db
    .insert(brainAccessGrants)
    .values(brainAccessGrantToInsertRow(grant))
    .returning();
  return brainAccessGrantFromRow(created as BrainAccessGrantRow);
}

export async function deleteBrainAccessGrant(input: {
  userId: string;
  grantId: string;
}) {
  const deleted = await db
    .delete(brainAccessGrants)
    .where(
      and(
        eq(brainAccessGrants.userId, input.userId),
        eq(brainAccessGrants.id, input.grantId),
      ),
    )
    .returning();
  return { deletedCount: deleted.length };
}

export async function insertBrainStateSnapshot(input: {
  id?: string;
  userId: string;
  scope: BrainScope;
  snapshotType: string;
  content: Record<string, unknown>;
  sourceMemoryIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string | Date;
}) {
  const [created] = await db
    .insert(brainStateSnapshots)
    .values(brainStateSnapshotToInsertRow(input))
    .returning();
  return brainStateSnapshotFromRow(created as BrainStateSnapshot);
}

export async function listBrainStateSnapshots(input: {
  userId: string;
  scope?: BrainScope;
  snapshotTypes?: string[];
  limit?: number;
}) {
  const conditions = [eq(brainStateSnapshots.userId, input.userId)];
  if (input.scope) {
    const scope = scopeColumns(input.scope);
    conditions.push(eq(brainStateSnapshots.scopeType, scope.scopeType));
    if (scope.scopeId) {
      conditions.push(eq(brainStateSnapshots.scopeId, scope.scopeId));
    }
  }
  if (input.snapshotTypes?.length) {
    conditions.push(
      inArray(brainStateSnapshots.snapshotType, input.snapshotTypes),
    );
  }
  const rows = await db
    .select()
    .from(brainStateSnapshots)
    .where(and(...conditions))
    .orderBy(desc(brainStateSnapshots.createdAt))
    .limit(input.limit ?? 100);
  return (rows as BrainStateSnapshot[]).map(brainStateSnapshotFromRow);
}

export async function insertBrainMemoryFromWorkshop(input: {
  workshop: Pick<Workshop, "id" | "userId">;
  memory: WorkshopMemory & { status?: string };
}) {
  return insertBrainMemory(
    workshopMemoryToBrainMemory({
      workshop: input.workshop,
      memory: input.memory,
    }),
  );
}

export function brainContextLogToInsertRow(input: {
  requester: BrainRequester;
  pack: BrainContextPack;
  taskIntent?: string | null;
  metadata?: Record<string, unknown>;
}): InsertBrainContextLog {
  return {
    userId: input.requester.userId,
    requesterType: input.requester.type,
    requesterId: input.requester.id ?? input.requester.workId ?? null,
    taskIntent: input.taskIntent ?? null,
    selectedMemoryIds: toDbJson(input.pack.items.map((item) => item.id)),
    denied: toDbJson(input.pack.denied),
    omitted: toDbJson(input.pack.omitted),
    metadata: toDbJson(input.metadata ?? {}),
  } as InsertBrainContextLog;
}

export async function insertBrainContextLog(input: {
  requester: BrainRequester;
  pack: BrainContextPack;
  taskIntent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<BrainContextLog> {
  const [created] = await db
    .insert(brainContextLogs)
    .values(brainContextLogToInsertRow(input))
    .returning();
  return created as BrainContextLog;
}

export function brainContextLogToQualityLog(
  row: BrainContextLog,
): BrainRecallQualityLog {
  const metadata = jsonRecord(row.metadata);
  return {
    id: row.id,
    requesterType: row.requesterType as BrainRequester["type"],
    requesterId: row.requesterId ?? null,
    selectedMemoryIds: stringArray(row.selectedMemoryIds),
    deniedCount: unknownArray(row.denied).length,
    omittedCount: unknownArray(row.omitted).length,
    recallProfileIds: stringArray(metadata.recallProfileIds),
    recallProfileIssueCount: stringArray(
      metadata.recallProfileIssueCodes,
    ).length,
    createdAt: dateIso(row.createdAt) ?? "",
  };
}

export async function listBrainContextLogsForQuality(input: {
  userId: string;
  limit?: number;
}): Promise<BrainRecallQualityLog[]> {
  const rows = await db
    .select()
    .from(brainContextLogs)
    .where(eq(brainContextLogs.userId, input.userId))
    .orderBy(desc(brainContextLogs.createdAt))
    .limit(Math.min(2_000, Math.max(1, input.limit ?? 500)));
  return (rows as BrainContextLog[]).map(brainContextLogToQualityLog);
}

export async function buildBrainContextPackFromStore(input: {
  requester: BrainRequester;
  taskIntent: string;
  maxItems?: number;
  memoryLimit?: number;
  now?: Date;
  accessMode?: "strict" | "owner_override";
  metadata?: Record<string, unknown>;
  recallProfiles?: BrainRecallProfile[];
}): Promise<BrainContextPack> {
  const [memories, grants] = await Promise.all([
    listBrainMemoriesForUser({
      userId: input.requester.userId,
      limit: input.memoryLimit ?? 200,
    }),
    listBrainAccessGrantsForUser({
      userId: input.requester.userId,
      limit: 200,
    }),
  ]);
  const pack = buildBrainContextPack({
    memories,
    grants,
    requester: input.requester,
    taskIntent: input.taskIntent,
    maxItems: input.maxItems,
    now: input.now,
    accessMode: input.accessMode,
    recallProfiles: input.recallProfiles,
  });
  const contextLog = await insertBrainContextLog({
    requester: input.requester,
    pack,
    taskIntent: input.taskIntent,
    metadata: input.metadata,
  });
  return {
    ...pack,
    contextLogId: contextLog.id,
  };
}
