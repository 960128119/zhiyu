import { describe, expect, it } from "vitest";
import {
  emptyBrainBackfillReport,
  interactionMemoryRowToBrainBackfill,
  trackBackfilledMemory,
  workshopMemoryRowToBrainBackfill,
} from "@/lib/brain/backfill";

describe("brain backfill helpers", () => {
  it("maps legacy interaction memories into deterministic Brain memories", () => {
    const memory = interactionMemoryRowToBrainBackfill({
      id: "interaction-1",
      userId: "user-1",
      memoryType: "preference",
      subject: "Alice",
      content: "Alice prefers concise updates.",
      status: "confirmed",
      confidence: 88,
      sourceEventIds: JSON.stringify(["event-1"]),
      tags: JSON.stringify(["wechat"]),
      createdAt: "2026-08-10T00:00:00.000Z",
    });

    expect(memory).toMatchObject({
      id: "interaction-1",
      userId: "user-1",
      scope: { type: "global" },
      ownerType: "chat",
      ownerId: "user-1",
      memoryType: "preference",
      status: "verified",
      evidenceRefs: ["event-1"],
    });
  });

  it("maps legacy workshop memories into workshop-scoped Brain memories", () => {
    const memory = workshopMemoryRowToBrainBackfill({
      workshop: { id: "workshop-1", userId: "user-1" },
      memory: {
        id: "memory-1",
        kind: "boundary",
        content: "Never place real orders.",
        confidence: 90,
        tags: ["risk"],
        sourceEventIds: ["event-1"],
        createdAt: "2026-08-10T00:00:00.000Z",
      },
    });

    expect(memory).toMatchObject({
      id: "memory-1",
      scope: { type: "workshop", workshopId: "workshop-1" },
      ownerType: "work",
      ownerId: "workshop-1",
      memoryType: "boundary",
      evidenceRefs: ["event-1"],
    });
  });

  it("tracks missing evidence and skipped rows in migration reports", () => {
    const report = emptyBrainBackfillReport();
    trackBackfilledMemory(report, null);
    trackBackfilledMemory(report, {
      id: "memory-1",
      userId: "user-1",
      scope: { type: "global" },
      ownerType: "chat",
      ownerId: "user-1",
      memoryType: "fact",
      subject: "No evidence",
      content: "Missing source event.",
      status: "candidate",
      confidence: 50,
      evidenceRefs: [],
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      scanned: 2,
      skipped: 1,
      memories: 1,
      missingEvidence: 1,
    });
  });
});
