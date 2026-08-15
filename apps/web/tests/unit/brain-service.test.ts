import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createBrainAccessGrantMock,
  deleteBrainAccessGrantMock,
  getBrainMemoryByIdMock,
  insertBrainMemoryReviewMock,
  insertBrainStateSnapshotMock,
  listBrainAccessGrantsForUserMock,
  listBrainMemoriesForUserMock,
  listBrainObservationsForUserMock,
  listBrainStateSnapshotsMock,
  upsertBrainMemoryMock,
  upsertBrainObservationMock,
} = vi.hoisted(() => ({
  createBrainAccessGrantMock: vi.fn(),
  deleteBrainAccessGrantMock: vi.fn(),
  getBrainMemoryByIdMock: vi.fn(),
  insertBrainMemoryReviewMock: vi.fn(),
  insertBrainStateSnapshotMock: vi.fn(),
  listBrainAccessGrantsForUserMock: vi.fn(),
  listBrainMemoriesForUserMock: vi.fn(),
  listBrainObservationsForUserMock: vi.fn(),
  listBrainStateSnapshotsMock: vi.fn(),
  upsertBrainMemoryMock: vi.fn(),
  upsertBrainObservationMock: vi.fn(),
}));

vi.mock("@/lib/brain/repository", () => ({
  createBrainAccessGrant: createBrainAccessGrantMock,
  deleteBrainAccessGrant: deleteBrainAccessGrantMock,
  getBrainMemoryById: getBrainMemoryByIdMock,
  insertBrainMemoryReview: insertBrainMemoryReviewMock,
  insertBrainStateSnapshot: insertBrainStateSnapshotMock,
  listBrainAccessGrantsForUser: listBrainAccessGrantsForUserMock,
  listBrainMemoriesForUser: listBrainMemoriesForUserMock,
  listBrainObservationsForUser: listBrainObservationsForUserMock,
  listBrainStateSnapshots: listBrainStateSnapshotsMock,
  upsertBrainMemory: upsertBrainMemoryMock,
  upsertBrainObservation: upsertBrainObservationMock,
}));

import {
  buildBrainContextForRequester,
  createBrainMemoryCandidate,
  createBrainObservation,
  createBrainStateSnapshot,
  grantBrainAccess,
  listBrainCandidates,
  reviewBrainMemory,
  revokeBrainAccess,
  writeBrainMemory,
} from "@/lib/brain/service";
import type { BrainMemory, BrainRequester } from "@/lib/brain/types";

const requester: BrainRequester = {
  type: "chat",
  userId: "user-1",
  id: "chat",
};

function memory(overrides: Partial<BrainMemory> = {}): BrainMemory {
  return {
    id: "memory-1",
    userId: "user-1",
    scope: { type: "global" },
    ownerType: "chat",
    ownerId: "user-1",
    memoryType: "fact",
    subject: "Alpha",
    content: "Alpha memory",
    status: "candidate",
    confidence: 80,
    evidenceRefs: ["event-1"],
    tags: ["alpha"],
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("brain service", () => {
  beforeEach(() => {
    createBrainAccessGrantMock.mockReset();
    deleteBrainAccessGrantMock.mockReset();
    getBrainMemoryByIdMock.mockReset();
    insertBrainMemoryReviewMock.mockReset();
    insertBrainStateSnapshotMock.mockReset();
    listBrainAccessGrantsForUserMock.mockReset();
    listBrainMemoriesForUserMock.mockReset();
    listBrainObservationsForUserMock.mockReset();
    listBrainStateSnapshotsMock.mockReset();
    upsertBrainMemoryMock.mockReset();
    upsertBrainObservationMock.mockReset();

    createBrainAccessGrantMock.mockImplementation(async (grant) => ({
      id: "grant-1",
      ...grant,
    }));
    deleteBrainAccessGrantMock.mockResolvedValue({ deletedCount: 1 });
    insertBrainMemoryReviewMock.mockResolvedValue({});
    insertBrainStateSnapshotMock.mockImplementation(async (snapshot) => ({
      id: "snapshot-1",
      createdAt: "2026-08-10T00:00:00.000Z",
      ...snapshot,
    }));
    listBrainAccessGrantsForUserMock.mockResolvedValue([]);
    listBrainMemoriesForUserMock.mockResolvedValue([]);
    listBrainObservationsForUserMock.mockResolvedValue([]);
    listBrainStateSnapshotsMock.mockResolvedValue([]);
    upsertBrainMemoryMock.mockImplementation(async (item) => item);
    upsertBrainObservationMock.mockImplementation(async (item) => item);
  });

  it("writes raw observations with a deterministic content hash", async () => {
    await createBrainObservation({
      userId: "user-1",
      sourceType: "interaction_event",
      sourceId: "event-1",
      sourceEventId: "event-1",
      observedAt: "2026-08-10T00:00:00.000Z",
      content: "hello",
      metadata: { platform: "wechat" },
    });

    expect(upsertBrainObservationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sourceType: "interaction_event",
        sourceId: "event-1",
        sourceEventId: "event-1",
        content: "hello",
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("allows candidates without evidence but rejects active memories without evidence", async () => {
    await createBrainMemoryCandidate({
      requester,
      scope: { type: "global" },
      ownerType: "chat",
      ownerId: "user-1",
      memoryType: "fact",
      subject: "Candidate",
      content: "Needs review",
      confidence: 60,
    });

    expect(upsertBrainMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "candidate",
        evidenceRefs: [],
      }),
    );

    await expect(
      writeBrainMemory({
        requester,
        scope: { type: "global" },
        ownerType: "chat",
        ownerId: "user-1",
        memoryType: "fact",
        subject: "Active",
        content: "Missing evidence",
        status: "active",
      }),
    ).rejects.toThrow("evidence_required");
  });

  it("reviews memories by changing status and appending a review record", async () => {
    getBrainMemoryByIdMock.mockResolvedValue(memory());

    await expect(
      reviewBrainMemory({
        requester,
        memoryId: "memory-1",
        decision: "confirmed",
        reason: "owner approved",
      }),
    ).resolves.toMatchObject({
      id: "memory-1",
      status: "verified",
    });

    expect(upsertBrainMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "memory-1",
        status: "verified",
      }),
    );
    expect(insertBrainMemoryReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        memoryId: "memory-1",
        reviewerType: "chat",
        reviewerId: "chat",
        decision: "confirmed",
        reason: "owner approved",
        evidenceRefs: ["event-1"],
      }),
    );
  });

  it("builds scoped context and exposes candidates, snapshots and grants", async () => {
    listBrainMemoriesForUserMock.mockResolvedValue([
      memory({ status: "verified" }),
      memory({ id: "candidate-1", status: "candidate" }),
    ]);

    const context = await buildBrainContextForRequester({
      requester,
      taskIntent: "Alpha",
      accessMode: "owner_override",
    });
    expect(context.items.map((item) => item.id)).toEqual(["memory-1"]);

    await listBrainCandidates({ userId: "user-1", limit: 5 });
    expect(listBrainMemoriesForUserMock).toHaveBeenLastCalledWith({
      userId: "user-1",
      statuses: ["candidate"],
      limit: 5,
      ownerType: undefined,
      ownerId: undefined,
    });

    await createBrainStateSnapshot({
      userId: "user-1",
      scope: { type: "global" },
      snapshotType: "owner_context_state",
      content: { candidateCount: 1 },
    });
    expect(insertBrainStateSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotType: "owner_context_state",
      }),
    );

    await grantBrainAccess({
      userId: "user-1",
      subjectType: "work",
      subjectId: "work-1",
      scope: { type: "global" },
      permissions: ["reference"],
    });
    expect(createBrainAccessGrantMock).toHaveBeenCalled();

    await revokeBrainAccess({ userId: "user-1", grantId: "grant-1" });
    expect(deleteBrainAccessGrantMock).toHaveBeenCalledWith({
      userId: "user-1",
      grantId: "grant-1",
    });
  });
});
