import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import * as tables from "@/lib/db/schema-sqlite";
import {
  CORE_HARNESS_EVALUATION_SUITES,
  assembleWorkHarnessSnapshot,
  buildRunEvidenceBundle,
  createHarnessChangeProposal,
  createHarnessEvolutionRepository,
  runPersistedHarnessEvaluationCampaign,
  type HarnessComponentDefinition,
} from "@/lib/harness-evolution";

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    create table User (id text primary key not null);
    create table workshops (id text primary key not null, user_id text not null);
    create table workshop_work_versions (
      id text primary key not null,
      workshop_id text not null,
      version text not null
    );
    create table workshop_runs (id text primary key not null);
    create table loops (id text primary key not null, workshop_id text, user_id text not null);
    create table loop_runs (id text primary key not null, loop_id text not null);
  `);
  sqlite.exec(
    readFileSync(
      "lib/db/migrations-sqlite/0119_add_harness_evolution.sql",
      "utf8",
    ),
  );
  sqlite.exec(`
    insert into User (id) values ('user-1');
    insert into workshops (id, user_id) values ('work-1', 'user-1');
    insert into workshop_work_versions (id, workshop_id, version)
      values ('version-1', 'work-1', 'work-v1');
    insert into workshop_runs (id) values ('run-1');
  `);
  return { sqlite, database: drizzle(sqlite) };
}

function components(): HarnessComponentDefinition[] {
  return [
    {
      key: "work.memory-profile",
      type: "memory_profile",
      scope: { type: "work", id: "work-1" },
      owner: "work",
      mutability: "owner_editable",
      riskLevel: "low",
      sourceKind: "database",
      sourceRef: "workshops:work-1:modelConfig.memoryRecallProfiles",
      sourceVersion: "work-v1",
      content: { recallProfiles: [] },
    },
    {
      key: "tool.read.implementation",
      type: "tool_implementation",
      scope: { type: "platform", id: null },
      owner: "platform",
      mutability: "system_protected",
      riskLevel: "protected",
      sourceKind: "code_registry",
      sourceRef: "agent-tools:read",
      sourceVersion: "build-1",
      content: { name: "read" },
    },
  ];
}

function baselineSnapshot() {
  return assembleWorkHarnessSnapshot({
    workId: "work-1",
    workVersionId: "version-1",
    workVersion: "work-v1",
    platformVersion: "build-1",
    modelRuntime: { provider: "test", model: "fixed", reasoningLevel: null },
    policy: {
      allowedActions: ["memory_read"],
      approvalRequiredActions: [],
      deniedActions: ["external_send", "real_funds", "delete"],
    },
    components: components(),
    resolvedAt: "2026-08-12T00:00:00.000Z",
  });
}

describe("persisted Harness evaluation service", () => {
  it("closes Evidence -> Proposal -> Candidate -> Campaign -> Verdict with holdout", async () => {
    const { sqlite, database } = createDatabase();
    const repository = createHarnessEvolutionRepository({
      database,
      dialect: "sqlite",
      tables,
    });
    const baseline = await repository.persistSnapshot(baselineSnapshot());
    const memoryComponent = baseline.components.find(
      (component) => component.key === "work.memory-profile",
    )!;
    const suite = await repository.persistEvaluationSuite(
      CORE_HARNESS_EVALUATION_SUITES.find(
        (candidate) => candidate.workRole === "memory_recall_steward",
      )!,
    );
    const evidence = buildRunEvidenceBundle({
      id: "evidence-1",
      userId: "user-1",
      workId: "work-1",
      workRunId: "run-1",
      loopId: null,
      loopRunId: null,
      workVersionId: "version-1",
      harnessSnapshotId: baseline.id,
      componentSetHash: baseline.componentSetHash,
      runtime: {
        model: "fixed",
        startedAt: "2026-08-12T00:00:00.000Z",
        completedAt: "2026-08-12T00:00:01.000Z",
        durationMs: 1000,
        tokenUsage: {},
        attemptCount: 1,
      },
      observations: {
        sourceEventIds: [],
        freshness: "fresh",
        providerWarnings: [],
      },
      actions: {
        toolCallCount: 1,
        toolNames: ["memory_read"],
        deniedCount: 0,
        approvalCount: 0,
        externalActionCount: 0,
      },
      outcome: {
        status: "completed",
        verifierPassed: true,
        requiredFieldsMissing: [],
        artifacts: [],
        errorClass: null,
      },
      evidenceRefs: [
        {
          kind: "workshop_run",
          id: "run-1",
          claim: "Current-state recall replay source.",
          observedAt: "2026-08-12T00:00:01.000Z",
          freshness: "fresh",
          integrity: "verified",
        },
      ],
      captureStatus: "finalized",
      createdAt: "2026-08-12T00:00:01.000Z",
    });
    await repository.persistEvidence(evidence);
    const proposal = await repository.persistProposal(
      createHarnessChangeProposal({
        id: "proposal-1",
        workId: "work-1",
        scope: "work",
        affectedWorkIds: ["work-1"],
        baseWorkVersionId: "version-1",
        baseHarnessSnapshotId: baseline.id,
        baseComponentSetHash: baseline.componentSetHash,
        proposedBy: "owner",
        riskLevel: "low",
        failurePattern: "Old high-overlap state ranks above current evidence.",
        evidenceRefs: [
          {
            kind: "artifact",
            id: evidence.id,
            claim: "Captured replay evidence.",
            observedAt: evidence.createdAt,
            freshness: "fresh",
            integrity: "verified",
          },
        ],
        rootCauseHypothesis: "The Work profile underweights current facts.",
        changes: [
          {
            componentId: memoryComponent.componentId,
            componentType: "memory_profile",
            beforeRevisionId: memoryComponent.revisionId,
            componentMutability: "owner_editable",
            componentRiskLevel: "low",
            patch: {
              recallProfiles: [
                {
                  id: "current-state",
                  matchTerms: ["current", "latest", "当前", "最新"],
                  memoryTypeBoosts: { fact: 200 },
                },
              ],
            },
            rationale:
              "Raise fresh current-state facts above historical plans.",
          },
        ],
        predictedFixes: [
          {
            scenarioId: "memory.current_state_prefers_fresh",
            expectedDirection: "improve",
            metric: "freshTop3Rate",
            threshold: 1,
            rationale: "Fresh evidence should rank first.",
          },
        ],
        predictedRegressions: [
          {
            scenarioId: "memory.durable_boundary_preserved",
            expectedDirection: "unchanged",
            metric: "boundaryRecallRate",
            threshold: 0,
            rationale: "Durable boundaries must remain present.",
          },
        ],
        successMetrics: [
          {
            scenarioId: "memory.current_state_prefers_fresh",
            metric: "freshTop3Rate",
            operator: ">=",
            target: 1,
            severity: "objective",
          },
          {
            scenarioId: "memory.durable_boundary_preserved",
            metric: "boundaryRecallRate",
            operator: "no_regression",
            target: 0,
            severity: "guardrail",
          },
        ],
        evaluationSuiteId: suite.id,
        evaluationScenarioIds: [
          "memory.current_state_prefers_fresh",
          "memory.durable_boundary_preserved",
        ],
        evaluationWindow: { mode: "deterministic_replay" },
        rollbackPlan: {
          strategy: "restore_component_revision",
          targetRevisionIds: [memoryComponent.revisionId],
          triggerConditions: ["Any boundary regression"],
          verificationScenarioIds: ["memory.durable_boundary_preserved"],
          ownerApprovalRequired: true,
        },
        attributionLimited: false,
      }),
    );
    await repository.transitionProposal({
      workshopId: "work-1",
      proposalId: proposal.id,
      expectedStatus: "proposed",
      nextStatus: "approved",
      currentBase: {
        workVersionId: baseline.workVersionId,
        harnessSnapshotId: baseline.id,
        componentSetHash: baseline.componentSetHash,
      },
    });
    const candidate = await repository.materializeCandidate({
      workshopId: "work-1",
      proposalId: proposal.id,
      expectedStatus: "approved",
    });
    const campaign = await repository.createEvaluationCampaign({
      workshopId: "work-1",
      suiteId: suite.id,
      baselineWorkVersionId: baseline.workVersionId,
      candidateWorkVersionId: candidate.snapshot.workVersionId,
      baselineHarnessSnapshotId: baseline.id,
      candidateHarnessSnapshotId: candidate.snapshot.id,
      changeProposalId: proposal.id,
      runtimeContract: { shared: { engine: "builtin-deterministic-v1" } },
      budget: {
        maxRuns: 30,
        minimumSampleSize: 2,
        regressionBudget: {
          taskScore: 0,
          freshTop3Rate: 0,
          boundaryRecallRate: 0,
        },
      },
    });

    const result = await runPersistedHarnessEvaluationCampaign({
      workshopId: "work-1",
      campaignId: campaign.id,
      repository,
    });

    expect(result.evaluation.status).toBe("passed");
    expect(result.verdict?.status).toBe("confirmed");
    expect(result.proposalStatus).toBe("confirmed");
    expect(result.persistedRunCount).toBe(16);
    expect(
      result.evaluation.comparisons.some(
        (comparison) =>
          comparison.scenarioId === "memory.current_state_paraphrase_holdout",
      ),
    ).toBe(true);
    expect(
      sqlite
        .prepare(
          "select current_revision_id as revisionId from harness_components where id = ?",
        )
        .get(memoryComponent.componentId),
    ).toEqual({ revisionId: memoryComponent.revisionId });

    sqlite.close();
  });
});
