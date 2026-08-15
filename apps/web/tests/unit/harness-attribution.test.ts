import { describe, expect, it } from "vitest";
import { attributeHarnessEvolution } from "@/lib/harness-evolution";
import type {
  HarnessChangeProposalV2,
  HarnessEvaluationResult,
} from "@/lib/harness-evolution";

function proposal(
  overrides: Partial<HarnessChangeProposalV2> = {},
): HarnessChangeProposalV2 {
  return {
    interfaceVersion: "harness-change-proposal.v2",
    id: "proposal-1",
    workId: "work-1",
    scope: "work",
    affectedWorkIds: ["work-1"],
    baseWorkVersionId: "version-1",
    baseHarnessSnapshotId: "snapshot-1",
    baseComponentSetHash: "hash-1",
    proposedBy: "quality_work",
    riskLevel: "medium",
    failurePattern: "Current observations are ignored.",
    evidenceRefs: [],
    rootCauseHypothesis: "The context policy drops current observations.",
    changes: [
      {
        componentId: "context-1",
        componentType: "context_policy",
        beforeRevisionId: "revision-1",
        componentMutability: "proposal_only",
        componentRiskLevel: "medium",
        patch: { strategy: "prefer_current_observation" },
        rationale: "Keep current facts ahead of recalled memory.",
      },
    ],
    predictedFixes: [
      {
        scenarioId: "memory.current_state",
        expectedDirection: "improve",
        metric: "taskScore",
        threshold: 0.2,
        rationale: "Current-state answers should improve materially.",
      },
    ],
    predictedRegressions: [
      {
        scenarioId: "memory.durable_boundary",
        expectedDirection: "unchanged",
        metric: "taskScore",
        threshold: 0.05,
        rationale: "Durable-memory boundaries must not regress.",
      },
    ],
    successMetrics: [],
    evaluationSuiteId: "suite-1",
    evaluationScenarioIds: ["memory.current_state", "memory.durable_boundary"],
    evaluationWindow: {},
    rollbackPlan: {
      strategy: "restore_component_revision",
      targetRevisionIds: ["revision-1"],
      triggerConditions: ["hard invariant failure"],
      verificationScenarioIds: ["memory.durable_boundary"],
      ownerApprovalRequired: true,
    },
    attributionLimited: false,
    status: "evaluating",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}

function evaluation(
  overrides: Partial<HarnessEvaluationResult> = {},
): HarnessEvaluationResult {
  return {
    interfaceVersion: "harness-evaluation.v1",
    status: "passed",
    recommendedAction: "keep",
    fixedScenarios: ["memory.current_state"],
    regressedScenarios: [],
    hardInvariantFailures: [],
    comparisons: [
      {
        scenarioId: "memory.current_state",
        baseline: { taskScore: 0.5 },
        candidate: { taskScore: 0.8 },
        delta: { taskScore: 0.3 },
        sampleSize: { baseline: 3, candidate: 3 },
      },
      {
        scenarioId: "memory.durable_boundary",
        baseline: { taskScore: 0.9 },
        candidate: { taskScore: 0.88 },
        delta: { taskScore: -0.02 },
        sampleSize: { baseline: 3, candidate: 3 },
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("harness evolution attribution", () => {
  it("confirms a proposal only when fix and guard predictions are supported", () => {
    const verdict = attributeHarnessEvolution({
      proposal: proposal(),
      evaluation: evaluation(),
      evaluationCampaignId: "campaign-1",
    });

    expect(verdict.status).toBe("confirmed");
    expect(verdict.recommendedAction).toBe("keep");
    expect(verdict.predictionAccuracy).toBe(1);
    expect(verdict.confirmedPredictions).toHaveLength(2);
  });

  it("returns partial when the target improves but a prediction misses", () => {
    const verdict = attributeHarnessEvolution({
      proposal: proposal(),
      evaluation: evaluation({
        comparisons: [
          ...evaluation().comparisons.slice(0, 1),
          {
            scenarioId: "memory.durable_boundary",
            baseline: { taskScore: 0.9 },
            candidate: { taskScore: 0.8 },
            delta: { taskScore: -0.1 },
            sampleSize: { baseline: 3, candidate: 3 },
          },
        ],
      }),
      evaluationCampaignId: "campaign-1",
    });

    expect(verdict.status).toBe("partial");
    expect(verdict.recommendedAction).toBe("revise");
    expect(verdict.refutedPredictions).toHaveLength(1);
  });

  it("rejects and recommends rollback when a hard invariant fails", () => {
    const verdict = attributeHarnessEvolution({
      proposal: proposal(),
      evaluation: evaluation({
        status: "rejected",
        recommendedAction: "rollback",
        hardInvariantFailures: [
          {
            scenarioId: "boundary.no_external_send",
            failures: ["external_send_attempted"],
          },
        ],
      }),
      evaluationCampaignId: "campaign-1",
    });

    expect(verdict.status).toBe("rejected");
    expect(verdict.recommendedAction).toBe("rollback");
  });

  it("stays inconclusive when evaluation evidence is insufficient", () => {
    const verdict = attributeHarnessEvolution({
      proposal: proposal(),
      evaluation: evaluation({
        status: "inconclusive",
        recommendedAction: "collect_more_data",
        comparisons: [],
      }),
      evaluationCampaignId: "campaign-1",
    });

    expect(verdict.status).toBe("inconclusive");
    expect(verdict.recommendedAction).toBe("collect_more_data");
    expect(verdict.unresolvedPredictions).toHaveLength(2);
  });
});
