import { attributeHarnessEvolution } from "./attribution";
import { createBuiltinHarnessScenarioExecutor } from "./builtin-evaluator";
import {
  harnessEvolutionRepository,
  type HarnessEvolutionRepository,
} from "./repository";
import { runHarnessEvaluation } from "./evaluation-runner";
import type {
  HarnessEvaluationExecutionRequest,
  HarnessEvaluationResult,
  HarnessEvolutionVerdict,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberRecord(value: unknown) {
  return Object.fromEntries(
    Object.entries(asRecord(value)).flatMap(([key, candidate]) =>
      typeof candidate === "number" && Number.isFinite(candidate)
        ? [[key, candidate]]
        : [],
    ),
  );
}

function positiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function runtimeContract(value: Record<string, unknown>) {
  const baseline = asRecord(value.baseline);
  const candidate = asRecord(value.candidate);
  if (Object.keys(baseline).length > 0 || Object.keys(candidate).length > 0) {
    return { baseline, candidate };
  }
  const shared = asRecord(value.shared);
  const contract = Object.keys(shared).length > 0 ? shared : value;
  return { baseline: contract, candidate: contract };
}

export interface PersistedHarnessEvaluationResult {
  evaluation: HarnessEvaluationResult;
  verdict: HarnessEvolutionVerdict | null;
  campaignStatus: string;
  proposalStatus: string | null;
  persistedRunCount: number;
}

export async function runPersistedHarnessEvaluationCampaign(input: {
  workshopId: string;
  campaignId: string;
  repository?: HarnessEvolutionRepository;
}): Promise<PersistedHarnessEvaluationResult> {
  const repository = input.repository ?? harnessEvolutionRepository;
  const campaign = await repository.getEvaluationCampaign(
    input.workshopId,
    input.campaignId,
  );
  if (!campaign) throw new Error("Evaluation campaign not found.");
  if (campaign.status !== "pending") {
    throw new Error("Evaluation campaign has already started.");
  }
  const [suite, baseline, candidate] = await Promise.all([
    repository.getEvaluationSuite(campaign.suiteId),
    repository.getResolvedSnapshot(
      input.workshopId,
      campaign.baselineHarnessSnapshotId,
    ),
    repository.getResolvedSnapshot(
      input.workshopId,
      campaign.candidateHarnessSnapshotId,
    ),
  ]);
  if (!suite || !baseline || !candidate) {
    throw new Error("Evaluation suite or Harness snapshots are missing.");
  }
  if (baseline.status !== "active" || candidate.status !== "candidate") {
    throw new Error(
      "Evaluation requires an active baseline and isolated candidate.",
    );
  }

  const proposal = campaign.changeProposalId
    ? await repository.getProposal(input.workshopId, campaign.changeProposalId)
    : null;
  if (campaign.changeProposalId && !proposal) {
    throw new Error("Evaluation proposal not found.");
  }
  const selectedPublicScenarios = proposal
    ? suite.scenarios.filter(
        (scenario) =>
          scenario.riskTier !== "holdout" &&
          (proposal.evaluationScenarioIds.includes(scenario.id) ||
            proposal.evaluationScenarioIds.includes(scenario.scenarioKey)),
      )
    : suite.scenarios.filter((scenario) => scenario.riskTier !== "holdout");
  if (selectedPublicScenarios.length === 0) {
    throw new Error("The proposal does not select a scenario from this suite.");
  }
  const selectedScenarios = [
    ...selectedPublicScenarios,
    ...suite.scenarios.filter(
      (scenario) =>
        scenario.riskTier === "holdout" && scenario.status === "active",
    ),
  ];
  const expectedRunCount = selectedScenarios.reduce(
    (sum, scenario) => sum + scenario.repetitions * 2,
    0,
  );
  const maxRuns = positiveInteger(campaign.budget.maxRuns, 200);
  if (expectedRunCount > maxRuns) {
    await repository.startEvaluationCampaign({
      workshopId: input.workshopId,
      campaignId: campaign.id,
    });
    const evaluation: HarnessEvaluationResult = {
      interfaceVersion: "harness-evaluation.v1",
      status: "inconclusive",
      recommendedAction: "collect_more_data",
      fixedScenarios: [],
      regressedScenarios: [],
      hardInvariantFailures: [],
      comparisons: [],
      warnings: [
        `Evaluation requires ${expectedRunCount} runs but the campaign budget allows ${maxRuns}.`,
      ],
    };
    await repository.completeEvaluationCampaign({
      campaignId: campaign.id,
      status: "budget_exhausted",
      summary: { evaluation },
    });
    return {
      evaluation,
      verdict: null,
      campaignStatus: "budget_exhausted",
      proposalStatus: proposal?.status ?? null,
      persistedRunCount: 0,
    };
  }

  if (proposal?.status === "canary") {
    await repository.transitionProposal({
      workshopId: input.workshopId,
      proposalId: proposal.id,
      expectedStatus: "canary",
      nextStatus: "evaluating",
      currentBase: {
        workVersionId: proposal.baseWorkVersionId,
        harnessSnapshotId: proposal.baseHarnessSnapshotId,
        componentSetHash: proposal.baseComponentSetHash,
      },
    });
  } else if (proposal && proposal.status !== "evaluating") {
    throw new Error("Harness proposal is not ready for evaluation.");
  }
  await repository.startEvaluationCampaign({
    workshopId: input.workshopId,
    campaignId: campaign.id,
  });

  const executeBuiltin = createBuiltinHarnessScenarioExecutor({
    baseline,
    candidate,
  });
  const scenarioIds = new Map(
    selectedScenarios.map((scenario) => [scenario.scenarioKey, scenario.id]),
  );
  const evaluation = await runHarnessEvaluation({
    runtimeContract: runtimeContract(campaign.runtimeContract),
    scenarios: selectedScenarios,
    minimumSampleSize: positiveInteger(
      campaign.budget.minimumSampleSize,
      Math.min(...selectedScenarios.map((scenario) => scenario.repetitions)),
    ),
    regressionBudget: numberRecord(campaign.budget.regressionBudget),
    execute: async (request: HarnessEvaluationExecutionRequest) => {
      const startedAt = new Date().toISOString();
      const result = await executeBuiltin(request);
      const completedAt = new Date().toISOString();
      const scenarioId = scenarioIds.get(request.scenario.scenarioKey);
      if (!scenarioId) throw new Error("Evaluation scenario id is missing.");
      await repository.persistEvaluationRun({
        campaignId: campaign.id,
        scenarioId,
        cohort: request.cohort,
        repetition: request.repetition,
        status: result.status,
        score:
          typeof result.metrics.taskScore === "number"
            ? result.metrics.taskScore
            : null,
        metrics: result.metrics,
        evidenceBundleId: null,
        error:
          result.hardInvariantFailures &&
          result.hardInvariantFailures.length > 0
            ? result.hardInvariantFailures.join(", ")
            : null,
        startedAt,
        completedAt,
      });
      return result;
    },
  });
  const persistedRuns = await repository.listEvaluationRuns(campaign.id);
  if (persistedRuns.length !== expectedRunCount) {
    evaluation.status = "inconclusive";
    evaluation.recommendedAction = "collect_more_data";
    evaluation.warnings.push(
      `Only ${persistedRuns.length} of ${expectedRunCount} evaluation runs were persisted.`,
    );
  }

  let verdict: HarnessEvolutionVerdict | null = null;
  let proposalStatus = proposal?.status ?? null;
  if (proposal) {
    verdict = attributeHarnessEvolution({
      proposal: { ...proposal, status: "evaluating" },
      evaluation,
      evaluationCampaignId: campaign.id,
    });
    await repository.persistVerdict(verdict);
    if (verdict.status !== "inconclusive") {
      const settled = await repository.settleCandidateEvaluation({
        workshopId: input.workshopId,
        proposalId: proposal.id,
        expectedStatus: "evaluating",
        nextStatus: verdict.status,
      });
      proposalStatus = settled.status;
    } else {
      proposalStatus = "evaluating";
    }
  }
  const completed = await repository.completeEvaluationCampaign({
    campaignId: campaign.id,
    status: evaluation.status,
    summary: {
      evaluation,
      verdict,
      isolation: {
        externalActions: false,
        realFunds: false,
        destructiveActions: false,
      },
    },
  });
  return {
    evaluation,
    verdict,
    campaignStatus: completed.status,
    proposalStatus,
    persistedRunCount: persistedRuns.length,
  };
}
