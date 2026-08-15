import { describe, expect, it } from "vitest";
import {
  assertHarnessProposalBase,
  assertHarnessProposalTransition,
  createHarnessChangeProposal,
  HarnessProposalStaleError,
  HarnessProposalValidationError,
} from "@/lib/harness-evolution";

function validInput() {
  return {
    id: "proposal-1",
    workId: "work-1",
    scope: "work" as const,
    affectedWorkIds: ["work-1"],
    baseWorkVersionId: "version-1",
    baseHarnessSnapshotId: "snapshot-1",
    baseComponentSetHash: "hash-1",
    proposedBy: "quality_work" as const,
    riskLevel: "low" as const,
    failurePattern: "Fresh state evidence ranked below an older memory.",
    evidenceRefs: [
      {
        kind: "brain_context_log" as const,
        id: "context-1",
        claim: "Older memory ranked above same-day evidence.",
        observedAt: "2026-08-12T00:00:00.000Z",
        freshness: "fresh" as const,
        integrity: "verified" as const,
      },
    ],
    rootCauseHypothesis: "Freshness weight is weaker than lexical overlap.",
    changes: [
      {
        componentId: "component-1",
        componentType: "memory_profile" as const,
        beforeRevisionId: "revision-1",
        componentMutability: "owner_editable" as const,
        componentRiskLevel: "low" as const,
        patch: { freshnessBoost: 40 },
        rationale: "Raise fresh evidence for current-state intents.",
      },
    ],
    predictedFixes: [
      {
        scenarioId: "memory.current_state",
        expectedDirection: "improve" as const,
        metric: "freshTop3Rate",
        threshold: 0.9,
        rationale: "Fresh current state should rank in the top three.",
      },
    ],
    predictedRegressions: [
      {
        scenarioId: "memory.durable_boundary",
        expectedDirection: "unchanged" as const,
        metric: "boundaryRecallRate",
        threshold: "no_regression",
        rationale: "Durable boundary recall must remain stable.",
      },
    ],
    successMetrics: [
      {
        scenarioId: "memory.current_state",
        metric: "freshTop3Rate",
        operator: ">=" as const,
        target: 0.9,
        severity: "objective" as const,
      },
    ],
    evaluationSuiteId: "suite-1",
    evaluationScenarioIds: ["memory.current_state", "memory.durable_boundary"],
    evaluationWindow: { repetitions: 2 },
    rollbackPlan: {
      strategy: "restore_component_revision" as const,
      targetRevisionIds: ["revision-1"],
      triggerConditions: [
        "hard invariant failure",
        "boundary recall regression",
      ],
      verificationScenarioIds: ["memory.durable_boundary"],
      ownerApprovalRequired: true,
    },
    attributionLimited: false,
    expiresAt: null,
    createdAt: "2026-08-12T00:00:00.000Z",
  };
}

describe("harness change proposals", () => {
  it("creates a complete falsifiable proposal", () => {
    const proposal = createHarnessChangeProposal(validInput());

    expect(proposal.interfaceVersion).toBe("harness-change-proposal.v2");
    expect(proposal.status).toBe("proposed");
    expect(proposal.changes).toHaveLength(1);
  });

  it("rejects protected components and evidence-free proposals", () => {
    expect(() =>
      createHarnessChangeProposal({
        ...validInput(),
        evidenceRefs: [],
        changes: [
          {
            ...validInput().changes[0],
            componentType: "tool_implementation" as const,
            componentMutability: "system_protected" as const,
            componentRiskLevel: "protected" as const,
          },
        ],
      }),
    ).toThrowError(HarnessProposalValidationError);
  });

  it("requires explicit limited attribution for multiple component types", () => {
    expect(() =>
      createHarnessChangeProposal({
        ...validInput(),
        changes: [
          ...validInput().changes,
          {
            ...validInput().changes[0],
            componentId: "component-2",
            componentType: "loop_spec" as const,
          },
        ],
      }),
    ).toThrowError(HarnessProposalValidationError);
  });

  it("prevents platform-scope self evolution by the Quality Work", () => {
    expect(() =>
      createHarnessChangeProposal({
        ...validInput(),
        scope: "platform" as const,
      }),
    ).toThrowError(HarnessProposalValidationError);
  });

  it("enforces optimistic locks and monotonic proposal state", () => {
    expect(() =>
      assertHarnessProposalBase(
        createHarnessChangeProposal(validInput()),
        "version-2",
        "snapshot-2",
        "hash-2",
      ),
    ).toThrowError(HarnessProposalStaleError);
    expect(() =>
      assertHarnessProposalTransition("confirmed", "approved"),
    ).toThrowError(HarnessProposalValidationError);
    expect(assertHarnessProposalTransition("proposed", "approved")).toBe(true);
  });
});
