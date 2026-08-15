import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  interactionProcessingJobs,
  type InsertInteractionProcessingJob,
  type InteractionProcessingJob,
} from "@/lib/db/schema";
import { deserializeJson, serializeJson } from "@/lib/db/serialization";
import type { InteractionProcessingMode } from "@/lib/knowledge-pipeline/source-policy-runtime";

function normalizeEventIds(value: unknown): string[] {
  const parsed = deserializeJson(value as never);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeInteractionProcessingJob(
  job: InteractionProcessingJob,
): InteractionProcessingJob {
  return {
    ...job,
    eventIds: normalizeEventIds(job.eventIds),
  };
}

export async function createInteractionProcessingJob(input: {
  userId: string;
  eventIds: string[];
  processingMode: InteractionProcessingMode;
  priority?: number;
  scheduledAt?: Date;
}) {
  const now = new Date();
  const eventIds = [...new Set(input.eventIds.map((id) => id.trim()))].filter(
    Boolean,
  );
  const values: InsertInteractionProcessingJob = {
    id: randomUUID(),
    userId: input.userId,
    eventId: eventIds[0] ?? null,
    threadId: null,
    eventIds: serializeJson(eventIds) as string[],
    processingMode: input.processingMode,
    jobType: "summarize_thread",
    status: "pending",
    priority: input.priority ?? 0,
    attempts: 0,
    lastError: null,
    scheduledAt: input.scheduledAt ?? now,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  } as InsertInteractionProcessingJob;
  const [created] = await db
    .insert(interactionProcessingJobs)
    .values(values)
    .returning();
  return normalizeInteractionProcessingJob(
    created as InteractionProcessingJob,
  );
}

export async function claimInteractionProcessingJob(input: {
  userId: string;
  jobId: string;
  now?: Date;
  maxAttempts?: number;
}) {
  const now = input.now ?? new Date();
  const [claimed] = await db
    .update(interactionProcessingJobs)
    .set({
      status: "running",
      attempts: sql`${interactionProcessingJobs.attempts} + 1`,
      lastError: null,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(interactionProcessingJobs.userId, input.userId),
        eq(interactionProcessingJobs.id, input.jobId),
        inArray(interactionProcessingJobs.status, ["pending", "failed"]),
        lte(interactionProcessingJobs.scheduledAt, now),
        lt(interactionProcessingJobs.attempts, input.maxAttempts ?? 3),
      ),
    )
    .returning();
  return claimed
    ? normalizeInteractionProcessingJob(claimed as InteractionProcessingJob)
    : null;
}

export async function completeInteractionProcessingJob(input: {
  userId: string;
  jobId: string;
}) {
  const now = new Date();
  const [completed] = await db
    .update(interactionProcessingJobs)
    .set({
      status: "completed",
      lastError: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(interactionProcessingJobs.userId, input.userId),
        eq(interactionProcessingJobs.id, input.jobId),
        eq(interactionProcessingJobs.status, "running"),
      ),
    )
    .returning();
  return completed
    ? normalizeInteractionProcessingJob(completed as InteractionProcessingJob)
    : null;
}

export async function failInteractionProcessingJob(input: {
  userId: string;
  jobId: string;
  error: unknown;
  retryAt?: Date | null;
}) {
  const now = new Date();
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const [failed] = await db
    .update(interactionProcessingJobs)
    .set({
      status: "failed",
      lastError: message.slice(0, 4000),
      scheduledAt: input.retryAt ?? now,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(interactionProcessingJobs.userId, input.userId),
        eq(interactionProcessingJobs.id, input.jobId),
        eq(interactionProcessingJobs.status, "running"),
      ),
    )
    .returning();
  return failed
    ? normalizeInteractionProcessingJob(failed as InteractionProcessingJob)
    : null;
}

export async function listRunnableInteractionProcessingJobs(input: {
  userId: string;
  now?: Date;
  limit?: number;
  maxAttempts?: number;
}) {
  const rows = await db
    .select()
    .from(interactionProcessingJobs)
    .where(
      and(
        eq(interactionProcessingJobs.userId, input.userId),
        inArray(interactionProcessingJobs.status, ["pending", "failed"]),
        lte(interactionProcessingJobs.scheduledAt, input.now ?? new Date()),
        lt(interactionProcessingJobs.attempts, input.maxAttempts ?? 3),
      ),
    )
    .orderBy(
      asc(interactionProcessingJobs.priority),
      asc(interactionProcessingJobs.scheduledAt),
    )
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 100));
  return (rows as InteractionProcessingJob[]).map(
    normalizeInteractionProcessingJob,
  );
}
