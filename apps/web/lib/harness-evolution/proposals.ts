import type {
  CreateHarnessChangeProposalInput,
  HarnessChangeProposalV2,
  HarnessProposalStatus,
} from "./types";

export type HarnessProposalValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export class HarnessProposalValidationError extends Error {
  constructor(public readonly issues: HarnessProposalValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "HarnessProposalValidationError";
  }
}

export class HarnessProposalStaleError extends Error {
  code = "HARNESS_PROPOSAL_STALE" as const;

  constructor() {
    super("Harness proposal base version or snapshot is stale");
    this.name = "HarnessProposalStaleError";
  }
}

function requiredText(
  value: string,
  path: string,
  issues: HarnessProposalValidationIssue[],
) {
  if (!value.trim()) {
    issues.push({ code: "required", path, message: "A value is required." });
  }
}

export function createHarnessChangeProposal(
  input: CreateHarnessChangeProposalInput,
): HarnessChangeProposalV2 {
  const issues: HarnessProposalValidationIssue[] = [];
  requiredText(input.workId, "workId", issues);
  requiredText(input.baseWorkVersionId, "baseWorkVersionId", issues);
  requiredText(input.baseHarnessSnapshotId, "baseHarnessSnapshotId", issues);
  requiredText(input.baseComponentSetHash, "baseComponentSetHash", issues);
  requiredText(input.failurePattern, "failurePattern", issues);
  requiredText(input.rootCauseHypothesis, "rootCauseHypothesis", issues);
  requiredText(input.evaluationSuiteId, "evaluationSuiteId", issues);

  if (!input.affectedWorkIds.includes(input.workId)) {
    issues.push({
      code: "missing_affected_work",
      path: "affectedWorkIds",
      message: "The target Work must be included in affectedWorkIds.",
    });
  }
  if (
    input.evidenceRefs.length === 0 ||
    !input.evidenceRefs.some((reference) => reference.integrity === "verified")
  ) {
    issues.push({
      code: "verified_evidence_required",
      path: "evidenceRefs",
      message: "At least one verified evidence reference is required.",
    });
  }
  if (input.changes.length === 0) {
    issues.push({
      code: "change_required",
      path: "changes",
      message: "At least one component change is required.",
    });
  }
  for (const [index, change] of input.changes.entries()) {
    requiredText(change.componentId, `changes[${index}].componentId`, issues);
    requiredText(
      change.beforeRevisionId,
      `changes[${index}].beforeRevisionId`,
      issues,
    );
    requiredText(change.rationale, `changes[${index}].rationale`, issues);
    if (
      change.componentMutability === "system_protected" ||
      change.componentRiskLevel === "protected"
    ) {
      issues.push({
        code: "protected_component",
        path: `changes[${index}]`,
        message: "Protected Harness components cannot be changed at runtime.",
      });
    }
  }
  const componentTypes = new Set(
    input.changes.map((change) => change.componentType),
  );
  if (componentTypes.size > 1 && !input.attributionLimited) {
    issues.push({
      code: "multiple_component_types",
      path: "changes",
      message:
        "Multiple component types require attributionLimited to be explicit.",
    });
  }
  if (input.predictedFixes.length === 0) {
    issues.push({
      code: "prediction_required",
      path: "predictedFixes",
      message: "At least one falsifiable fix prediction is required.",
    });
  }
  if (input.predictedRegressions.length === 0) {
    issues.push({
      code: "regression_prediction_required",
      path: "predictedRegressions",
      message: "At least one regression guard prediction is required.",
    });
  }
  if (input.successMetrics.length === 0) {
    issues.push({
      code: "metric_required",
      path: "successMetrics",
      message: "At least one success or guardrail metric is required.",
    });
  }
  if (input.evaluationScenarioIds.length === 0) {
    issues.push({
      code: "scenario_required",
      path: "evaluationScenarioIds",
      message: "At least one evaluation scenario is required.",
    });
  }
  if (
    input.rollbackPlan.targetRevisionIds.length === 0 ||
    input.rollbackPlan.triggerConditions.length === 0 ||
    input.rollbackPlan.verificationScenarioIds.length === 0
  ) {
    issues.push({
      code: "rollback_incomplete",
      path: "rollbackPlan",
      message:
        "Rollback targets, triggers, and verification scenarios are required.",
    });
  }
  if (input.riskLevel === "protected") {
    issues.push({
      code: "protected_change",
      path: "riskLevel",
      message: "A protected change cannot become a runtime proposal.",
    });
  }
  if (input.scope === "platform" && input.proposedBy === "quality_work") {
    issues.push({
      code: "quality_work_platform_scope",
      path: "scope",
      message:
        "Harness Quality Work may report platform issues but cannot create an applicable platform proposal.",
    });
  }

  if (issues.length > 0) {
    throw new HarnessProposalValidationError(issues);
  }

  const now = input.createdAt ?? new Date().toISOString();
  return {
    interfaceVersion: "harness-change-proposal.v2",
    ...input,
    id: input.id ?? crypto.randomUUID(),
    status: "proposed",
    createdAt: now,
    updatedAt: now,
  };
}

const allowedTransitions: Record<
  HarnessProposalStatus,
  HarnessProposalStatus[]
> = {
  draft: ["proposed", "superseded"],
  proposed: ["approved", "rejected", "superseded"],
  approved: ["canary", "evaluating", "rejected", "superseded"],
  canary: ["evaluating", "rejected", "reverted", "superseded"],
  evaluating: ["confirmed", "partial", "rejected", "reverted"],
  confirmed: ["reverted"],
  partial: ["reverted"],
  rejected: [],
  reverted: [],
  superseded: [],
};

export function assertHarnessProposalTransition(
  current: HarnessProposalStatus,
  next: HarnessProposalStatus,
) {
  if (!allowedTransitions[current].includes(next)) {
    throw new HarnessProposalValidationError([
      {
        code: "invalid_transition",
        path: "status",
        message: `Cannot transition Harness proposal from ${current} to ${next}.`,
      },
    ]);
  }
  return true;
}

export function assertHarnessProposalBase(
  proposal: HarnessChangeProposalV2,
  currentWorkVersionId: string,
  currentHarnessSnapshotId: string,
  currentComponentSetHash: string,
) {
  if (
    proposal.baseWorkVersionId !== currentWorkVersionId ||
    proposal.baseHarnessSnapshotId !== currentHarnessSnapshotId ||
    proposal.baseComponentSetHash !== currentComponentSetHash
  ) {
    throw new HarnessProposalStaleError();
  }
  return true;
}
