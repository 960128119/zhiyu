import { z } from "zod";
import { HARNESS_COMPONENT_TYPES } from "./types";

const evidenceRefSchema = z.object({
  kind: z.enum([
    "workshop_event",
    "workshop_run",
    "loop_run",
    "brain_context_log",
    "memory",
    "tool_result",
    "owner_feedback",
    "artifact",
  ]),
  id: z.string().min(1),
  claim: z.string().min(1),
  observedAt: z.string().nullable(),
  freshness: z.enum(["fresh", "stale", "unknown"]),
  integrity: z.enum(["verified", "unverified", "missing"]),
});

const predictionSchema = z.object({
  scenarioId: z.string().min(1),
  expectedDirection: z.enum(["improve", "unchanged", "regress"]),
  metric: z.string().min(1),
  threshold: z.union([z.number(), z.string().min(1)]),
  rationale: z.string().min(1),
});

export const harnessChangeProposalInputSchema = z.object({
  id: z.string().min(1).optional(),
  workId: z.string().min(1),
  scope: z.enum(["work", "platform"]),
  affectedWorkIds: z.array(z.string().min(1)).min(1),
  baseWorkVersionId: z.string().min(1),
  baseHarnessSnapshotId: z.string().min(1),
  baseComponentSetHash: z.string().min(1),
  proposedBy: z.enum(["owner", "chat_agent", "workshop_agent", "quality_work"]),
  riskLevel: z.enum(["low", "medium", "high", "protected"]),
  failurePattern: z.string().min(1),
  evidenceRefs: z.array(evidenceRefSchema).min(1),
  rootCauseHypothesis: z.string().min(1),
  changes: z
    .array(
      z.object({
        componentId: z.string().min(1),
        componentType: z.enum(HARNESS_COMPONENT_TYPES),
        beforeRevisionId: z.string().min(1),
        componentMutability: z.enum([
          "observe_only",
          "proposal_only",
          "owner_editable",
          "system_protected",
        ]),
        componentRiskLevel: z.enum(["low", "medium", "high", "protected"]),
        patch: z.record(z.string(), z.unknown()),
        rationale: z.string().min(1),
        groupKey: z.string().nullable().optional(),
      }),
    )
    .min(1),
  predictedFixes: z.array(predictionSchema).min(1),
  predictedRegressions: z.array(predictionSchema).min(1),
  successMetrics: z
    .array(
      z.object({
        scenarioId: z.string().min(1),
        metric: z.string().min(1),
        operator: z.enum([">", ">=", "=", "<=", "<", "no_regression"]),
        target: z.union([z.number(), z.string().min(1)]),
        severity: z.enum(["objective", "guardrail", "cost"]),
      }),
    )
    .min(1),
  evaluationSuiteId: z.string().min(1),
  evaluationScenarioIds: z.array(z.string().min(1)).min(1),
  evaluationWindow: z.record(z.string(), z.unknown()),
  rollbackPlan: z.object({
    strategy: z.enum(["restore_component_revision", "restore_work_version"]),
    targetRevisionIds: z.array(z.string().min(1)).min(1),
    triggerConditions: z.array(z.string().min(1)).min(1),
    verificationScenarioIds: z.array(z.string().min(1)).min(1),
    ownerApprovalRequired: z.boolean(),
  }),
  attributionLimited: z.boolean(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
