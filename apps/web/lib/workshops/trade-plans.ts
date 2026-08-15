import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deserializeJson, serializeJson } from "@/lib/db/serialization";
import {
  quantTradePlans,
  type InsertQuantTradePlan,
  type QuantTradePlan,
} from "@/lib/db/schema";

type JsonRecord = Record<string, unknown>;

export type TradePlanStatus = "active" | "superseded" | "cancelled" | "expired";
export type TradePlanExecutionStatus =
  | "pending"
  | "executed"
  | "partial"
  | "blocked"
  | "not_executed"
  | "skipped";

export type TradePlanDraft = {
  planDate: string;
  horizon?: string | null;
  code: string;
  name?: string | null;
  action: string;
  side?: string | null;
  quantity?: number | null;
  targetPrice?: number | null;
  triggerCondition: string;
  invalidation?: string | null;
  rationale: string;
  priority?: string | null;
  dueAt?: string | Date | null;
  sourceDecision?: JsonRecord | null;
  metadata?: JsonRecord | null;
};

export type TradePlanUpdate = {
  id: string;
  status?: TradePlanStatus | string | null;
  executionStatus?: TradePlanExecutionStatus | string | null;
  orderId?: string | null;
  blockerReason?: string | null;
  completionNote?: string | null;
  executedAt?: string | Date | null;
  reviewedAt?: string | Date | null;
  metadata?: JsonRecord | null;
};

export type TradePlanView = Omit<
  QuantTradePlan,
  "sourceDecision" | "metadata" | "plannedAt" | "dueAt" | "executedAt" | "reviewedAt" | "createdAt" | "updatedAt"
> & {
  sourceDecision: JsonRecord;
  metadata: JsonRecord;
  plannedAt: Date;
  dueAt: Date | null;
  executedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listTradePlans(input: {
  workshopId: string;
  planDate?: string | null;
  statuses?: string[];
  executionStatuses?: string[];
  codes?: string[];
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const conditions = [eq(quantTradePlans.workshopId, input.workshopId)];
  if (input.planDate?.trim()) {
    conditions.push(eq(quantTradePlans.planDate, input.planDate.trim()));
  }
  const statuses = uniqueStrings(input.statuses);
  if (statuses.length > 0) {
    conditions.push(inArray(quantTradePlans.status, statuses));
  }
  const executionStatuses = uniqueStrings(input.executionStatuses);
  if (executionStatuses.length > 0) {
    conditions.push(inArray(quantTradePlans.executionStatus, executionStatuses));
  }
  const codes = uniqueStrings(input.codes).map(normalizeCode);
  if (codes.length > 0) {
    conditions.push(inArray(quantTradePlans.code, codes));
  }

  const rows = await db
    .select()
    .from(quantTradePlans)
    .where(and(...conditions))
    .orderBy(desc(quantTradePlans.planDate), desc(quantTradePlans.createdAt))
    .limit(limit);

  return rows.map((row: unknown) => normalizeTradePlan(row as QuantTradePlan));
}

export async function insertTradePlans(input: {
  workshopId: string;
  runId?: string | null;
  loopId?: string | null;
  loopRunId?: string | null;
  sourceEventId?: string | null;
  plans: TradePlanDraft[];
}) {
  const now = new Date();
  const drafts = input.plans
    .map(normalizeDraft)
    .filter((draft): draft is TradePlanDraft => draft !== null);
  if (drafts.length === 0) return [];

  const values: InsertQuantTradePlan[] = [];
  for (const draft of drafts) {
    const id = crypto.randomUUID();
    await db
      .update(quantTradePlans)
      .set({
        status: "superseded",
        supersededBy: id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(quantTradePlans.workshopId, input.workshopId),
          eq(quantTradePlans.planDate, draft.planDate),
          eq(quantTradePlans.code, draft.code),
          eq(quantTradePlans.action, draft.action),
          eq(quantTradePlans.status, "active"),
        ),
      );
    values.push({
      id,
      workshopId: input.workshopId,
      runId: input.runId ?? null,
      loopId: input.loopId ?? null,
      loopRunId: input.loopRunId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      planDate: draft.planDate,
      horizon: draft.horizon ?? "next_day",
      status: "active",
      code: draft.code,
      name: draft.name ?? null,
      action: draft.action,
      side: draft.side ?? null,
      quantity: draft.quantity ?? null,
      targetPrice: draft.targetPrice ?? null,
      triggerCondition: draft.triggerCondition,
      invalidation: draft.invalidation ?? null,
      rationale: draft.rationale,
      priority: draft.priority ?? "normal",
      executionStatus: "pending",
      sourceDecision: serializeJson(draft.sourceDecision ?? {}) as JsonRecord,
      metadata: serializeJson(draft.metadata ?? {}) as JsonRecord,
      plannedAt: now,
      dueAt: toDateOrNull(draft.dueAt),
      createdAt: now,
      updatedAt: now,
    } as InsertQuantTradePlan);
  }

  const inserted = await db.insert(quantTradePlans).values(values).returning();
  return inserted.map((row: unknown) =>
    normalizeTradePlan(row as QuantTradePlan),
  );
}

export async function updateTradePlanStatus(input: {
  workshopId: string;
  updates: TradePlanUpdate[];
}) {
  const results: TradePlanView[] = [];
  for (const update of input.updates) {
    const patch = buildUpdatePatch(update);
    if (!patch) continue;
    const rows = await db
      .update(quantTradePlans)
      .set(patch)
      .where(
        and(
          eq(quantTradePlans.workshopId, input.workshopId),
          eq(quantTradePlans.id, update.id),
        ),
      )
      .returning();
    results.push(
      ...rows.map((row: unknown) =>
        normalizeTradePlan(row as QuantTradePlan),
      ),
    );
  }
  return results;
}

export function normalizeTradePlan(row: QuantTradePlan): TradePlanView {
  return {
    ...row,
    sourceDecision: asRecord(deserializeJson(row.sourceDecision as never)),
    metadata: asRecord(deserializeJson(row.metadata as never)),
    plannedAt: toDate(row.plannedAt),
    dueAt: toDateOrNull(row.dueAt),
    executedAt: toDateOrNull(row.executedAt),
    reviewedAt: toDateOrNull(row.reviewedAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function buildUpdatePatch(update: TradePlanUpdate): Partial<InsertQuantTradePlan> | null {
  const now = new Date();
  const patch: Partial<InsertQuantTradePlan> = {
    updatedAt: now,
  };
  if (update.status !== undefined && update.status !== null) {
    patch.status = update.status;
  }
  if (update.executionStatus !== undefined && update.executionStatus !== null) {
    patch.executionStatus = update.executionStatus;
  }
  if (update.orderId !== undefined) patch.orderId = update.orderId;
  if (update.blockerReason !== undefined) {
    patch.blockerReason = update.blockerReason;
  }
  if (update.completionNote !== undefined) {
    patch.completionNote = update.completionNote;
  }
  if (update.executedAt !== undefined) {
    patch.executedAt = toDateOrNull(update.executedAt);
  }
  if (update.reviewedAt !== undefined) {
    patch.reviewedAt = toDateOrNull(update.reviewedAt);
  } else if (isReviewedExecution(update.executionStatus)) {
    patch.reviewedAt = now;
  }
  if (update.metadata !== undefined && update.metadata !== null) {
    patch.metadata = serializeJson(update.metadata) as JsonRecord;
  }
  return Object.keys(patch).length > 1 ? patch : null;
}

function normalizeDraft(value: TradePlanDraft): TradePlanDraft | null {
  const planDate = value.planDate?.trim();
  const code = normalizeCode(value.code);
  const action = value.action?.trim();
  const triggerCondition = value.triggerCondition?.trim();
  const rationale = value.rationale?.trim();
  if (!planDate || !code || !action || !triggerCondition || !rationale) {
    return null;
  }
  return {
    ...value,
    planDate,
    code,
    action,
    triggerCondition,
    rationale,
    horizon: value.horizon?.trim() || "next_day",
    name: value.name?.trim() || null,
    side: value.side?.trim() || null,
    invalidation: value.invalidation?.trim() || null,
    priority: value.priority?.trim() || "normal",
  };
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function uniqueStrings(values?: string[]) {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

function isReviewedExecution(value: unknown) {
  return ["executed", "partial", "blocked", "not_executed", "skipped"].includes(
    String(value ?? ""),
  );
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function toDateOrNull(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = toDate(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}
