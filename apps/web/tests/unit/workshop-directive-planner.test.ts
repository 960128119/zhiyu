import { describe, expect, it } from "vitest";
import type {
  Loop,
  Workshop,
  WorkshopDirective,
  WorkshopEvent,
  WorkshopMemory,
  WorkshopSource,
} from "@/lib/db/schema";
import {
  buildWorkshopDirectivePlannerPrompt,
  parseWorkshopDirectivePlan,
} from "@/lib/workshops/directive-planner";

const now = new Date("2026-07-07T00:00:00.000Z");

function workshop(overrides: Partial<Workshop> = {}): Workshop {
  return {
    id: "workshop-1",
    userId: "user-1",
    name: "盘前研究车间",
    mission: "每个交易日开盘前生成关注列表并记录依据。",
    status: "active",
    autonomyLevel: "draft",
    boundaryPolicy: {},
    modelConfig: {},
    createdAt: now,
    updatedAt: now,
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
    content: "每个交易日开盘前生成关注列表",
    priority: 0,
    scope: "current_run",
    status: "active",
    createdAt: now,
    ...overrides,
  } as WorkshopDirective;
}

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: "loop-1",
    userId: "user-1",
    workshopId: "workshop-1",
    name: "已有盘前任务",
    description: "每个交易日 09:00 生成关注列表",
    goal: "生成盘前关注列表",
    status: "paused",
    triggerConfig: { type: "cron", expression: "0 9 * * 1-5" },
    contextConfig: {},
    actionPolicy: {},
    verificationConfig: {},
    approvalPolicy: {},
    retryPolicy: {},
    escalationPolicy: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Loop;
}

describe("workshop directive planner", () => {
  it("builds a planning prompt with structured action choices", () => {
    const prompt = buildWorkshopDirectivePlannerPrompt({
      workshop: workshop(),
      directive: directive(),
      activeDirectives: [directive()],
      loops: [loop()],
      sources: [
        {
          id: "source-1",
          workshopId: "workshop-1",
          type: "manual",
          name: "Watchlist source",
          uri: null,
          content: "Use market heat and announcements.",
          config: {},
          enabled: true,
          lastCheckedAt: null,
          createdAt: now,
          updatedAt: now,
        } as WorkshopSource,
      ],
      memories: [
        {
          id: "memory-1",
          workshopId: "workshop-1",
          kind: "preference",
          content: "Owner prefers concise lists.",
          confidence: 90,
          tags: [],
          sourceEventIds: [],
          expiresAt: null,
          createdAt: now,
          updatedAt: now,
        } as WorkshopMemory,
      ],
      events: [
        {
          id: "event-1",
          workshopId: "workshop-1",
          runId: null,
          loopId: null,
          loopRunId: null,
          seq: 1,
          type: "directive_added",
          title: "收到方向",
          body: "每个交易日开盘前生成关注列表",
          metadata: {},
          visibility: "user",
          createdAt: now,
        } as WorkshopEvent,
      ],
    });

    expect(prompt).toContain("create_loop_task");
    expect(prompt).toContain("run_once");
    expect(prompt).toContain("ask_clarification");
    expect(prompt).toContain("每个交易日开盘前生成关注列表");
    expect(prompt).toContain("Existing workshop tasks");
  });

  it("parses fenced JSON decisions", () => {
    const plan = parseWorkshopDirectivePlan(`\`\`\`json
{
  "action": "create_loop_task",
  "confidence": 0.92,
  "reason": "The directive describes a trading-day pre-open routine.",
  "taskIntent": "Every trading day before market open, generate a watchlist with sources and success criteria."
}
\`\`\``);

    expect(plan).toEqual({
      action: "create_loop_task",
      confidence: 0.92,
      reason: "The directive describes a trading-day pre-open routine.",
      taskIntent:
        "Every trading day before market open, generate a watchlist with sources and success criteria.",
      clarificationQuestion: undefined,
      subtasks: undefined,
      duplicateOf: undefined,
    });
  });
});
