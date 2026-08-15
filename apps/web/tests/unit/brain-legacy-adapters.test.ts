import { describe, expect, it } from "vitest";
import {
  mapInteractionMemoryToBrainMemory,
  mapRawMessageToBrainObservation,
  mapWorkshopMemoryToBrainMemory,
} from "@/lib/brain";

describe("brain legacy adapters", () => {
  it("maps workshop memory into scoped work-owned brain memory", () => {
    const mapped = mapWorkshopMemoryToBrainMemory({
      id: "wm-1",
      workshopId: "workshop-1",
      userId: "user-1",
      title: "Trading plan",
      content: "Follow the Monday plan before new trades.",
      kind: "plan",
      sourceRunId: "run-1",
      sourceEventId: "event-1",
      confidence: 88,
      createdAt: "2026-08-10T00:00:00.000Z",
    });

    expect(mapped).toMatchObject({
      id: "legacy-workshop-memory:wm-1",
      scope: { type: "workshop", workshopId: "workshop-1" },
      ownerType: "work",
      ownerId: "workshop-1",
      memoryType: "plan",
      status: "active",
      evidenceRefs: ["event-1", "run-1"],
    });
  });

  it("maps confirmed interaction memory to verified owner memory", () => {
    const mapped = mapInteractionMemoryToBrainMemory({
      id: "im-1",
      userId: "user-1",
      memoryType: "preference",
      subject: "Dad",
      content: "Prefers short trading summaries.",
      status: "confirmed",
      confidence: 91,
      sourceEventIds: ["wx-1"],
      tags: ["wechat"],
      createdAt: "2026-08-10T00:00:00.000Z",
    });

    expect(mapped).toMatchObject({
      id: "legacy-interaction-memory:im-1",
      scope: { type: "global" },
      ownerType: "chat",
      memoryType: "preference",
      status: "verified",
      evidenceRefs: ["wx-1"],
    });
  });

  it("preserves candidate interaction memory for review", () => {
    const mapped = mapInteractionMemoryToBrainMemory({
      id: "im-2",
      userId: "user-1",
      memoryType: "fact",
      subject: "Project",
      content: "A possible fact from incoming messages.",
      status: "candidate",
      createdAt: "2026-08-10T00:00:00.000Z",
    });

    expect(mapped?.status).toBe("candidate");
  });

  it("drops dismissed interaction memory during migration", () => {
    expect(
      mapInteractionMemoryToBrainMemory({
        id: "im-3",
        userId: "user-1",
        memoryType: "fact",
        subject: "Noise",
        content: "Dismissed memory.",
        status: "dismissed",
        createdAt: "2026-08-10T00:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("maps raw messages into immutable observations with stable integrity hash", () => {
    const row = {
      id: "msg-1",
      userId: "user-1",
      platform: "wechat",
      conversationId: "dad",
      messageTime: "2026-08-10T00:00:00.000Z",
      content: "Please send today's plan.",
      metadata: { source: "desktop" },
    };

    const first = mapRawMessageToBrainObservation(row);
    const second = mapRawMessageToBrainObservation(row);

    expect(first).toMatchObject({
      id: "legacy-raw-message:msg-1",
      sourceType: "wechat",
      sourceId: "wechat:dad:msg-1",
      observedAt: "2026-08-10T00:00:00.000Z",
      metadata: { source: "desktop" },
    });
    expect(first.integrityHash).toHaveLength(64);
    expect(first.integrityHash).toBe(second.integrityHash);
  });
});
