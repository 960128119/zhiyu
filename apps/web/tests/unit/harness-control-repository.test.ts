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
  diagnoseRunEvidence,
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
    create table loops (
      id text primary key not null,
      workshop_id text,
      user_id text not null
    );
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

function component(): HarnessComponentDefinition {
  return {
    key: "work.context-policy",
    type: "context_policy",
    scope: { type: "work", id: "work-1" },
    owner: "work",
    mutability: "owner_editable",
    riskLevel: "low",
    sourceKind: "database",
    sourceRef: "workshops:work-1:modelConfig.context",
    sourceVersion: "work-v1",
    content: { preferFresh: true },
  };
}

function snapshot() {
  return assembleWorkHarnessSnapshot({
    workId: "work-1",
    workVersionId: "version-1",
    workVersion: "work-v1",
    platformVersion: "build-1",
    modelRuntime: { provider: "test", model: "model-1", reasoningLevel: null },
    policy: {
      allowedActions: ["read"],
      approvalRequiredActions: [],
      deniedActions: ["external_send"],
    },
    components: [component()],
    resolvedAt: "2026-08-12T00:00:00.000Z",
  });
}

function createTestProposal(
  persistedSnapshot: Awaited<
    ReturnType<
      ReturnType<typeof createHarnessEvolutionRepository>["persistSnapshot"]
    >
  >,
  id: string,
) {
  const persistedComponent = persistedSnapshot.components[0];
  return createHarnessChangeProposal({
    id,
    workId: "work-1",
    scope: "work",
    affectedWorkIds: ["work-1"],
    baseWorkVersionId: "version-1",
    baseHarnessSnapshotId: persistedSnapshot.id,
    baseComponentSetHash: persistedSnapshot.componentSetHash,
    proposedBy: "owner",
    riskLevel: "low",
    failurePattern: "Fresh observations lose to old context.",
    evidenceRefs: [
      {
        kind: "workshop_run",
        id: "run-1",
        claim: "The current fact was missed.",
        observedAt: "2026-08-12T00:00:01.000Z",
        freshness: "fresh",
        integrity: "verified",
      },
    ],
    rootCauseHypothesis: "The context policy underweights freshness.",
    changes: [
      {
        componentId: persistedComponent.componentId,
        componentType: "context_policy",
        beforeRevisionId: persistedComponent.revisionId,
        componentMutability: "owner_editable",
        componentRiskLevel: "low",
        patch: { freshnessWeight: 2 },
        rationale: "Prefer current observations.",
      },
    ],
    predictedFixes: [
      {
        scenarioId: "scenario-1",
        expectedDirection: "improve",
        metric: "taskScore",
        threshold: 0.1,
        rationale: "Current-state answers improve.",
      },
    ],
    predictedRegressions: [
      {
        scenarioId: "scenario-2",
        expectedDirection: "unchanged",
        metric: "taskScore",
        threshold: 0.05,
        rationale: "Durable recall remains stable.",
      },
    ],
    successMetrics: [
      {
        scenarioId: "scenario-1",
        metric: "taskScore",
        operator: ">=",
        target: 0.8,
        severity: "objective",
      },
    ],
    evaluationSuiteId: "suite-1",
    evaluationScenarioIds: ["scenario-1", "scenario-2"],
    evaluationWindow: { days: 7 },
    rollbackPlan: {
      strategy: "restore_component_revision",
      targetRevisionIds: [persistedComponent.revisionId],
      triggerConditions: ["taskScore regresses"],
      verificationScenarioIds: ["scenario-2"],
      ownerApprovalRequired: true,
    },
    attributionLimited: false,
    createdAt: "2026-08-12T00:00:00.000Z",
  });
}

function seedEvaluationSuite(sqlite: Database.Database) {
  sqlite
    .prepare(
      `insert into work_evaluation_suites
        (id, user_id, owner_type, work_role, name, version, status)
       values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "suite-1",
      "user-1",
      "user",
      "general_workshop",
      "Core regression",
      1,
      "active",
    );
}

describe("harness control repository", () => {
  it("persists one evidence bundle and diagnosis per run snapshot", async () => {
    const { sqlite, database } = createDatabase();
    const repository = createHarnessEvolutionRepository({
      database,
      dialect: "sqlite",
      tables,
    });
    const persistedSnapshot = await repository.persistSnapshot(snapshot());
    const bundle = buildRunEvidenceBundle({
      id: "evidence-1",
      userId: "user-1",
      workId: "work-1",
      workRunId: "run-1",
      loopId: null,
      loopRunId: null,
      workVersionId: "version-1",
      harnessSnapshotId: persistedSnapshot.id,
      componentSetHash: persistedSnapshot.componentSetHash,
      runtime: {
        model: "model-1",
        startedAt: "2026-08-12T00:00:00.000Z",
        completedAt: "2026-08-12T00:00:01.000Z",
        durationMs: 1000,
        tokenUsage: {},
        attemptCount: 1,
      },
      observations: {
        sourceEventIds: ["event-1"],
        freshness: "fresh",
        providerWarnings: [],
      },
      actions: {
        toolCallCount: 1,
        toolNames: ["read"],
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
          claim: "Run completed.",
          observedAt: "2026-08-12T00:00:01.000Z",
          freshness: "fresh",
          integrity: "verified",
        },
      ],
      captureStatus: "finalized",
      createdAt: "2026-08-12T00:00:01.000Z",
    });
    const diagnosis = diagnoseRunEvidence({ bundle });

    const first = await repository.persistEvidence(bundle, diagnosis);
    const repeated = await repository.persistEvidence(
      { ...bundle, id: "evidence-retry" },
      { ...diagnosis, evidenceBundleId: "evidence-retry" },
    );
    const loaded = await repository.getEvidence("work-1", first.bundle.id);

    expect(repeated.bundle.id).toBe(first.bundle.id);
    expect(loaded?.bundle).toEqual(first.bundle);
    expect(loaded?.diagnosis?.failureClasses).toEqual(diagnosis.failureClasses);
    expect(
      sqlite
        .prepare("select count(*) as count from work_run_evidence_bundles")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare("select count(*) as count from work_run_diagnostics")
        .get(),
    ).toEqual({ count: 1 });

    sqlite.close();
  });

  it("persists Proposal v2 items and advances status optimistically", async () => {
    const { sqlite, database } = createDatabase();
    const repository = createHarnessEvolutionRepository({
      database,
      dialect: "sqlite",
      tables,
    });
    const persistedSnapshot = await repository.persistSnapshot(snapshot());
    const persistedComponent = persistedSnapshot.components[0];
    seedEvaluationSuite(sqlite);
    const proposal = createTestProposal(persistedSnapshot, "proposal-1");

    const stored = await repository.persistProposal(proposal);
    const approved = await repository.transitionProposal({
      workshopId: "work-1",
      proposalId: stored.id,
      expectedStatus: "proposed",
      nextStatus: "approved",
      currentBase: {
        workVersionId: "version-1",
        harnessSnapshotId: persistedSnapshot.id,
        componentSetHash: persistedSnapshot.componentSetHash,
      },
    });

    expect(stored.changes).toHaveLength(1);
    expect(approved.status).toBe("approved");
    await expect(
      repository.transitionProposal({
        workshopId: "work-1",
        proposalId: stored.id,
        expectedStatus: "proposed",
        nextStatus: "approved",
        currentBase: {
          workVersionId: "version-1",
          harnessSnapshotId: persistedSnapshot.id,
          componentSetHash: persistedSnapshot.componentSetHash,
        },
      }),
    ).rejects.toThrow(/changed concurrently/i);

    const candidate = await repository.materializeCandidate({
      workshopId: "work-1",
      proposalId: stored.id,
      expectedStatus: "approved",
    });
    const currentRevision = sqlite
      .prepare(
        "select current_revision_id as currentRevisionId from harness_components where id = ?",
      )
      .get(persistedComponent.componentId);

    expect(candidate.proposal.status).toBe("canary");
    expect(candidate.snapshot.status).toBe("candidate");
    expect(candidate.snapshot.componentSetHash).not.toBe(
      persistedSnapshot.componentSetHash,
    );
    expect(currentRevision).toEqual({
      currentRevisionId: persistedComponent.revisionId,
    });

    const discarded = await repository.discardCandidate({
      workshopId: "work-1",
      proposalId: stored.id,
      expectedStatus: "canary",
      reason: "Regression detected",
    });
    expect(discarded.status).toBe("reverted");
    expect(
      sqlite
        .prepare(
          "select count(*) as count from harness_component_revisions where change_proposal_id = ? and status = 'reverted'",
        )
        .get(stored.id),
    ).toEqual({ count: 1 });

    sqlite.close();
  });

  it("reverts partial candidate artifacts when materialization fails", async () => {
    const { sqlite, database } = createDatabase();
    const repository = createHarnessEvolutionRepository({
      database,
      dialect: "sqlite",
      tables,
    });
    const persistedSnapshot = await repository.persistSnapshot(snapshot());
    const persistedComponent = persistedSnapshot.components[0];
    seedEvaluationSuite(sqlite);
    const stored = await repository.persistProposal(
      createTestProposal(persistedSnapshot, "proposal-fault"),
    );
    await repository.transitionProposal({
      workshopId: "work-1",
      proposalId: stored.id,
      expectedStatus: "proposed",
      nextStatus: "approved",
      currentBase: {
        workVersionId: "version-1",
        harnessSnapshotId: persistedSnapshot.id,
        componentSetHash: persistedSnapshot.componentSetHash,
      },
    });
    sqlite.exec(`
      create trigger fail_candidate_link
      before update of after_revision_id on work_harness_change_items
      when new.after_revision_id is not null
      begin
        select raise(abort, 'fault_injected_candidate_link');
      end;
    `);

    await expect(
      repository.materializeCandidate({
        workshopId: "work-1",
        proposalId: stored.id,
        expectedStatus: "approved",
      }),
    ).rejects.toThrow(/fault_injected_candidate_link/i);

    expect(
      sqlite
        .prepare(
          "select current_revision_id as currentRevisionId from harness_components where id = ?",
        )
        .get(persistedComponent.componentId),
    ).toEqual({ currentRevisionId: persistedComponent.revisionId });
    expect(
      sqlite
        .prepare(
          "select status from work_harness_change_proposals where id = ?",
        )
        .get(stored.id),
    ).toEqual({ status: "approved" });
    expect(
      sqlite
        .prepare(
          "select after_revision_id as afterRevisionId from work_harness_change_items where proposal_id = ?",
        )
        .get(stored.id),
    ).toEqual({ afterRevisionId: null });
    expect(
      sqlite
        .prepare(
          "select count(*) as count from work_harness_snapshots where status = 'preparing'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite
        .prepare(
          "select count(*) as count from harness_component_revisions where change_proposal_id = ? and status = 'reverted'",
        )
        .get(stored.id),
    ).toEqual({ count: 1 });

    sqlite.close();
  });

  it("versions evaluation suites and records a campaign without real actions", async () => {
    const { sqlite, database } = createDatabase();
    const repository = createHarnessEvolutionRepository({
      database,
      dialect: "sqlite",
      tables,
    });
    const persistedSnapshot = await repository.persistSnapshot(snapshot());
    const definition = CORE_HARNESS_EVALUATION_SUITES.find(
      (suite) => suite.workRole === "memory_recall_steward",
    )!;

    const firstSuite = await repository.persistEvaluationSuite(definition);
    const repeatedSuite = await repository.persistEvaluationSuite(definition);
    const campaign = await repository.createEvaluationCampaign({
      workshopId: "work-1",
      suiteId: firstSuite.id,
      baselineWorkVersionId: "version-1",
      candidateWorkVersionId: null,
      baselineHarnessSnapshotId: persistedSnapshot.id,
      candidateHarnessSnapshotId: persistedSnapshot.id,
      changeProposalId: null,
      runtimeContract: {
        baseline: { model: "model-1" },
        candidate: { model: "model-1" },
      },
      budget: { maxRuns: 10 },
    });
    await repository.persistEvaluationRun({
      campaignId: campaign.id,
      scenarioId: firstSuite.scenarios[0].id,
      cohort: "baseline",
      repetition: 1,
      status: "success",
      score: 0.5,
      metrics: { taskScore: 0.5 },
      evidenceBundleId: null,
      error: null,
      startedAt: "2026-08-12T00:00:00.000Z",
      completedAt: "2026-08-12T00:00:01.000Z",
    });
    const completed = await repository.completeEvaluationCampaign({
      campaignId: campaign.id,
      status: "passed",
      summary: { recommendedAction: "keep" },
    });

    expect(repeatedSuite.id).toBe(firstSuite.id);
    expect(firstSuite.scenarios).toHaveLength(definition.scenarios.length);
    expect(completed.status).toBe("passed");
    expect(
      sqlite
        .prepare("select count(*) as count from work_evaluation_suites")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare("select count(*) as count from work_evaluation_runs")
        .get(),
    ).toEqual({ count: 1 });

    sqlite.close();
  });
});
