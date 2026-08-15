import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as defaultTables from "@/lib/db/schema";
import { applyHarnessJsonMergePatch } from "./candidate";
import {
  assertHarnessProposalBase,
  assertHarnessProposalTransition,
} from "./proposals";
import { assembleWorkHarnessSnapshot } from "./snapshot";
import type {
  HarnessChangeProposalV2,
  HarnessEvaluationCampaign,
  HarnessEvaluationSuiteDefinition,
  HarnessEvolutionVerdict,
  HarnessProposalStatus,
  CreateHarnessEvaluationCampaignInput,
  PersistedHarnessEvaluationSuite,
  PersistHarnessEvaluationRunInput,
  RunEvidenceBundle,
  RunEvidenceDiagnosis,
  WorkHarnessSnapshot,
} from "./types";

type HarnessEvolutionTables = {
  harnessComponents: any;
  harnessComponentRevisions: any;
  workHarnessSnapshots: any;
  workHarnessSnapshotItems: any;
  workRunEvidenceBundles: any;
  workRunDiagnostics: any;
  workEvaluationSuites: any;
  workEvaluationScenarios: any;
  workEvaluationCampaigns: any;
  workEvaluationRuns: any;
  workHarnessChangeProposals: any;
  workHarnessChangeItems: any;
  workEvolutionVerdicts: any;
  workshopWorkVersions: any;
};

export interface PersistedHarnessSnapshot {
  id: string;
  workshopId: string;
  workVersionId: string;
  platformVersion: string;
  componentSetHash: string;
  status: string;
  resolvedAt: Date;
  components: Array<{
    key: string;
    componentId: string;
    revisionId: string;
    revision: number;
    checksum: string;
  }>;
}

export interface ResolvedPersistedHarnessSnapshot extends PersistedHarnessSnapshot {
  modelRuntime: WorkHarnessSnapshot["modelRuntime"];
  policySummary: WorkHarnessSnapshot["policySummary"];
  components: Array<
    PersistedHarnessSnapshot["components"][number] & {
      type: WorkHarnessSnapshot["components"][number]["type"];
      scope: WorkHarnessSnapshot["components"][number]["scope"];
      owner: WorkHarnessSnapshot["components"][number]["owner"];
      mutability: WorkHarnessSnapshot["components"][number]["mutability"];
      riskLevel: WorkHarnessSnapshot["components"][number]["riskLevel"];
      sourceKind: WorkHarnessSnapshot["components"][number]["sourceKind"];
      sourceRef: string;
      sourceVersion: string;
      content: Record<string, unknown>;
    }
  >;
}

export interface PersistedHarnessEvaluationRun {
  id: string;
  campaignId: string;
  scenarioId: string;
  cohort: "baseline" | "candidate";
  repetition: number;
  status: PersistHarnessEvaluationRunInput["status"];
  score: number | null;
  metrics: Record<string, number>;
  evidenceBundleId: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface HarnessEvolutionRepository {
  persistSnapshot(
    snapshot: WorkHarnessSnapshot,
    options?: {
      status?: "active" | "candidate" | "preparing";
      activate?: boolean;
    },
  ): Promise<PersistedHarnessSnapshot>;
  getSnapshot(
    workshopId: string,
    snapshotId: string,
  ): Promise<PersistedHarnessSnapshot | null>;
  getResolvedSnapshot(
    workshopId: string,
    snapshotId: string,
  ): Promise<ResolvedPersistedHarnessSnapshot | null>;
  getLatestSnapshot(
    workshopId: string,
    status?: "active" | "candidate",
  ): Promise<PersistedHarnessSnapshot | null>;
  getSummary(workshopId: string): Promise<{
    activeSnapshot: PersistedHarnessSnapshot | null;
    evidenceCount: number;
    openProposalCount: number;
    activeCampaignCount: number;
  }>;
  persistEvidence(
    bundle: RunEvidenceBundle,
    diagnosis?: RunEvidenceDiagnosis | null,
  ): Promise<PersistedRunEvidence>;
  getEvidence(
    workshopId: string,
    evidenceBundleId: string,
  ): Promise<PersistedRunEvidence | null>;
  listEvidence(
    workshopId: string,
    limit?: number,
  ): Promise<PersistedRunEvidence[]>;
  persistProposal(
    proposal: HarnessChangeProposalV2,
  ): Promise<HarnessChangeProposalV2>;
  getProposal(
    workshopId: string,
    proposalId: string,
  ): Promise<HarnessChangeProposalV2 | null>;
  listProposals(
    workshopId: string,
    limit?: number,
  ): Promise<HarnessChangeProposalV2[]>;
  transitionProposal(input: {
    workshopId: string;
    proposalId: string;
    expectedStatus: HarnessProposalStatus;
    nextStatus: HarnessProposalStatus;
    currentBase?: {
      workVersionId: string;
      harnessSnapshotId: string;
      componentSetHash: string;
    };
  }): Promise<HarnessChangeProposalV2>;
  persistEvaluationSuite(
    definition: HarnessEvaluationSuiteDefinition,
    userId?: string | null,
  ): Promise<PersistedHarnessEvaluationSuite>;
  listEvaluationSuites(input: {
    userId?: string | null;
    workRole?: string;
  }): Promise<PersistedHarnessEvaluationSuite[]>;
  getEvaluationSuite(
    suiteId: string,
  ): Promise<PersistedHarnessEvaluationSuite | null>;
  createEvaluationCampaign(
    input: CreateHarnessEvaluationCampaignInput,
  ): Promise<HarnessEvaluationCampaign>;
  getEvaluationCampaign(
    workshopId: string,
    campaignId: string,
  ): Promise<HarnessEvaluationCampaign | null>;
  listEvaluationCampaigns(
    workshopId: string,
    limit?: number,
  ): Promise<HarnessEvaluationCampaign[]>;
  persistEvaluationRun(input: PersistHarnessEvaluationRunInput): Promise<{
    id: string;
  }>;
  listEvaluationRuns(
    campaignId: string,
  ): Promise<PersistedHarnessEvaluationRun[]>;
  startEvaluationCampaign(input: {
    workshopId: string;
    campaignId: string;
  }): Promise<HarnessEvaluationCampaign>;
  completeEvaluationCampaign(input: {
    campaignId: string;
    status: string;
    summary: Record<string, unknown>;
  }): Promise<HarnessEvaluationCampaign>;
  materializeCandidate(input: {
    workshopId: string;
    proposalId: string;
    expectedStatus: "approved";
  }): Promise<{
    proposal: HarnessChangeProposalV2;
    snapshot: PersistedHarnessSnapshot;
  }>;
  discardCandidate(input: {
    workshopId: string;
    proposalId: string;
    expectedStatus: "canary" | "evaluating" | "confirmed" | "partial";
    reason: string;
  }): Promise<HarnessChangeProposalV2>;
  settleCandidateEvaluation(input: {
    workshopId: string;
    proposalId: string;
    expectedStatus: "evaluating";
    nextStatus: "confirmed" | "partial" | "rejected";
  }): Promise<HarnessChangeProposalV2>;
  persistVerdict(
    verdict: HarnessEvolutionVerdict,
  ): Promise<HarnessEvolutionVerdict>;
}

export interface PersistedRunEvidence {
  bundle: RunEvidenceBundle;
  diagnosis: RunEvidenceDiagnosis | null;
}

export interface CreateHarnessEvolutionRepositoryInput {
  database?: any;
  dialect?: "postgres" | "sqlite";
  tables?: HarnessEvolutionTables;
  disableTransactions?: boolean;
}

function decodeJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function iso(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function createHarnessEvolutionRepository(
  input: CreateHarnessEvolutionRepositoryInput = {},
): HarnessEvolutionRepository {
  const database = input.database ?? db;
  const tables = input.tables ?? (defaultTables as HarnessEvolutionTables);
  const disableTransactions = input.disableTransactions ?? false;
  const dialect =
    input.dialect ??
    (process.env.TAURI_MODE === "true" || process.env.IS_TAURI === "true"
      ? "sqlite"
      : "postgres");
  const encodeJson = (value: unknown) =>
    dialect === "sqlite" ? JSON.stringify(value) : value;

  async function findComponent(
    scopeType: string,
    scopeId: string,
    key: string,
  ) {
    const [component] = await database
      .select()
      .from(tables.harnessComponents)
      .where(
        and(
          eq(tables.harnessComponents.scopeType, scopeType),
          eq(tables.harnessComponents.scopeId, scopeId),
          eq(tables.harnessComponents.componentKey, key),
        ),
      )
      .limit(1);
    return component ?? null;
  }

  async function ensureComponent(
    component: WorkHarnessSnapshot["components"][number],
  ) {
    const scopeId = component.scope.id ?? "platform";
    let row = await findComponent(component.scope.type, scopeId, component.key);
    if (!row) {
      await database
        .insert(tables.harnessComponents)
        .values({
          id: crypto.randomUUID(),
          scopeType: component.scope.type,
          scopeId,
          componentKey: component.key,
          componentType: component.type,
          sourceKind: component.sourceKind,
          sourceRef: component.sourceRef,
          owner: component.owner,
          mutability: component.mutability,
          riskLevel: component.riskLevel,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      row = await findComponent(component.scope.type, scopeId, component.key);
    }
    if (!row) {
      throw new Error(`Failed to persist Harness component ${component.key}`);
    }
    await database
      .update(tables.harnessComponents)
      .set({
        componentType: component.type,
        sourceKind: component.sourceKind,
        sourceRef: component.sourceRef,
        owner: component.owner,
        mutability: component.mutability,
        riskLevel: component.riskLevel,
        updatedAt: new Date(),
      })
      .where(eq(tables.harnessComponents.id, row.id));
    return row;
  }

  async function findRevisionByChecksum(componentId: string, checksum: string) {
    const [revision] = await database
      .select()
      .from(tables.harnessComponentRevisions)
      .where(
        and(
          eq(tables.harnessComponentRevisions.componentId, componentId),
          eq(tables.harnessComponentRevisions.checksum, checksum),
        ),
      )
      .limit(1);
    return revision ?? null;
  }

  async function ensureRevision(
    componentRow: any,
    component: WorkHarnessSnapshot["components"][number],
    snapshot: WorkHarnessSnapshot,
    status: "active" | "candidate" | "preparing",
  ) {
    let existing = await findRevisionByChecksum(
      componentRow.id,
      component.checksum,
    );
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [latest] = await database
        .select()
        .from(tables.harnessComponentRevisions)
        .where(
          eq(tables.harnessComponentRevisions.componentId, componentRow.id),
        )
        .orderBy(desc(tables.harnessComponentRevisions.revision))
        .limit(1);
      await database
        .insert(tables.harnessComponentRevisions)
        .values({
          id: crypto.randomUUID(),
          componentId: componentRow.id,
          revision: (latest?.revision ?? 0) + 1,
          schemaVersion: "harness-component.v1",
          parentRevisionId: latest?.id ?? null,
          content: encodeJson(component.content),
          checksum: component.checksum,
          sourceVersion: component.sourceVersion,
          sourceWorkVersionId:
            component.scope.type === "work" ? snapshot.workVersionId : null,
          platformVersion:
            component.scope.type === "platform"
              ? snapshot.platformVersion
              : null,
          createdBy: "snapshot_resolver",
          status,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
      existing = await findRevisionByChecksum(
        componentRow.id,
        component.checksum,
      );
      if (existing) return existing;
    }

    throw new Error(`Failed to persist Harness revision ${component.key}`);
  }

  async function findSnapshot(snapshot: WorkHarnessSnapshot) {
    const [row] = await database
      .select()
      .from(tables.workHarnessSnapshots)
      .where(
        and(
          eq(tables.workHarnessSnapshots.workshopId, snapshot.workId),
          eq(tables.workHarnessSnapshots.workVersionId, snapshot.workVersionId),
          eq(
            tables.workHarnessSnapshots.platformVersion,
            snapshot.platformVersion,
          ),
          eq(
            tables.workHarnessSnapshots.componentSetHash,
            snapshot.componentSetHash,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function readPersistedSnapshot(
    row: any,
  ): Promise<PersistedHarnessSnapshot> {
    const items = await database
      .select({
        componentId: tables.workHarnessSnapshotItems.componentId,
        revisionId: tables.workHarnessSnapshotItems.revisionId,
        componentOrder: tables.workHarnessSnapshotItems.componentOrder,
        key: tables.harnessComponents.componentKey,
        checksum: tables.harnessComponentRevisions.checksum,
        revision: tables.harnessComponentRevisions.revision,
      })
      .from(tables.workHarnessSnapshotItems)
      .innerJoin(
        tables.harnessComponents,
        eq(
          tables.harnessComponents.id,
          tables.workHarnessSnapshotItems.componentId,
        ),
      )
      .innerJoin(
        tables.harnessComponentRevisions,
        eq(
          tables.harnessComponentRevisions.id,
          tables.workHarnessSnapshotItems.revisionId,
        ),
      )
      .where(eq(tables.workHarnessSnapshotItems.snapshotId, row.id))
      .orderBy(tables.workHarnessSnapshotItems.componentOrder);
    return {
      id: row.id,
      workshopId: row.workshopId,
      workVersionId: row.workVersionId,
      platformVersion: row.platformVersion,
      componentSetHash: row.componentSetHash,
      status: row.status,
      resolvedAt:
        row.resolvedAt instanceof Date
          ? row.resolvedAt
          : new Date(row.resolvedAt),
      components: items.map((item: any) => ({
        key: item.key,
        componentId: item.componentId,
        revisionId: item.revisionId,
        revision: item.revision,
        checksum: item.checksum,
      })),
    };
  }

  async function readResolvedPersistedSnapshot(
    row: any,
  ): Promise<ResolvedPersistedHarnessSnapshot> {
    const items = await database
      .select({
        componentId: tables.workHarnessSnapshotItems.componentId,
        revisionId: tables.workHarnessSnapshotItems.revisionId,
        componentOrder: tables.workHarnessSnapshotItems.componentOrder,
        key: tables.harnessComponents.componentKey,
        type: tables.harnessComponents.componentType,
        scopeType: tables.harnessComponents.scopeType,
        scopeId: tables.harnessComponents.scopeId,
        owner: tables.harnessComponents.owner,
        mutability: tables.harnessComponents.mutability,
        riskLevel: tables.harnessComponents.riskLevel,
        sourceKind: tables.harnessComponents.sourceKind,
        sourceRef: tables.harnessComponents.sourceRef,
        checksum: tables.harnessComponentRevisions.checksum,
        revision: tables.harnessComponentRevisions.revision,
        sourceVersion: tables.harnessComponentRevisions.sourceVersion,
        content: tables.harnessComponentRevisions.content,
      })
      .from(tables.workHarnessSnapshotItems)
      .innerJoin(
        tables.harnessComponents,
        eq(
          tables.harnessComponents.id,
          tables.workHarnessSnapshotItems.componentId,
        ),
      )
      .innerJoin(
        tables.harnessComponentRevisions,
        eq(
          tables.harnessComponentRevisions.id,
          tables.workHarnessSnapshotItems.revisionId,
        ),
      )
      .where(eq(tables.workHarnessSnapshotItems.snapshotId, row.id))
      .orderBy(tables.workHarnessSnapshotItems.componentOrder);
    return {
      id: row.id,
      workshopId: row.workshopId,
      workVersionId: row.workVersionId,
      platformVersion: row.platformVersion,
      componentSetHash: row.componentSetHash,
      status: row.status,
      resolvedAt:
        row.resolvedAt instanceof Date
          ? row.resolvedAt
          : new Date(row.resolvedAt),
      modelRuntime: decodeJson(
        row.modelRuntime,
      ) as WorkHarnessSnapshot["modelRuntime"],
      policySummary: decodeJson(
        row.policySummary,
      ) as WorkHarnessSnapshot["policySummary"],
      components: items.map((item: any) => ({
        key: item.key,
        componentId: item.componentId,
        revisionId: item.revisionId,
        revision: item.revision,
        checksum: item.checksum,
        type: item.type,
        scope: {
          type: item.scopeType,
          id:
            item.scopeType === "platform" && item.scopeId === "platform"
              ? null
              : item.scopeId,
        },
        owner: item.owner,
        mutability: item.mutability,
        riskLevel: item.riskLevel,
        sourceKind: item.sourceKind,
        sourceRef: item.sourceRef,
        sourceVersion: item.sourceVersion,
        content: decodeJson(item.content) as Record<string, unknown>,
      })),
    };
  }

  async function markCandidateArtifactsReverted(proposalId: string) {
    const candidateRevisions = await database
      .select()
      .from(tables.harnessComponentRevisions)
      .where(eq(tables.harnessComponentRevisions.changeProposalId, proposalId));
    for (const revision of candidateRevisions) {
      const [activeComponent] = await database
        .select({ id: tables.harnessComponents.id })
        .from(tables.harnessComponents)
        .where(eq(tables.harnessComponents.currentRevisionId, revision.id))
        .limit(1);
      if (activeComponent) {
        throw new Error(
          "Candidate is active in production and requires an owner-controlled restore.",
        );
      }
      const snapshotItems = await database
        .select({ snapshotId: tables.workHarnessSnapshotItems.snapshotId })
        .from(tables.workHarnessSnapshotItems)
        .where(eq(tables.workHarnessSnapshotItems.revisionId, revision.id));
      for (const item of snapshotItems) {
        await database
          .update(tables.workHarnessSnapshots)
          .set({ status: "reverted" })
          .where(eq(tables.workHarnessSnapshots.id, item.snapshotId));
      }
    }
    await database
      .update(tables.harnessComponentRevisions)
      .set({ status: "reverted" })
      .where(eq(tables.harnessComponentRevisions.changeProposalId, proposalId));
  }

  async function findEvidenceRow(bundle: RunEvidenceBundle) {
    if (bundle.loopRunId) {
      const [row] = await database
        .select()
        .from(tables.workRunEvidenceBundles)
        .where(
          and(
            eq(tables.workRunEvidenceBundles.loopRunId, bundle.loopRunId),
            eq(
              tables.workRunEvidenceBundles.harnessSnapshotId,
              bundle.harnessSnapshotId,
            ),
          ),
        )
        .limit(1);
      return row ?? null;
    }
    if (bundle.workRunId) {
      const [row] = await database
        .select()
        .from(tables.workRunEvidenceBundles)
        .where(
          and(
            eq(tables.workRunEvidenceBundles.workshopRunId, bundle.workRunId),
            eq(
              tables.workRunEvidenceBundles.harnessSnapshotId,
              bundle.harnessSnapshotId,
            ),
          ),
        )
        .limit(1);
      return row ?? null;
    }
    const [row] = await database
      .select()
      .from(tables.workRunEvidenceBundles)
      .where(eq(tables.workRunEvidenceBundles.id, bundle.id))
      .limit(1);
    return row ?? null;
  }

  function evidenceFromRow(row: any): RunEvidenceBundle {
    return {
      interfaceVersion: "run-evidence.v1",
      id: row.id,
      userId: row.userId,
      workId: row.workshopId,
      workRunId: row.workshopRunId ?? null,
      loopId: row.loopId ?? null,
      loopRunId: row.loopRunId ?? null,
      workVersionId: row.workVersionId,
      harnessSnapshotId: row.harnessSnapshotId,
      componentSetHash: row.componentSetHash,
      runtime: decodeJson(row.runtimeSummary) as RunEvidenceBundle["runtime"],
      observations: decodeJson(
        row.observationSummary,
      ) as RunEvidenceBundle["observations"],
      actions: decodeJson(row.actionSummary) as RunEvidenceBundle["actions"],
      outcome: decodeJson(row.outcomeSummary) as RunEvidenceBundle["outcome"],
      evidenceRefs: decodeJson(
        row.evidenceRefs,
      ) as RunEvidenceBundle["evidenceRefs"],
      captureStatus: row.captureStatus,
      completeness: row.completeness,
      warnings: decodeJson(row.warnings) as string[],
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    };
  }

  function diagnosisFromRow(row: any): RunEvidenceDiagnosis {
    return {
      interfaceVersion: "run-diagnosis.v1",
      evidenceBundleId: row.evidenceBundleId,
      status: row.status,
      failureClasses: decodeJson(
        row.failureClasses,
      ) as RunEvidenceDiagnosis["failureClasses"],
      symptoms: decodeJson(row.symptoms) as string[],
      rootCauseCandidates: decodeJson(row.rootCauseCandidates) as string[],
      targetComponentTypes: decodeJson(
        row.targetComponentTypes,
      ) as RunEvidenceDiagnosis["targetComponentTypes"],
      confidence: row.confidence,
      evidenceRefs: decodeJson(
        row.evidenceRefs,
      ) as RunEvidenceDiagnosis["evidenceRefs"],
    };
  }

  async function readEvidence(row: any): Promise<PersistedRunEvidence> {
    const [diagnostic] = await database
      .select()
      .from(tables.workRunDiagnostics)
      .where(eq(tables.workRunDiagnostics.evidenceBundleId, row.id))
      .orderBy(desc(tables.workRunDiagnostics.createdAt))
      .limit(1);
    return {
      bundle: evidenceFromRow(row),
      diagnosis: diagnostic ? diagnosisFromRow(diagnostic) : null,
    };
  }

  async function findProposalRow(workshopId: string, proposalId: string) {
    const [row] = await database
      .select()
      .from(tables.workHarnessChangeProposals)
      .where(
        and(
          eq(tables.workHarnessChangeProposals.workshopId, workshopId),
          eq(tables.workHarnessChangeProposals.id, proposalId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function readProposal(row: any): Promise<HarnessChangeProposalV2> {
    const items = await database
      .select({
        componentId: tables.workHarnessChangeItems.componentId,
        componentType: tables.workHarnessChangeItems.componentType,
        beforeRevisionId: tables.workHarnessChangeItems.beforeRevisionId,
        afterRevisionId: tables.workHarnessChangeItems.afterRevisionId,
        patch: tables.workHarnessChangeItems.patch,
        rationale: tables.workHarnessChangeItems.rationale,
        groupKey: tables.workHarnessChangeItems.groupKey,
        componentMutability: tables.harnessComponents.mutability,
        componentRiskLevel: tables.harnessComponents.riskLevel,
      })
      .from(tables.workHarnessChangeItems)
      .innerJoin(
        tables.harnessComponents,
        eq(
          tables.harnessComponents.id,
          tables.workHarnessChangeItems.componentId,
        ),
      )
      .where(eq(tables.workHarnessChangeItems.proposalId, row.id))
      .orderBy(tables.workHarnessChangeItems.createdAt);
    return {
      interfaceVersion: "harness-change-proposal.v2",
      id: row.id,
      workId: row.workshopId,
      scope: row.scope,
      affectedWorkIds: decodeJson(row.affectedWorkIds) as string[],
      baseWorkVersionId: row.baseWorkVersionId,
      baseHarnessSnapshotId: row.baseHarnessSnapshotId,
      baseComponentSetHash: row.baseComponentSetHash,
      proposedBy: row.proposedBy,
      status: row.status,
      riskLevel: row.riskLevel,
      failurePattern: row.failurePattern,
      evidenceRefs: decodeJson(
        row.evidenceRefs,
      ) as HarnessChangeProposalV2["evidenceRefs"],
      rootCauseHypothesis: row.rootCauseHypothesis,
      changes: items.map((item: any) => ({
        componentId: item.componentId,
        componentType: item.componentType,
        beforeRevisionId: item.beforeRevisionId,
        afterRevisionId: item.afterRevisionId ?? null,
        componentMutability: item.componentMutability,
        componentRiskLevel: item.componentRiskLevel,
        patch: decodeJson(item.patch) as Record<string, unknown>,
        rationale: item.rationale,
        groupKey: item.groupKey ?? null,
      })),
      predictedFixes: decodeJson(
        row.predictedFixes,
      ) as HarnessChangeProposalV2["predictedFixes"],
      predictedRegressions: decodeJson(
        row.predictedRegressions,
      ) as HarnessChangeProposalV2["predictedRegressions"],
      successMetrics: decodeJson(
        row.successMetrics,
      ) as HarnessChangeProposalV2["successMetrics"],
      evaluationSuiteId: row.evaluationSuiteId,
      evaluationScenarioIds: decodeJson(row.evaluationScenarioIds) as string[],
      evaluationWindow: decodeJson(row.evaluationWindow) as Record<
        string,
        unknown
      >,
      rollbackPlan: decodeJson(
        row.rollbackPlan,
      ) as HarnessChangeProposalV2["rollbackPlan"],
      attributionLimited: Boolean(row.attributionLimited),
      expiresAt: iso(row.expiresAt),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
      updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    };
  }

  async function assertChangeItemReferences(
    change: HarnessChangeProposalV2["changes"][number],
  ) {
    const [reference] = await database
      .select({
        componentId: tables.harnessComponents.id,
        revisionId: tables.harnessComponentRevisions.id,
        revisionComponentId: tables.harnessComponentRevisions.componentId,
        mutability: tables.harnessComponents.mutability,
        riskLevel: tables.harnessComponents.riskLevel,
      })
      .from(tables.harnessComponents)
      .innerJoin(
        tables.harnessComponentRevisions,
        eq(tables.harnessComponentRevisions.id, change.beforeRevisionId),
      )
      .where(eq(tables.harnessComponents.id, change.componentId))
      .limit(1);
    if (
      !reference ||
      reference.revisionComponentId !== change.componentId ||
      reference.mutability !== change.componentMutability ||
      reference.riskLevel !== change.componentRiskLevel
    ) {
      throw new Error(
        `Harness proposal change ${change.componentId} has stale or invalid component metadata.`,
      );
    }
  }

  async function findEvaluationSuite(
    definition: HarnessEvaluationSuiteDefinition,
    userId: string | null,
  ) {
    const ownershipCondition = userId
      ? eq(tables.workEvaluationSuites.userId, userId)
      : isNull(tables.workEvaluationSuites.userId);
    const [row] = await database
      .select()
      .from(tables.workEvaluationSuites)
      .where(
        and(
          ownershipCondition,
          eq(tables.workEvaluationSuites.ownerType, definition.ownerType),
          eq(tables.workEvaluationSuites.workRole, definition.workRole),
          eq(tables.workEvaluationSuites.version, definition.version),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function readEvaluationSuite(
    row: any,
  ): Promise<PersistedHarnessEvaluationSuite> {
    const scenarios = await database
      .select()
      .from(tables.workEvaluationScenarios)
      .where(eq(tables.workEvaluationScenarios.suiteId, row.id))
      .orderBy(tables.workEvaluationScenarios.scenarioKey);
    return {
      id: row.id,
      userId: row.userId ?? null,
      ownerType: row.ownerType,
      workRole: row.workRole,
      name: row.name,
      version: row.version,
      status: row.status,
      metricPolicy: decodeJson(row.metricPolicy) as Record<string, unknown>,
      holdoutPolicy: decodeJson(row.holdoutPolicy) as Record<string, unknown>,
      scenarios: scenarios.map((scenario: any) => ({
        id: scenario.id,
        suiteId: scenario.suiteId,
        scenarioKey: scenario.scenarioKey,
        name: scenario.name,
        mode: scenario.mode,
        tags: decodeJson(scenario.tags) as string[],
        riskTier: scenario.riskTier,
        fixtureRef: scenario.fixtureRef,
        preconditions: decodeJson(scenario.preconditions) as Record<
          string,
          unknown
        >,
        taskIntent: scenario.taskIntent,
        expectedArtifacts: decodeJson(scenario.expectedArtifacts) as string[],
        hardInvariants: decodeJson(scenario.hardInvariants) as string[],
        forbiddenActions: decodeJson(scenario.forbiddenActions) as string[],
        metrics: decodeJson(scenario.metrics) as string[],
        repetitions: scenario.repetitions,
        timeoutMs: scenario.timeoutMs,
        status: scenario.status,
      })),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
      updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    };
  }

  function evaluationCampaignFromRow(row: any): HarnessEvaluationCampaign {
    return {
      id: row.id,
      workshopId: row.workshopId,
      suiteId: row.suiteId,
      baselineWorkVersionId: row.baselineWorkVersionId,
      candidateWorkVersionId: row.candidateWorkVersionId ?? null,
      baselineHarnessSnapshotId: row.baselineHarnessSnapshotId,
      candidateHarnessSnapshotId: row.candidateHarnessSnapshotId,
      changeProposalId: row.changeProposalId ?? null,
      status: row.status,
      runtimeContract: decodeJson(row.runtimeContract) as Record<
        string,
        unknown
      >,
      budget: decodeJson(row.budget) as Record<string, unknown>,
      summary: decodeJson(row.summary) as Record<string, unknown>,
      startedAt: iso(row.startedAt),
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    };
  }

  return {
    async persistSnapshot(snapshot, options = {}) {
      const status = options.status ?? "active";
      const activate = options.activate ?? status === "active";
      const persistedComponents = [];

      for (const component of snapshot.components) {
        const componentRow = await ensureComponent(component);
        const revisionRow = await ensureRevision(
          componentRow,
          component,
          snapshot,
          status,
        );
        if (activate) {
          await database
            .update(tables.harnessComponents)
            .set({ currentRevisionId: revisionRow.id, updatedAt: new Date() })
            .where(eq(tables.harnessComponents.id, componentRow.id));
        }
        persistedComponents.push({ componentRow, revisionRow });
      }

      let snapshotRow = await findSnapshot(snapshot);
      if (!snapshotRow) {
        await database
          .insert(tables.workHarnessSnapshots)
          .values({
            id: crypto.randomUUID(),
            workshopId: snapshot.workId,
            workVersionId: snapshot.workVersionId,
            platformVersion: snapshot.platformVersion,
            componentSetHash: snapshot.componentSetHash,
            modelRuntime: encodeJson(snapshot.modelRuntime),
            policySummary: encodeJson(snapshot.policySummary),
            status,
            resolvedAt: new Date(snapshot.resolvedAt),
          })
          .onConflictDoNothing();
        snapshotRow = await findSnapshot(snapshot);
      }
      if (!snapshotRow) {
        throw new Error("Failed to persist Work Harness Snapshot");
      }

      for (let index = 0; index < persistedComponents.length; index += 1) {
        const item = persistedComponents[index];
        await database
          .insert(tables.workHarnessSnapshotItems)
          .values({
            id: crypto.randomUUID(),
            snapshotId: snapshotRow.id,
            componentId: item.componentRow.id,
            revisionId: item.revisionRow.id,
            componentOrder: index,
            createdAt: new Date(),
          })
          .onConflictDoNothing();
      }

      return readPersistedSnapshot(snapshotRow);
    },

    async getSnapshot(workshopId, snapshotId) {
      const [row] = await database
        .select()
        .from(tables.workHarnessSnapshots)
        .where(
          and(
            eq(tables.workHarnessSnapshots.id, snapshotId),
            eq(tables.workHarnessSnapshots.workshopId, workshopId),
          ),
        )
        .limit(1);
      return row ? readPersistedSnapshot(row) : null;
    },

    async getResolvedSnapshot(workshopId, snapshotId) {
      const [row] = await database
        .select()
        .from(tables.workHarnessSnapshots)
        .where(
          and(
            eq(tables.workHarnessSnapshots.workshopId, workshopId),
            eq(tables.workHarnessSnapshots.id, snapshotId),
          ),
        )
        .limit(1);
      return row ? readResolvedPersistedSnapshot(row) : null;
    },

    async getLatestSnapshot(workshopId, status = "active") {
      const [row] = await database
        .select()
        .from(tables.workHarnessSnapshots)
        .where(
          and(
            eq(tables.workHarnessSnapshots.workshopId, workshopId),
            eq(tables.workHarnessSnapshots.status, status),
          ),
        )
        .orderBy(desc(tables.workHarnessSnapshots.resolvedAt))
        .limit(1);
      return row ? readPersistedSnapshot(row) : null;
    },

    async getSummary(workshopId) {
      const openStatuses = [
        "draft",
        "proposed",
        "approved",
        "canary",
        "evaluating",
        "partial",
      ];
      const activeCampaignStatuses = ["pending", "running", "paused"];
      const [activeSnapshot, evidenceRows, proposalRows, campaignRows] =
        await Promise.all([
          this.getLatestSnapshot(workshopId, "active"),
          database
            .select({ value: count() })
            .from(tables.workRunEvidenceBundles)
            .where(eq(tables.workRunEvidenceBundles.workshopId, workshopId)),
          database
            .select({ value: count() })
            .from(tables.workHarnessChangeProposals)
            .where(
              and(
                eq(tables.workHarnessChangeProposals.workshopId, workshopId),
                inArray(tables.workHarnessChangeProposals.status, openStatuses),
              ),
            ),
          database
            .select({ value: count() })
            .from(tables.workEvaluationCampaigns)
            .where(
              and(
                eq(tables.workEvaluationCampaigns.workshopId, workshopId),
                inArray(
                  tables.workEvaluationCampaigns.status,
                  activeCampaignStatuses,
                ),
              ),
            ),
        ]);
      return {
        activeSnapshot,
        evidenceCount: Number(evidenceRows[0]?.value ?? 0),
        openProposalCount: Number(proposalRows[0]?.value ?? 0),
        activeCampaignCount: Number(campaignRows[0]?.value ?? 0),
      };
    },

    async persistEvidence(bundle, diagnosis = null) {
      let row = await findEvidenceRow(bundle);
      const values = {
        userId: bundle.userId,
        workshopId: bundle.workId,
        workshopRunId: bundle.workRunId,
        loopId: bundle.loopId,
        loopRunId: bundle.loopRunId,
        workVersionId: bundle.workVersionId,
        harnessSnapshotId: bundle.harnessSnapshotId,
        componentSetHash: bundle.componentSetHash,
        runtimeSummary: encodeJson(bundle.runtime),
        observationSummary: encodeJson(bundle.observations),
        actionSummary: encodeJson(bundle.actions),
        outcomeSummary: encodeJson(bundle.outcome),
        evidenceRefs: encodeJson(bundle.evidenceRefs),
        captureStatus: bundle.captureStatus,
        completeness: bundle.completeness,
        warnings: encodeJson(bundle.warnings),
        updatedAt: new Date(),
      };
      if (!row) {
        await database
          .insert(tables.workRunEvidenceBundles)
          .values({
            id: bundle.id,
            ...values,
            createdAt: new Date(bundle.createdAt),
          })
          .onConflictDoNothing();
        row = await findEvidenceRow(bundle);
      } else {
        await database
          .update(tables.workRunEvidenceBundles)
          .set(values)
          .where(eq(tables.workRunEvidenceBundles.id, row.id));
      }
      if (!row) {
        throw new Error("Failed to persist run evidence bundle.");
      }

      if (diagnosis) {
        const [existingDiagnosis] = await database
          .select()
          .from(tables.workRunDiagnostics)
          .where(
            and(
              eq(tables.workRunDiagnostics.evidenceBundleId, row.id),
              eq(tables.workRunDiagnostics.analyzerVersion, "run-diagnosis.v1"),
            ),
          )
          .limit(1);
        const diagnosisValues = {
          evidenceBundleId: row.id,
          analyzerVersion: "run-diagnosis.v1",
          failureClasses: encodeJson(diagnosis.failureClasses),
          symptoms: encodeJson(diagnosis.symptoms),
          rootCauseCandidates: encodeJson(diagnosis.rootCauseCandidates),
          targetComponentTypes: encodeJson(diagnosis.targetComponentTypes),
          confidence: diagnosis.confidence,
          evidenceRefs: encodeJson(diagnosis.evidenceRefs),
          status: diagnosis.status,
        };
        if (existingDiagnosis) {
          await database
            .update(tables.workRunDiagnostics)
            .set(diagnosisValues)
            .where(eq(tables.workRunDiagnostics.id, existingDiagnosis.id));
        } else {
          await database.insert(tables.workRunDiagnostics).values({
            id: crypto.randomUUID(),
            ...diagnosisValues,
            createdAt: new Date(),
          });
        }
      }
      const [current] = await database
        .select()
        .from(tables.workRunEvidenceBundles)
        .where(eq(tables.workRunEvidenceBundles.id, row.id))
        .limit(1);
      return readEvidence(current);
    },

    async getEvidence(workshopId, evidenceBundleId) {
      const [row] = await database
        .select()
        .from(tables.workRunEvidenceBundles)
        .where(
          and(
            eq(tables.workRunEvidenceBundles.workshopId, workshopId),
            eq(tables.workRunEvidenceBundles.id, evidenceBundleId),
          ),
        )
        .limit(1);
      return row ? readEvidence(row) : null;
    },

    async listEvidence(workshopId, limit = 20) {
      const rows = await database
        .select()
        .from(tables.workRunEvidenceBundles)
        .where(eq(tables.workRunEvidenceBundles.workshopId, workshopId))
        .orderBy(desc(tables.workRunEvidenceBundles.createdAt))
        .limit(Math.min(100, Math.max(1, limit)));
      return Promise.all(rows.map((row: any) => readEvidence(row)));
    },

    async persistProposal(proposal) {
      const existing = await findProposalRow(proposal.workId, proposal.id);
      if (existing) return readProposal(existing);
      for (const change of proposal.changes) {
        await assertChangeItemReferences(change);
      }
      await database
        .insert(tables.workHarnessChangeProposals)
        .values({
          id: proposal.id,
          workshopId: proposal.workId,
          scope: proposal.scope,
          affectedWorkIds: encodeJson(proposal.affectedWorkIds),
          baseWorkVersionId: proposal.baseWorkVersionId,
          baseHarnessSnapshotId: proposal.baseHarnessSnapshotId,
          baseComponentSetHash: proposal.baseComponentSetHash,
          proposedBy: proposal.proposedBy,
          status: proposal.status,
          riskLevel: proposal.riskLevel,
          failurePattern: proposal.failurePattern,
          evidenceRefs: encodeJson(proposal.evidenceRefs),
          rootCauseHypothesis: proposal.rootCauseHypothesis,
          predictedFixes: encodeJson(proposal.predictedFixes),
          predictedRegressions: encodeJson(proposal.predictedRegressions),
          successMetrics: encodeJson(proposal.successMetrics),
          evaluationSuiteId: proposal.evaluationSuiteId,
          evaluationScenarioIds: encodeJson(proposal.evaluationScenarioIds),
          evaluationWindow: encodeJson(proposal.evaluationWindow),
          rollbackPlan: encodeJson(proposal.rollbackPlan),
          attributionLimited: proposal.attributionLimited,
          expiresAt: proposal.expiresAt ? new Date(proposal.expiresAt) : null,
          createdAt: new Date(proposal.createdAt),
          updatedAt: new Date(proposal.updatedAt),
        })
        .onConflictDoNothing();
      for (const change of proposal.changes) {
        await database.insert(tables.workHarnessChangeItems).values({
          id: crypto.randomUUID(),
          proposalId: proposal.id,
          componentId: change.componentId,
          componentType: change.componentType,
          beforeRevisionId: change.beforeRevisionId,
          patch: encodeJson(change.patch),
          rationale: change.rationale,
          groupKey: change.groupKey ?? null,
          createdAt: new Date(proposal.createdAt),
        });
      }
      const stored = await findProposalRow(proposal.workId, proposal.id);
      if (!stored) throw new Error("Failed to persist Harness proposal.");
      return readProposal(stored);
    },

    async getProposal(workshopId, proposalId) {
      const row = await findProposalRow(workshopId, proposalId);
      return row ? readProposal(row) : null;
    },

    async listProposals(workshopId, limit = 20) {
      const rows = await database
        .select()
        .from(tables.workHarnessChangeProposals)
        .where(eq(tables.workHarnessChangeProposals.workshopId, workshopId))
        .orderBy(desc(tables.workHarnessChangeProposals.createdAt))
        .limit(Math.min(100, Math.max(1, limit)));
      return Promise.all(rows.map((row: any) => readProposal(row)));
    },

    async transitionProposal(input) {
      const proposal = await findProposalRow(
        input.workshopId,
        input.proposalId,
      );
      if (!proposal) throw new Error("Harness proposal not found.");
      if (proposal.status !== input.expectedStatus) {
        throw new Error("Harness proposal changed concurrently.");
      }
      const domainProposal = await readProposal(proposal);
      if (input.currentBase) {
        assertHarnessProposalBase(
          domainProposal,
          input.currentBase.workVersionId,
          input.currentBase.harnessSnapshotId,
          input.currentBase.componentSetHash,
        );
      } else if (
        input.nextStatus !== "rejected" &&
        input.nextStatus !== "superseded" &&
        input.nextStatus !== "reverted"
      ) {
        throw new Error(
          "Current Harness base is required for an applicable proposal transition.",
        );
      }
      assertHarnessProposalTransition(input.expectedStatus, input.nextStatus);
      const [updated] = await database
        .update(tables.workHarnessChangeProposals)
        .set({ status: input.nextStatus, updatedAt: new Date() })
        .where(
          and(
            eq(tables.workHarnessChangeProposals.id, input.proposalId),
            eq(tables.workHarnessChangeProposals.workshopId, input.workshopId),
            eq(tables.workHarnessChangeProposals.status, input.expectedStatus),
          ),
        )
        .returning();
      if (!updated) throw new Error("Harness proposal changed concurrently.");
      return readProposal(updated);
    },

    async materializeCandidate(input) {
      if (
        dialect === "postgres" &&
        !disableTransactions &&
        typeof database.transaction === "function"
      ) {
        return database.transaction((transaction: any) =>
          createHarnessEvolutionRepository({
            database: transaction,
            dialect,
            tables,
            disableTransactions: true,
          }).materializeCandidate(input),
        );
      }
      const proposalRow = await findProposalRow(
        input.workshopId,
        input.proposalId,
      );
      if (!proposalRow) throw new Error("Harness proposal not found.");
      if (proposalRow.status !== input.expectedStatus) {
        throw new Error("Harness proposal changed concurrently.");
      }
      const proposal = await readProposal(proposalRow);
      const [latestActiveSnapshot] = await database
        .select()
        .from(tables.workHarnessSnapshots)
        .where(
          and(
            eq(tables.workHarnessSnapshots.workshopId, input.workshopId),
            eq(tables.workHarnessSnapshots.status, "active"),
          ),
        )
        .orderBy(desc(tables.workHarnessSnapshots.resolvedAt))
        .limit(1);
      if (!latestActiveSnapshot) {
        throw new Error("No active Harness snapshot exists for this Work.");
      }
      assertHarnessProposalBase(
        proposal,
        latestActiveSnapshot.workVersionId,
        latestActiveSnapshot.id,
        latestActiveSnapshot.componentSetHash,
      );

      const baseItems = await database
        .select({
          key: tables.harnessComponents.componentKey,
          componentId: tables.harnessComponents.id,
          type: tables.harnessComponents.componentType,
          scopeType: tables.harnessComponents.scopeType,
          scopeId: tables.harnessComponents.scopeId,
          owner: tables.harnessComponents.owner,
          mutability: tables.harnessComponents.mutability,
          riskLevel: tables.harnessComponents.riskLevel,
          sourceKind: tables.harnessComponents.sourceKind,
          sourceRef: tables.harnessComponents.sourceRef,
          revisionId: tables.harnessComponentRevisions.id,
          sourceVersion: tables.harnessComponentRevisions.sourceVersion,
          content: tables.harnessComponentRevisions.content,
        })
        .from(tables.workHarnessSnapshotItems)
        .innerJoin(
          tables.harnessComponents,
          eq(
            tables.harnessComponents.id,
            tables.workHarnessSnapshotItems.componentId,
          ),
        )
        .innerJoin(
          tables.harnessComponentRevisions,
          eq(
            tables.harnessComponentRevisions.id,
            tables.workHarnessSnapshotItems.revisionId,
          ),
        )
        .where(
          eq(
            tables.workHarnessSnapshotItems.snapshotId,
            latestActiveSnapshot.id,
          ),
        )
        .orderBy(tables.workHarnessSnapshotItems.componentOrder);
      const changeByComponent = new Map(
        proposal.changes.map((change) => [change.componentId, change]),
      );
      for (const change of proposal.changes) {
        const base = baseItems.find(
          (item: any) => item.componentId === change.componentId,
        );
        if (!base || base.revisionId !== change.beforeRevisionId) {
          throw new Error(
            `Harness proposal change ${change.componentId} is stale against the base snapshot.`,
          );
        }
      }
      const [workVersion] = await database
        .select({ version: tables.workshopWorkVersions.version })
        .from(tables.workshopWorkVersions)
        .where(
          eq(
            tables.workshopWorkVersions.id,
            latestActiveSnapshot.workVersionId,
          ),
        )
        .limit(1);
      const candidateDomain = assembleWorkHarnessSnapshot({
        workId: input.workshopId,
        workVersionId: latestActiveSnapshot.workVersionId,
        workVersion: workVersion?.version ?? latestActiveSnapshot.workVersionId,
        platformVersion: latestActiveSnapshot.platformVersion,
        modelRuntime: decodeJson(
          latestActiveSnapshot.modelRuntime,
        ) as WorkHarnessSnapshot["modelRuntime"],
        policy: {
          allowedActions:
            (decodeJson(latestActiveSnapshot.policySummary) as any)
              .allowedActions ?? [],
          approvalRequiredActions:
            (decodeJson(latestActiveSnapshot.policySummary) as any)
              .approvalRequiredActions ?? [],
          deniedActions:
            (decodeJson(latestActiveSnapshot.policySummary) as any)
              .deniedActions ?? [],
        },
        components: baseItems.map((item: any) => {
          const change = changeByComponent.get(item.componentId);
          const content = decodeJson(item.content) as Record<string, unknown>;
          return {
            key: item.key,
            type: item.type,
            scope: {
              type: item.scopeType,
              id:
                item.scopeType === "platform" && item.scopeId === "platform"
                  ? null
                  : item.scopeId,
            },
            owner: item.owner,
            mutability: item.mutability,
            riskLevel: item.riskLevel,
            sourceKind: item.sourceKind,
            sourceRef: item.sourceRef,
            sourceVersion: item.sourceVersion,
            content: change
              ? applyHarnessJsonMergePatch(content, change.patch)
              : content,
          };
        }),
      });
      if (
        candidateDomain.componentSetHash ===
        latestActiveSnapshot.componentSetHash
      ) {
        throw new Error(
          "Harness candidate patch does not change any component.",
        );
      }
      let candidateSnapshot: PersistedHarnessSnapshot | null = null;
      let candidateRevisionIds: string[] = [];
      try {
        candidateSnapshot = await this.persistSnapshot(candidateDomain, {
          status: "preparing",
          activate: false,
        });
        const baseRevisionByKey = new Map(
          baseItems.map((item: any) => [item.key, item.revisionId]),
        );
        candidateRevisionIds = candidateSnapshot.components
          .filter(
            (component) =>
              baseRevisionByKey.get(component.key) !== component.revisionId,
          )
          .map((component) => component.revisionId);
        for (const change of proposal.changes) {
          const base = baseItems.find(
            (item: any) => item.componentId === change.componentId,
          );
          const candidate = candidateSnapshot.components.find(
            (component) => component.key === base.key,
          );
          if (!candidate) {
            throw new Error(
              `Candidate revision was not created for ${change.componentId}.`,
            );
          }
          await database
            .update(tables.harnessComponentRevisions)
            .set({
              createdBy: proposal.proposedBy,
              changeProposalId: proposal.id,
              status: "preparing",
            })
            .where(
              eq(tables.harnessComponentRevisions.id, candidate.revisionId),
            );
          await database
            .update(tables.workHarnessChangeItems)
            .set({ afterRevisionId: candidate.revisionId })
            .where(
              and(
                eq(tables.workHarnessChangeItems.proposalId, proposal.id),
                eq(
                  tables.workHarnessChangeItems.componentId,
                  change.componentId,
                ),
              ),
            );
        }
        const [updatedProposal] = await database
          .update(tables.workHarnessChangeProposals)
          .set({ status: "canary", updatedAt: new Date() })
          .where(
            and(
              eq(tables.workHarnessChangeProposals.id, proposal.id),
              eq(
                tables.workHarnessChangeProposals.status,
                input.expectedStatus,
              ),
            ),
          )
          .returning();
        if (!updatedProposal) {
          throw new Error("Harness proposal changed concurrently.");
        }
        if (candidateRevisionIds.length > 0) {
          await database
            .update(tables.harnessComponentRevisions)
            .set({ status: "candidate" })
            .where(
              inArray(
                tables.harnessComponentRevisions.id,
                candidateRevisionIds,
              ),
            );
        }
        const [updatedSnapshot] = await database
          .update(tables.workHarnessSnapshots)
          .set({ status: "candidate" })
          .where(eq(tables.workHarnessSnapshots.id, candidateSnapshot.id))
          .returning();
        if (!updatedSnapshot) {
          throw new Error("Failed to finalize the Harness candidate snapshot.");
        }
        return {
          proposal: await readProposal(updatedProposal),
          snapshot: await readPersistedSnapshot(updatedSnapshot),
        };
      } catch (error) {
        if (candidateSnapshot) {
          await database
            .update(tables.workHarnessSnapshots)
            .set({ status: "reverted" })
            .where(eq(tables.workHarnessSnapshots.id, candidateSnapshot.id));
        }
        if (candidateRevisionIds.length > 0) {
          await database
            .update(tables.harnessComponentRevisions)
            .set({ status: "reverted" })
            .where(
              inArray(
                tables.harnessComponentRevisions.id,
                candidateRevisionIds,
              ),
            );
        }
        await database
          .update(tables.workHarnessChangeItems)
          .set({ afterRevisionId: null })
          .where(eq(tables.workHarnessChangeItems.proposalId, proposal.id));
        await database
          .update(tables.workHarnessChangeProposals)
          .set({ status: "reverted", updatedAt: new Date() })
          .where(
            and(
              eq(tables.workHarnessChangeProposals.id, proposal.id),
              eq(tables.workHarnessChangeProposals.status, "canary"),
            ),
          );
        throw error;
      }
    },

    async discardCandidate(input) {
      const proposalRow = await findProposalRow(
        input.workshopId,
        input.proposalId,
      );
      if (!proposalRow) throw new Error("Harness proposal not found.");
      if (proposalRow.status !== input.expectedStatus) {
        throw new Error("Harness proposal changed concurrently.");
      }
      assertHarnessProposalTransition(input.expectedStatus, "reverted");
      await markCandidateArtifactsReverted(input.proposalId);
      const [updated] = await database
        .update(tables.workHarnessChangeProposals)
        .set({ status: "reverted", updatedAt: new Date() })
        .where(
          and(
            eq(tables.workHarnessChangeProposals.id, input.proposalId),
            eq(tables.workHarnessChangeProposals.status, input.expectedStatus),
          ),
        )
        .returning();
      if (!updated) throw new Error("Harness proposal changed concurrently.");
      return readProposal(updated);
    },

    async settleCandidateEvaluation(input) {
      const proposalRow = await findProposalRow(
        input.workshopId,
        input.proposalId,
      );
      if (!proposalRow) throw new Error("Harness proposal not found.");
      if (proposalRow.status !== input.expectedStatus) {
        throw new Error("Harness proposal changed concurrently.");
      }
      assertHarnessProposalTransition(input.expectedStatus, input.nextStatus);
      if (input.nextStatus === "rejected") {
        await markCandidateArtifactsReverted(input.proposalId);
      }
      const [updated] = await database
        .update(tables.workHarnessChangeProposals)
        .set({ status: input.nextStatus, updatedAt: new Date() })
        .where(
          and(
            eq(tables.workHarnessChangeProposals.id, input.proposalId),
            eq(tables.workHarnessChangeProposals.status, input.expectedStatus),
          ),
        )
        .returning();
      if (!updated) throw new Error("Harness proposal changed concurrently.");
      return readProposal(updated);
    },

    async persistEvaluationSuite(definition, requestedUserId = null) {
      const userId = definition.ownerType === "user" ? requestedUserId : null;
      if (definition.ownerType === "user" && !userId) {
        throw new Error("A user-owned evaluation suite requires userId.");
      }
      let row = await findEvaluationSuite(definition, userId);
      const values = {
        userId,
        ownerType: definition.ownerType,
        workRole: definition.workRole,
        name: definition.name,
        version: definition.version,
        status: definition.status,
        metricPolicy: encodeJson(definition.metricPolicy),
        holdoutPolicy: encodeJson(definition.holdoutPolicy),
        updatedAt: new Date(),
      };
      if (!row) {
        await database
          .insert(tables.workEvaluationSuites)
          .values({
            id: crypto.randomUUID(),
            ...values,
            createdAt: new Date(),
          })
          .onConflictDoNothing();
        row = await findEvaluationSuite(definition, userId);
      } else {
        await database
          .update(tables.workEvaluationSuites)
          .set(values)
          .where(eq(tables.workEvaluationSuites.id, row.id));
      }
      if (!row) throw new Error("Failed to persist evaluation suite.");

      for (const scenario of definition.scenarios) {
        const [existingScenario] = await database
          .select()
          .from(tables.workEvaluationScenarios)
          .where(
            and(
              eq(tables.workEvaluationScenarios.suiteId, row.id),
              eq(
                tables.workEvaluationScenarios.scenarioKey,
                scenario.scenarioKey,
              ),
            ),
          )
          .limit(1);
        const scenarioValues = {
          suiteId: row.id,
          scenarioKey: scenario.scenarioKey,
          name: scenario.name,
          mode: scenario.mode,
          tags: encodeJson(scenario.tags),
          riskTier: scenario.riskTier,
          fixtureRef: scenario.fixtureRef,
          preconditions: encodeJson(scenario.preconditions),
          taskIntent: scenario.taskIntent,
          expectedArtifacts: encodeJson(scenario.expectedArtifacts),
          hardInvariants: encodeJson(scenario.hardInvariants),
          forbiddenActions: encodeJson(scenario.forbiddenActions),
          metrics: encodeJson(scenario.metrics),
          repetitions: scenario.repetitions,
          timeoutMs: scenario.timeoutMs,
          status: scenario.status,
          updatedAt: new Date(),
        };
        if (existingScenario) {
          await database
            .update(tables.workEvaluationScenarios)
            .set(scenarioValues)
            .where(eq(tables.workEvaluationScenarios.id, existingScenario.id));
        } else {
          await database.insert(tables.workEvaluationScenarios).values({
            id: crypto.randomUUID(),
            ...scenarioValues,
            createdAt: new Date(),
          });
        }
      }
      const current = await findEvaluationSuite(definition, userId);
      return readEvaluationSuite(current);
    },

    async listEvaluationSuites(input) {
      const conditions = [];
      if (input.userId) {
        conditions.push(eq(tables.workEvaluationSuites.userId, input.userId));
      }
      if (input.workRole) {
        conditions.push(
          eq(tables.workEvaluationSuites.workRole, input.workRole),
        );
      }
      const query = database
        .select()
        .from(tables.workEvaluationSuites)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          tables.workEvaluationSuites.workRole,
          desc(tables.workEvaluationSuites.version),
        );
      const rows = await query;
      return Promise.all(rows.map((row: any) => readEvaluationSuite(row)));
    },

    async getEvaluationSuite(suiteId) {
      const [row] = await database
        .select()
        .from(tables.workEvaluationSuites)
        .where(eq(tables.workEvaluationSuites.id, suiteId))
        .limit(1);
      return row ? readEvaluationSuite(row) : null;
    },

    async createEvaluationCampaign(input) {
      const id = input.id ?? crypto.randomUUID();
      await database.insert(tables.workEvaluationCampaigns).values({
        id,
        workshopId: input.workshopId,
        suiteId: input.suiteId,
        baselineWorkVersionId: input.baselineWorkVersionId,
        candidateWorkVersionId: input.candidateWorkVersionId,
        baselineHarnessSnapshotId: input.baselineHarnessSnapshotId,
        candidateHarnessSnapshotId: input.candidateHarnessSnapshotId,
        changeProposalId: input.changeProposalId,
        status: "pending",
        runtimeContract: encodeJson(input.runtimeContract),
        budget: encodeJson(input.budget),
        summary: encodeJson({}),
        createdAt: new Date(),
      });
      const [row] = await database
        .select()
        .from(tables.workEvaluationCampaigns)
        .where(eq(tables.workEvaluationCampaigns.id, id))
        .limit(1);
      return evaluationCampaignFromRow(row);
    },

    async getEvaluationCampaign(workshopId, campaignId) {
      const [row] = await database
        .select()
        .from(tables.workEvaluationCampaigns)
        .where(
          and(
            eq(tables.workEvaluationCampaigns.workshopId, workshopId),
            eq(tables.workEvaluationCampaigns.id, campaignId),
          ),
        )
        .limit(1);
      return row ? evaluationCampaignFromRow(row) : null;
    },

    async listEvaluationCampaigns(workshopId, limit = 20) {
      const rows = await database
        .select()
        .from(tables.workEvaluationCampaigns)
        .where(eq(tables.workEvaluationCampaigns.workshopId, workshopId))
        .orderBy(desc(tables.workEvaluationCampaigns.createdAt))
        .limit(Math.min(100, Math.max(1, limit)));
      return rows.map((row: any) => evaluationCampaignFromRow(row));
    },

    async startEvaluationCampaign(input) {
      const [updated] = await database
        .update(tables.workEvaluationCampaigns)
        .set({ status: "running", startedAt: new Date() })
        .where(
          and(
            eq(tables.workEvaluationCampaigns.workshopId, input.workshopId),
            eq(tables.workEvaluationCampaigns.id, input.campaignId),
            eq(tables.workEvaluationCampaigns.status, "pending"),
          ),
        )
        .returning();
      if (!updated) {
        throw new Error("Evaluation campaign is missing or already started.");
      }
      return evaluationCampaignFromRow(updated);
    },

    async persistEvaluationRun(input) {
      const [existing] = await database
        .select()
        .from(tables.workEvaluationRuns)
        .where(
          and(
            eq(tables.workEvaluationRuns.campaignId, input.campaignId),
            eq(tables.workEvaluationRuns.scenarioId, input.scenarioId),
            eq(tables.workEvaluationRuns.cohort, input.cohort),
            eq(tables.workEvaluationRuns.repetition, input.repetition),
          ),
        )
        .limit(1);
      const values = {
        campaignId: input.campaignId,
        scenarioId: input.scenarioId,
        cohort: input.cohort,
        repetition: input.repetition,
        status: input.status,
        score: input.score,
        metrics: encodeJson(input.metrics),
        evidenceBundleId: input.evidenceBundleId,
        error: input.error,
        startedAt: input.startedAt ? new Date(input.startedAt) : null,
        completedAt: input.completedAt ? new Date(input.completedAt) : null,
      };
      if (existing) {
        await database
          .update(tables.workEvaluationRuns)
          .set(values)
          .where(eq(tables.workEvaluationRuns.id, existing.id));
        return { id: existing.id };
      }
      const id = input.id ?? crypto.randomUUID();
      await database.insert(tables.workEvaluationRuns).values({
        id,
        ...values,
        createdAt: new Date(),
      });
      return { id };
    },

    async listEvaluationRuns(campaignId) {
      const rows = await database
        .select()
        .from(tables.workEvaluationRuns)
        .where(eq(tables.workEvaluationRuns.campaignId, campaignId))
        .orderBy(
          tables.workEvaluationRuns.scenarioId,
          tables.workEvaluationRuns.cohort,
          tables.workEvaluationRuns.repetition,
        );
      return rows.map((row: any) => ({
        id: row.id,
        campaignId: row.campaignId,
        scenarioId: row.scenarioId,
        cohort: row.cohort,
        repetition: row.repetition,
        status: row.status,
        score: row.score ?? null,
        metrics: decodeJson(row.metrics) as Record<string, number>,
        evidenceBundleId: row.evidenceBundleId ?? null,
        error: row.error ?? null,
        startedAt: iso(row.startedAt),
        completedAt: iso(row.completedAt),
      }));
    },

    async completeEvaluationCampaign(input) {
      const [updated] = await database
        .update(tables.workEvaluationCampaigns)
        .set({
          status: input.status,
          summary: encodeJson(input.summary),
          completedAt: new Date(),
        })
        .where(eq(tables.workEvaluationCampaigns.id, input.campaignId))
        .returning();
      if (!updated) throw new Error("Evaluation campaign not found.");
      return evaluationCampaignFromRow(updated);
    },

    async persistVerdict(verdict) {
      const [proposal] = await database
        .select({
          evidenceRefs: tables.workHarnessChangeProposals.evidenceRefs,
        })
        .from(tables.workHarnessChangeProposals)
        .where(eq(tables.workHarnessChangeProposals.id, verdict.proposalId))
        .limit(1);
      if (!proposal) throw new Error("Harness proposal not found for verdict.");
      const [existing] = await database
        .select()
        .from(tables.workEvolutionVerdicts)
        .where(
          and(
            eq(tables.workEvolutionVerdicts.proposalId, verdict.proposalId),
            eq(
              tables.workEvolutionVerdicts.campaignId,
              verdict.evaluationCampaignId,
            ),
          ),
        )
        .limit(1);
      const values = {
        proposalId: verdict.proposalId,
        campaignId: verdict.evaluationCampaignId,
        status: verdict.status,
        fixedScenarios: encodeJson(verdict.fixedScenarios),
        regressedScenarios: encodeJson(verdict.regressedScenarios),
        unexpectedChanges: encodeJson([
          ...verdict.refutedPredictions,
          ...verdict.unresolvedPredictions,
        ]),
        predictionAccuracy: encodeJson({
          value: verdict.predictionAccuracy,
          confirmedPredictions: verdict.confirmedPredictions,
          attributionLimited: verdict.attributionLimited,
          summary: verdict.summary,
          hardInvariantFailures: verdict.hardInvariantFailures,
        }),
        recommendedAction: verdict.recommendedAction,
        evidenceRefs: proposal.evidenceRefs,
      };
      if (existing) {
        await database
          .update(tables.workEvolutionVerdicts)
          .set(values)
          .where(eq(tables.workEvolutionVerdicts.id, existing.id));
      } else {
        await database.insert(tables.workEvolutionVerdicts).values({
          id: verdict.id,
          ...values,
          createdAt: new Date(verdict.createdAt),
        });
      }
      return verdict;
    },
  };
}

export const harnessEvolutionRepository = createHarnessEvolutionRepository();
