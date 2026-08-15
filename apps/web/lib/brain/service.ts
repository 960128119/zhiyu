import { createHash, randomUUID } from "node:crypto";
import { buildBrainContextPack, type BrainRecallProfile } from "./context";
import { canWriteMemory, validateMemoryWrite } from "./policy";
import {
  createBrainAccessGrant,
  deleteBrainAccessGrant,
  getBrainMemoryById,
  insertBrainMemoryReview,
  insertBrainStateSnapshot,
  listBrainAccessGrantsForUser,
  listBrainMemoriesForUser,
  listBrainMemoryReviewsForUser,
  listBrainObservationsForUser,
  listBrainStateSnapshots,
  upsertBrainMemory,
  upsertBrainObservation,
} from "./repository";
import type {
  BrainAccessGrant,
  BrainMemory,
  BrainMemoryStatus,
  BrainMemoryType,
  BrainRequester,
  BrainScope,
} from "./types";

function clampConfidence(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hashObservation(input: {
  sourceType: string;
  sourceId: string;
  observedAt: string | Date;
  content: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        observedAt:
          input.observedAt instanceof Date
            ? input.observedAt.toISOString()
            : input.observedAt,
        content: input.content,
      }),
    )
    .digest("hex");
}

function reviewerId(requester: BrainRequester) {
  return requester.id ?? requester.workId ?? requester.workshopId ?? null;
}

function reviewStatus(decision: "confirmed" | "dismissed" | "rejected") {
  return decision === "confirmed" ? "verified" : "deleted";
}

export async function createBrainObservation(input: {
  userId: string;
  sourceType: string;
  sourceId: string;
  sourceEventId?: string | null;
  observedAt: string | Date;
  content: string;
  trustLevel?: string;
  metadata?: Record<string, unknown>;
}) {
  return upsertBrainObservation({
    ...input,
    contentHash: hashObservation(input),
  });
}

export async function listBrainObservations(input: {
  userId: string;
  limit?: number;
  sourceTypes?: string[];
}) {
  return listBrainObservationsForUser(input);
}

export async function listBrainMemory(input: {
  userId: string;
  limit?: number;
  statuses?: BrainMemoryStatus[];
  memoryTypes?: BrainMemoryType[];
  ownerType?: BrainMemory["ownerType"];
  ownerId?: string;
}) {
  return listBrainMemoriesForUser(input);
}

export async function getBrainMemory(input: {
  userId: string;
  memoryId: string;
}) {
  return getBrainMemoryById(input);
}

export async function listBrainReviews(input: {
  userId: string;
  memoryId?: string;
  limit?: number;
}) {
  return listBrainMemoryReviewsForUser(input);
}

export async function writeBrainMemory(input: {
  requester: BrainRequester;
  scope: BrainScope;
  ownerType: BrainMemory["ownerType"];
  ownerId: string;
  memoryType: BrainMemoryType;
  subject: string;
  content: string;
  status?: BrainMemoryStatus;
  confidence?: number;
  evidenceRefs?: string[];
  tags?: string[];
  id?: string;
  now?: Date;
  grants?: BrainAccessGrant[];
  expiresAt?: string;
  supersedes?: string[];
}) {
  const now = input.now ?? new Date();
  const status = input.status ?? "active";
  const evidenceRefs = input.evidenceRefs ?? [];
  const grants =
    input.grants ??
    (await listBrainAccessGrantsForUser({ userId: input.requester.userId }));
  const request = {
    requester: input.requester,
    targetScope: input.scope,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    memoryType: input.memoryType,
    status,
    confidence: clampConfidence(input.confidence),
    evidenceRefs,
  };
  const issues = validateMemoryWrite({ request, grants, now });
  if (issues.length > 0) {
    throw new Error(
      `Brain memory write rejected: ${issues
        .map((issue) => `${issue.code}:${issue.message}`)
        .join("; ")}`,
    );
  }

  const memory: BrainMemory = {
    id: input.id ?? randomUUID(),
    userId: input.requester.userId,
    scope: input.scope,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    memoryType: input.memoryType,
    subject: input.subject,
    content: input.content,
    status,
    confidence: request.confidence,
    evidenceRefs,
    tags: input.tags,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: input.expiresAt,
    supersedes: input.supersedes,
  };
  return upsertBrainMemory(memory);
}

export async function createBrainMemoryCandidate(input: {
  requester: BrainRequester;
  scope: BrainScope;
  ownerType: BrainMemory["ownerType"];
  ownerId: string;
  memoryType: BrainMemoryType;
  subject: string;
  content: string;
  confidence?: number;
  evidenceRefs?: string[];
  tags?: string[];
  id?: string;
  now?: Date;
  expiresAt?: string;
}) {
  return writeBrainMemory({
    ...input,
    status: "candidate",
  });
}

export async function reviewBrainMemory(input: {
  requester: BrainRequester;
  memoryId: string;
  decision: "confirmed" | "dismissed" | "rejected";
  reason?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const existing = await getBrainMemoryById({
    userId: input.requester.userId,
    memoryId: input.memoryId,
  });
  if (!existing) {
    throw new Error("Brain memory not found");
  }

  const grants = await listBrainAccessGrantsForUser({
    userId: input.requester.userId,
  });
  const writeDecision = canWriteMemory({
    request: {
      requester: input.requester,
      targetScope: existing.scope,
      ownerType: existing.ownerType,
      ownerId: existing.ownerId,
      memoryType: existing.memoryType,
      status: reviewStatus(input.decision),
      confidence: existing.confidence,
      evidenceRefs: existing.evidenceRefs,
    },
    grants,
    now,
  });
  if (!writeDecision.allowed && input.requester.type !== "chat") {
    throw new Error(`Brain memory review rejected: ${writeDecision.reason}`);
  }

  const reviewed: BrainMemory = {
    ...existing,
    status: reviewStatus(input.decision),
    updatedAt: now.toISOString(),
  };
  await upsertBrainMemory(reviewed);
  await insertBrainMemoryReview({
    userId: input.requester.userId,
    memoryId: reviewed.id,
    reviewerType: input.requester.type,
    reviewerId: reviewerId(input.requester),
    decision: input.decision,
    reason: input.reason,
    evidenceRefs: reviewed.evidenceRefs,
    metadata: {
      source: "brain_service_review",
      previousStatus: existing.status,
      nextStatus: reviewed.status,
    },
  });
  return reviewed;
}

export async function listBrainCandidates(input: {
  userId: string;
  limit?: number;
  ownerType?: BrainMemory["ownerType"];
  ownerId?: string;
}) {
  return listBrainMemoriesForUser({
    userId: input.userId,
    statuses: ["candidate"],
    limit: input.limit,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
  });
}

export async function buildBrainContextForRequester(input: {
  requester: BrainRequester;
  taskIntent: string;
  maxItems?: number;
  memoryLimit?: number;
  accessMode?: "strict" | "owner_override";
  recallProfiles?: BrainRecallProfile[];
}) {
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
  return buildBrainContextPack({
    memories,
    grants,
    requester: input.requester,
    taskIntent: input.taskIntent,
    maxItems: input.maxItems,
    accessMode: input.accessMode,
    recallProfiles: input.recallProfiles,
  });
}

export async function createBrainStateSnapshot(input: {
  userId: string;
  scope: BrainScope;
  snapshotType: string;
  content: Record<string, unknown>;
  sourceMemoryIds?: string[];
  metadata?: Record<string, unknown>;
}) {
  return insertBrainStateSnapshot(input);
}

export async function listBrainSnapshots(input: {
  userId: string;
  scope?: BrainScope;
  snapshotTypes?: string[];
  limit?: number;
}) {
  return listBrainStateSnapshots(input);
}

export async function grantBrainAccess(
  input: Omit<BrainAccessGrant, "id"> & { id?: string; reason?: string | null },
) {
  return createBrainAccessGrant(input);
}

export async function listBrainGrants(input: {
  userId: string;
  limit?: number;
  subjectType?: BrainAccessGrant["subjectType"];
  subjectId?: string;
}) {
  return listBrainAccessGrantsForUser(input);
}

export async function revokeBrainAccess(input: {
  userId: string;
  grantId: string;
}) {
  return deleteBrainAccessGrant(input);
}
