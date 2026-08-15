import { describe, expect, it } from "vitest";
import type {
  LoopState,
  Workshop,
  WorkshopDirective,
  WorkshopEvent,
  WorkshopMemory,
  WorkshopSource,
} from "@/lib/db/schema";
import {
  prepareLoopContextWindow,
  prepareLoopWorkshopContext,
} from "@/lib/loops/context-window";
import { parseLoopSpec } from "@/lib/loops/spec";

const loopSpec = parseLoopSpec({
  goal: "Send a daily report",
  trigger: { type: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
  context: { sources: [] },
  actions: { allowed: ["wechatDesktopSendMessage"], requiresApproval: [], denied: [] },
  verification: {
    type: "structured_check",
    requiredSources: ["wechatDesktopSendMessage"],
  },
});

function state(overrides: Partial<LoopState> = {}): LoopState {
  return {
    loopId: "loop-1",
    currentPhase: "idle",
    memorySummary: null,
    openQuestions: [],
    lastObservation: null,
    nextAction: null,
    blockedReason: null,
    stateJson: {},
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  } as LoopState;
}

function workshop(overrides: Partial<Workshop> = {}): Workshop {
  return {
    id: "workshop-1",
    userId: "user-1",
    name: "Market watcher",
    mission: "Track market risks and brief the owner.",
    status: "active",
    autonomyLevel: "draft",
    boundaryPolicy: {
      externalMessages: "draft",
      allowedRecipients: ["Alice"],
    },
    modelConfig: {},
    createdAt: new Date("2026-06-30T00:00:00.000Z"),
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  } as Workshop;
}

function source(overrides: Partial<WorkshopSource> = {}): WorkshopSource {
  return {
    id: "source-1",
    workshopId: "workshop-1",
    type: "note",
    name: "Watchlist",
    uri: null,
    content: "Important source context",
    config: {},
    enabled: true,
    lastCheckedAt: null,
    createdAt: new Date("2026-06-30T00:00:00.000Z"),
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  } as WorkshopSource;
}

function memory(overrides: Partial<WorkshopMemory> = {}): WorkshopMemory {
  return {
    id: "memory-1",
    workshopId: "workshop-1",
    kind: "finding",
    content: "Owner prefers concise morning briefings.",
    confidence: 80,
    tags: ["briefing"],
    sourceEventIds: ["event-1"],
    expiresAt: null,
    createdAt: new Date("2026-06-30T00:00:00.000Z"),
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  } as WorkshopMemory;
}

function directive(
  overrides: Partial<WorkshopDirective> = {},
): WorkshopDirective {
  return {
    id: "directive-1",
    workshopId: "workshop-1",
    runId: null,
    content: "Always include opposing risks.",
    priority: 1,
    scope: "persistent",
    status: "active",
    createdAt: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  } as WorkshopDirective;
}

function event(overrides: Partial<WorkshopEvent> = {}): WorkshopEvent {
  return {
    id: "event-1",
    workshopId: "workshop-1",
    runId: null,
    loopId: "loop-1",
    loopRunId: "loop-run-1",
    seq: 1,
    type: "source_checked",
    title: "Checked source",
    body: "Useful recent event context",
    metadata: {},
    visibility: "user",
    createdAt: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  } as WorkshopEvent;
}

describe("loop context window", () => {
  it("keeps small durable state unchanged", () => {
    const result = prepareLoopContextWindow({
      loopSpec,
      state: state({
        stateJson: {
          loopSpec,
          lastLoopRunId: "run-1",
        },
      }),
      maxChars: 10_000,
    });

    expect(result.compacted).toBe(false);
    expect(result.durableState.stateJson).toMatchObject({
      lastLoopRunId: "run-1",
    });
  });

  it("compacts oversized state while preserving essential loop state", () => {
    const result = prepareLoopContextWindow({
      loopSpec,
      state: state({
        memorySummary: "important memory",
        openQuestions: Array.from({ length: 20 }, (_, index) => ({
          id: index,
        })),
        stateJson: {
          loopSpec,
          lastLoopRunId: "run-2",
          nextScheduledRunAt: "2026-06-30T01:00:00.000Z",
          noisyScratchpad: "x".repeat(20_000),
        },
      }),
      maxChars: 3_000,
    });

    expect(result.compacted).toBe(true);
    expect(result.durableState.memorySummary).toBe("important memory");
    expect(result.durableState.openQuestions).toHaveLength(8);
    expect(result.durableState.stateJson).toMatchObject({
      lastLoopRunId: "run-2",
      nextScheduledRunAt: "2026-06-30T01:00:00.000Z",
    });
    expect(result.durableState.stateJson.loopSpec).toBeTruthy();
    expect(result.omittedStateKeys).toContain("noisyScratchpad");
    expect(result.durableState.stateJson._contextCompaction).toMatchObject({
      omittedStateKeys: ["noisyScratchpad"],
    });
  });

  it("prepares bounded workshop context for workshop-owned loops", () => {
    const result = prepareLoopWorkshopContext({
      workshop: workshop(),
      sources: [
        source({ id: "enabled-source", name: "Enabled source" }),
        source({
          id: "disabled-source",
          name: "Disabled source",
          enabled: false,
        }),
      ],
      memories: [memory()],
      directives: [
        directive({ id: "persistent-directive", scope: "persistent" }),
        directive({
          id: "current-run-directive",
          scope: "current_run",
          content: "Only for an unrelated live run.",
        }),
      ],
      events: [event()],
      maxChars: 10_000,
    });

    expect(result.compacted).toBe(false);
    expect(result.workshop).toMatchObject({
      id: "workshop-1",
      name: "Market watcher",
    });
    expect(result.boundaryPolicy).toContain("External messages: draft");
    expect(result.sources.map((item) => item.id)).toEqual(["enabled-source"]);
    expect(result.directives.map((item) => item.id)).toEqual([
      "persistent-directive",
    ]);
    expect(result.memories[0]).toMatchObject({
      kind: "finding",
      tags: ["briefing"],
    });
    expect(result.memoryContext).toMatchObject({
      controlModel: "engineering_cybernetics_v1",
    });
    expect(result.memoryContext.taskRelevantMemories[0]).toMatchObject({
      kind: "finding",
    });
    expect(result.recentEvents[0]).toMatchObject({
      loopId: "loop-1",
      loopRunId: "loop-run-1",
    });
  });

  it("compacts oversized workshop context", () => {
    const result = prepareLoopWorkshopContext({
      workshop: workshop({ mission: "x".repeat(1000) }),
      sources: Array.from({ length: 30 }, (_, index) =>
        source({
          id: `source-${index}`,
          content: `source-${index} ${"x".repeat(2_000)}`,
        }),
      ),
      memories: Array.from({ length: 50 }, (_, index) =>
        memory({
          id: `memory-${index}`,
          content: `memory-${index} ${"y".repeat(2_000)}`,
        }),
      ),
      directives: Array.from({ length: 40 }, (_, index) =>
        directive({
          id: `directive-${index}`,
          content: `directive-${index} ${"z".repeat(2_000)}`,
        }),
      ),
      events: Array.from({ length: 40 }, (_, index) =>
        event({
          id: `event-${index}`,
          seq: index + 1,
          body: `event-${index} ${"w".repeat(2_000)}`,
        }),
      ),
      maxChars: 5_000,
    });

    expect(result.compacted).toBe(true);
    expect(result.sources.length).toBeLessThanOrEqual(10);
    expect(result.memories.length).toBeLessThanOrEqual(20);
    expect(result.directives.length).toBeLessThanOrEqual(15);
    expect(result.recentEvents.length).toBeLessThanOrEqual(20);
    expect(result.omittedSections).toEqual(
      expect.arrayContaining([
        "sources",
        "memories",
        "directives",
        "recentEvents",
      ]),
    );
  });
});
