import { describe, expect, it } from "vitest";
import {
  buildOwnerContextSnapshotFromLegacy,
  listOwnerContextCandidatesFromLegacy,
} from "@/lib/brain/owner-context";

describe("brain owner-context legacy adapter", () => {
  it("projects legacy wiki, raw events and graph into an owner context snapshot", () => {
    const snapshot = buildOwnerContextSnapshotFromLegacy({
      userId: "user-1",
      scene: "workshop",
      query: "alice",
      generatedAt: "2026-08-10T00:00:00.000Z",
      wiki: {
        notes: [
          {
            id: "note-1",
            title: "Alice background",
            body: "Alice asked for a concise proposal.",
            sourceEventIds: ["event-1"],
            createdAt: "2026-08-09T00:00:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-1",
            title: "Send proposal to Alice",
            description: "Due Friday.",
            status: "candidate",
            sourceEventIds: ["event-1"],
            createdAt: "2026-08-09T00:05:00.000Z",
          },
        ],
        memories: [
          {
            id: "memory-1",
            memoryType: "person",
            subject: "Alice",
            content: "Alice prefers structured proposals.",
            status: "confirmed",
            confidence: 90,
            sourceEventIds: ["event-1"],
            createdAt: "2026-08-09T00:10:00.000Z",
          },
        ],
      },
      events: [
        {
          id: "event-1",
          platform: "wechat",
          conversationId: "wx-1",
          conversationName: "Alice",
          conversationType: "person",
          senderName: "Alice",
          contentPreview: "Please send the proposal.",
          messageTime: "2026-08-09T00:00:00.000Z",
        },
      ],
      graphSnapshot: {
        entities: [
          {
            id: "entity-1",
            name: "Alice",
            entityType: "person",
            firstSeenAt: "2026-08-09T00:00:00.000Z",
            lastSeenAt: "2026-08-09T00:00:00.000Z",
          },
        ],
        relations: [
          {
            id: "relation-1",
            relationType: "asked_for",
            claim: "Alice asked for the proposal.",
            status: "active",
            confidence: 85,
            firstSeenAt: "2026-08-09T00:00:00.000Z",
          },
        ],
        stats: {
          entityCount: 1,
          relationCount: 1,
          activeRelationCount: 1,
          evidenceCount: 1,
        },
      },
    });

    expect(snapshot.scene).toBe("workshop");
    expect(snapshot.generatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(snapshot.stats).toMatchObject({
      rawEventCount: 1,
      taskCount: 1,
      candidateCount: 1,
      confirmedMemoryCount: 1,
      noteCount: 1,
      graphEntityCount: 1,
      graphRelationCount: 1,
    });
    expect(snapshot.confirmedMemories[0]).toMatchObject({
      id: "memory-1",
      title: "Alice",
      state: "confirmed",
    });
    expect(snapshot.conversations[0]).toMatchObject({
      conversationId: "wx-1",
      messageCount: 1,
    });
    expect(snapshot.graph.people[0]?.title).toBe("Alice");
    expect(snapshot.warnings[0]).toContain("Brain legacy adapter");
  });

  it("keeps candidate listing deterministic", () => {
    const result = listOwnerContextCandidatesFromLegacy({
      statuses: ["candidate"],
      generatedAt: "2026-08-10T00:00:00.000Z",
      wiki: {
        tasks: [
          {
            id: "task-older",
            title: "Older task",
            status: "candidate",
            createdAt: "2026-08-09T00:00:00.000Z",
          },
        ],
        memories: [
          {
            id: "memory-newer",
            subject: "Newer memory",
            content: "Candidate memory.",
            status: "candidate",
            createdAt: "2026-08-09T01:00:00.000Z",
          },
        ],
      },
    });

    expect(result.generatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(result.candidates.map((item) => item.id)).toEqual([
      "memory-newer",
      "task-older",
    ]);
    expect(result.stats).toEqual({
      taskCount: 1,
      memoryCount: 1,
      totalCount: 2,
    });
  });
});
