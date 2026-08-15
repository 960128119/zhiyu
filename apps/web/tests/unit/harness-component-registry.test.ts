import { describe, expect, it } from "vitest";
import type { Loop, Workshop } from "@/lib/db/schema";
import type { AgentToolMatrix } from "@/lib/agent-tools/types";
import type { WorkshopWorkModel } from "@/lib/workshops/work-model";
import { deriveWorkHarnessComponents } from "@/lib/harness-evolution";

const now = new Date("2026-08-12T00:00:00.000Z");

describe("harness component registry", () => {
  it("derives orthogonal work and platform components from the current Work model", () => {
    const workshop = {
      id: "work-1",
      userId: "user-1",
      name: "Watchlist hunter",
      mission: "Maintain the watchlist.",
      status: "active",
      autonomyLevel: "draft",
      boundaryPolicy: { externalMessages: "approval_required" },
      modelConfig: { contextTokenBudget: 12000 },
      createdAt: now,
      updatedAt: now,
    } as Workshop;
    const loops = [
      {
        id: "loop-1",
        userId: "user-1",
        workshopId: "work-1",
        name: "Post-close selection",
        description: null,
        goal: "Refresh candidates.",
        status: "active",
        triggerConfig: { type: "manual" },
        contextConfig: { includePositions: true },
        actionPolicy: { denied: ["quantPaperPlaceOrder"] },
        verificationConfig: {
          requiredFields: ["candidatePool"],
          protected: true,
        },
        approvalPolicy: {},
        retryPolicy: { maxAttempts: 2 },
        escalationPolicy: {},
        createdAt: now,
        updatedAt: now,
      } as Loop,
    ];
    const workModel = {
      manifest: {
        id: "work-1",
        name: "Watchlist hunter",
        role: "watchlist_selector",
        mission: "Maintain the watchlist.",
        status: "active",
        autonomyLevel: "draft",
        version: "work-v1",
        updatedAt: now.toISOString(),
      },
      controlContract: {
        controlledObjects: ["current_watchlist"],
        observations: ["quantPaperGetWatchlist"],
        allowedActions: ["quantPaperGetWatchlist"],
        approvalRequiredActions: ["workshopCreateWeChatOutbox"],
        deniedActions: ["quantPaperPlaceOrder"],
        boundaryMode: "draft",
        externalMessagePolicy: "approval_required",
        feedbackSignals: ["candidate_followup_performance"],
        conflicts: [],
      },
      skillBindings: {
        primarySkills: ["watchlist-selection-control"],
        loopSkillMap: {
          "Post-close selection": "watchlist-selection-control",
        },
        availableSkills: ["watchlist-selection-control"],
        missingSkills: [],
      },
      loopBindings: [],
      memoryPolicy: {
        defaultReadableKinds: ["finding", "boundary"],
        evidenceRequiredForHighImpact: true,
        writeReusableFindingsToMemory: true,
        recallProfiles: [
          {
            id: "watchlist-current",
            matchTerms: ["current", "watchlist"],
            memoryTypeBoosts: { plan: 30 },
          },
        ],
      },
      artifactPolicy: {
        eventTypes: ["decision"],
        proposalTypes: ["watchlist_change_proposal"],
        outboxEnabled: true,
      },
      feedback: {
        nextWakeupAt: null,
        heartbeatStatus: null,
        pendingReviewSurfaces: ["workshop_review_tab"],
        feedbackSignals: ["candidate_followup_performance"],
      },
      observability: { missing: [], warnings: [] },
      changeControl: {
        proposalSurface: "workshop_review_tab",
        highRiskChanges: [],
        mediumRiskChanges: [],
        lowRiskChanges: [],
      },
    } satisfies WorkshopWorkModel;
    const toolMatrix = {
      runtime: "workshop",
      workshopId: "work-1",
      generatedAt: now.toISOString(),
      counts: {} as AgentToolMatrix["counts"],
      tools: [
        {
          id: "workshop:quantPaperPlaceOrder",
          name: "quantPaperPlaceOrder",
          displayName: "Place paper order",
          source: "workshop_tools",
          description: "Place an order in the paper account.",
          capabilities: ["unknown"],
          risk: "high",
          runtimeScopes: ["workshop", "loop"],
          availability: "deny",
          decisionReason: "role boundary",
        },
      ],
    } as AgentToolMatrix;

    const result = deriveWorkHarnessComponents({
      workshop,
      loops,
      workModel,
      toolMatrix,
      platformVersion: "build-1",
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "work.prompt", type: "prompt" }),
        expect.objectContaining({
          key: "work.skill-bindings",
          type: "skill",
          riskLevel: "medium",
        }),
        expect.objectContaining({
          key: "loop.loop-1.spec",
          type: "loop_spec",
          content: expect.not.objectContaining({
            verificationConfig: expect.anything(),
          }),
        }),
        expect.objectContaining({
          key: "loop.loop-1.verifier",
          type: "verifier",
          mutability: "system_protected",
          riskLevel: "protected",
        }),
        expect.objectContaining({
          key: "work.memory-profile",
          type: "memory_profile",
          riskLevel: "low",
        }),
        expect.objectContaining({
          key: "tool.quantPaperPlaceOrder.implementation",
          type: "tool_implementation",
          scope: { type: "platform", id: null },
          mutability: "system_protected",
        }),
      ]),
    );
  });
});
