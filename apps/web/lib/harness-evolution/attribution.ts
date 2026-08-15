import type {
  HarnessChangePrediction,
  HarnessChangeProposalV2,
  HarnessEvaluationResult,
  HarnessEvolutionVerdict,
  HarnessPredictionOutcome,
} from "./types";

function unresolvedOutcome(
  predictionType: HarnessPredictionOutcome["predictionType"],
  prediction: HarnessChangePrediction,
  reason: string,
): HarnessPredictionOutcome {
  return {
    predictionType,
    prediction,
    status: "unresolved",
    actualDelta: null,
    reason,
  };
}

function assessPrediction(
  predictionType: HarnessPredictionOutcome["predictionType"],
  prediction: HarnessChangePrediction,
  evaluation: HarnessEvaluationResult,
): HarnessPredictionOutcome {
  const comparison = evaluation.comparisons.find(
    (candidate) => candidate.scenarioId === prediction.scenarioId,
  );
  const threshold =
    typeof prediction.threshold === "number"
      ? Math.abs(prediction.threshold)
      : Number.NaN;
  const delta = comparison?.delta[prediction.metric];
  if (!comparison || delta === undefined || !Number.isFinite(delta)) {
    return unresolvedOutcome(
      predictionType,
      prediction,
      "The matched evaluation does not contain this scenario and metric.",
    );
  }
  if (!Number.isFinite(threshold)) {
    return unresolvedOutcome(
      predictionType,
      prediction,
      "The prediction threshold is not numeric.",
    );
  }

  const confirmed =
    prediction.expectedDirection === "improve"
      ? delta >= threshold
      : prediction.expectedDirection === "regress"
        ? delta <= -threshold
        : Math.abs(delta) <= threshold;

  return {
    predictionType,
    prediction,
    status: confirmed ? "confirmed" : "refuted",
    actualDelta: delta,
    reason: confirmed
      ? "The matched metric supports the prediction."
      : "The matched metric refutes the prediction.",
  };
}

export function attributeHarnessEvolution(input: {
  proposal: HarnessChangeProposalV2;
  evaluation: HarnessEvaluationResult;
  evaluationCampaignId: string;
  id?: string;
  createdAt?: string;
}): HarnessEvolutionVerdict {
  const predictions = [
    ...input.proposal.predictedFixes.map((prediction) => ({
      predictionType: "fix" as const,
      prediction,
    })),
    ...input.proposal.predictedRegressions.map((prediction) => ({
      predictionType: "regression_guard" as const,
      prediction,
    })),
  ];
  const outcomes =
    input.evaluation.status === "inconclusive"
      ? predictions.map(({ predictionType, prediction }) =>
          unresolvedOutcome(
            predictionType,
            prediction,
            "The evaluation campaign is inconclusive.",
          ),
        )
      : predictions.map(({ predictionType, prediction }) =>
          assessPrediction(predictionType, prediction, input.evaluation),
        );
  const confirmedPredictions = outcomes.filter(
    (outcome) => outcome.status === "confirmed",
  );
  const refutedPredictions = outcomes.filter(
    (outcome) => outcome.status === "refuted",
  );
  const unresolvedPredictions = outcomes.filter(
    (outcome) => outcome.status === "unresolved",
  );
  const assessedCount = confirmedPredictions.length + refutedPredictions.length;
  const predictionAccuracy =
    assessedCount > 0 ? confirmedPredictions.length / assessedCount : null;

  let status: HarnessEvolutionVerdict["status"];
  let recommendedAction: HarnessEvolutionVerdict["recommendedAction"];
  if (input.evaluation.status === "inconclusive") {
    status = "inconclusive";
    recommendedAction = "collect_more_data";
  } else if (
    input.evaluation.hardInvariantFailures.length > 0 ||
    input.evaluation.recommendedAction === "rollback"
  ) {
    status = "rejected";
    recommendedAction = "rollback";
  } else if (unresolvedPredictions.length > 0) {
    status = "inconclusive";
    recommendedAction = "collect_more_data";
  } else if (refutedPredictions.length === 0) {
    status = "confirmed";
    recommendedAction = "keep";
  } else if (
    confirmedPredictions.some((item) => item.predictionType === "fix")
  ) {
    status = "partial";
    recommendedAction = "revise";
  } else {
    status = "rejected";
    recommendedAction = "revise";
  }

  const summary =
    status === "confirmed"
      ? "All declared predictions were supported by matched evaluation evidence."
      : status === "partial"
        ? "The target improved, but at least one declared prediction was refuted."
        : status === "rejected"
          ? "The candidate was rejected by its evidence or safety boundaries."
          : "The available evidence is insufficient for an evolution decision.";

  return {
    interfaceVersion: "harness-evolution-verdict.v1",
    id: input.id ?? crypto.randomUUID(),
    proposalId: input.proposal.id,
    evaluationCampaignId: input.evaluationCampaignId,
    status,
    recommendedAction,
    predictionAccuracy,
    confirmedPredictions,
    refutedPredictions,
    unresolvedPredictions,
    fixedScenarios: input.evaluation.fixedScenarios,
    regressedScenarios: input.evaluation.regressedScenarios,
    hardInvariantFailures: input.evaluation.hardInvariantFailures,
    attributionLimited: input.proposal.attributionLimited,
    summary,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
