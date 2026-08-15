import { describe, expect, it } from "vitest";
import type {
  Workshop,
  WorkshopDirective,
  WorkshopMemory,
} from "@/lib/db/schema";
import {
  buildWorkshopMemoryContextPack,
  formatWorkshopMemoryContextPack,
} from "@/lib/workshops/memory-context";

function workshop(overrides: Partial<Workshop> = {}): Workshop {
  return {
    id: "workshop-1",
    userId: "user-1",
    name: "Paper trader",
    mission: "Manage the paper-trading portfolio with market rules.",
    status: "active",
    autonomyLevel: "auto",
    boundaryPolicy: {},
    modelConfig: {},
    createdAt: new Date("2026-07-29T00:00:00.000Z"),
    updatedAt: new Date("2026-07-29T00:00:00.000Z"),
    ...overrides,
  } as Workshop;
}

function directive(
  overrides: Partial<WorkshopDirective> = {},
): WorkshopDirective {
  return {
    id: "directive-1",
    workshopId: "workshop-1",
    runId: null,
    content: "Before buying, check fund flow and risk boundaries.",
    priority: 1,
    scope: "persistent",
    status: "active",
    createdAt: new Date("2026-07-29T00:00:00.000Z"),
    ...overrides,
  } as WorkshopDirective;
}

function memory(overrides: Partial<WorkshopMemory> = {}): WorkshopMemory {
  return {
    id: "memory-1",
    workshopId: "workshop-1",
    kind: "finding",
    content: "Default memory.",
    confidence: 60,
    tags: [],
    sourceEventIds: [],
    expiresAt: null,
    createdAt: new Date("2026-07-29T00:00:00.000Z"),
    updatedAt: new Date("2026-07-29T00:00:00.000Z"),
    ...overrides,
  } as WorkshopMemory;
}

describe("workshop memory context", () => {
  it("prioritizes task-relevant risk and lesson memories", () => {
    const pack = buildWorkshopMemoryContextPack({
      workshop: workshop(),
      directives: [directive()],
      memories: [
        memory({
          id: "risk-rule",
          kind: "mistake",
          content:
            "Distribution signal rule: do not add after price jumps while main fund flow is negative.",
          confidence: 90,
          tags: ["fund-flow", "risk"],
          sourceEventIds: ["event-risk"],
        }),
        memory({
          id: "briefing-style",
          kind: "preference",
          content: "Owner prefers concise summaries.",
          confidence: 95,
          tags: ["briefing"],
        }),
      ],
      taskIntent: "Review buy risk with fund flow distribution signal.",
      now: new Date("2026-07-30T00:00:00.000Z"),
    });

    expect(pack.controlModel).toBe("engineering_cybernetics_v1");
    expect(pack.taskRelevantMemories[0].id).toBe("risk-rule");
    expect(pack.riskBoundaries.map((item) => item.id)).toContain("risk-rule");
    expect(pack.recentLessons.map((item) => item.id)).toContain("risk-rule");
    expect(pack.coreState.map((item) => item.id)).toContain("briefing-style");
    expect(pack.evidenceRefs).toContain("event-risk");
  });

  it("filters expired memories and exposes open questions", () => {
    const pack = buildWorkshopMemoryContextPack({
      workshop: workshop(),
      directives: [],
      memories: [
        memory({
          id: "expired",
          kind: "boundary",
          content: "Expired rule.",
          expiresAt: new Date("2026-07-01T00:00:00.000Z"),
        }),
      ],
      now: new Date("2026-07-30T00:00:00.000Z"),
    });

    expect(pack.stats).toMatchObject({
      totalMemories: 1,
      activeMemories: 0,
      candidateMemories: 0,
      expiredMemories: 1,
    });
    expect(pack.taskRelevantMemories).toEqual([]);
    expect(pack.openQuestions.join(" ")).toContain(
      "No active durable workshop memory",
    );
  });

  it("lets self-evolving memories participate while keeping candidates out", () => {
    const pack = buildWorkshopMemoryContextPack({
      workshop: workshop(),
      directives: [],
      memories: [
        memory({
          id: "candidate",
          kind: "boundary",
          content: "Candidate rule should wait for review.",
          confidence: 100,
          status: "candidate",
        } as Partial<WorkshopMemory>),
        memory({
          id: "active",
          kind: "boundary",
          content: "Active rule is available to the agent.",
          confidence: 100,
          status: "active",
        } as Partial<WorkshopMemory>),
        memory({
          id: "verified",
          kind: "finding",
          content: "Verified rule has repeated supporting outcomes.",
          confidence: 100,
          status: "verified",
        } as Partial<WorkshopMemory>),
        memory({
          id: "weakened",
          kind: "finding",
          content: "Weakened rule still participates with lower weight.",
          confidence: 100,
          status: "weakened",
        } as Partial<WorkshopMemory>),
      ],
      taskIntent: "rule",
      now: new Date("2026-07-30T00:00:00.000Z"),
    });

    expect(pack.stats).toMatchObject({
      totalMemories: 4,
      activeMemories: 3,
      candidateMemories: 1,
      verifiedMemories: 1,
      weakenedMemories: 1,
    });
    expect(pack.taskRelevantMemories.map((item) => item.id)).toContain(
      "active",
    );
    expect(pack.taskRelevantMemories.map((item) => item.id)).toContain(
      "verified",
    );
    expect(pack.taskRelevantMemories.map((item) => item.id)).toContain(
      "weakened",
    );
    expect(pack.taskRelevantMemories.map((item) => item.id)).not.toContain(
      "candidate",
    );
  });

  it("formats the pack for prompt injection", () => {
    const text = formatWorkshopMemoryContextPack(
      buildWorkshopMemoryContextPack({
        workshop: workshop(),
        directives: [],
        memories: [
          memory({
            kind: "boundary",
            content: "Never place real broker orders.",
            confidence: 100,
          }),
        ],
        taskIntent: "paper trading order decision",
      }),
    );

    expect(text).toContain("Control model: engineering_cybernetics_v1");
    expect(text).toContain("Core state:");
    expect(text).toContain("Never place real broker orders.");
  });
});
