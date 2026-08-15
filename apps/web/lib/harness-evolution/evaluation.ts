import { canonicalJson } from "./canonical-json";
import type {
  HarnessEvaluationResult,
  HarnessEvaluationRunResult,
} from "./types";

function unique(values: string[]) {
  return [...new Set(values)];
}

function averageMetrics(runs: HarnessEvaluationRunResult[]) {
  const values = new Map<string, number[]>();
  for (const run of runs) {
    if (run.status !== "success") continue;
    for (const [metric, value] of Object.entries(run.metrics)) {
      if (!Number.isFinite(value)) continue;
      const current = values.get(metric) ?? [];
      current.push(value);
      values.set(metric, current);
    }
  }
  return Object.fromEntries(
    [...values.entries()].map(([metric, metricValues]) => [
      metric,
      metricValues.reduce((sum, value) => sum + value, 0) / metricValues.length,
    ]),
  );
}

export function evaluateHarnessCandidate(input: {
  runtimeContract: {
    baseline: Record<string, unknown>;
    candidate: Record<string, unknown>;
  };
  minimumSampleSize: number;
  regressionBudget: Record<string, number>;
  runs: HarnessEvaluationRunResult[];
}): HarnessEvaluationResult {
  const warnings: string[] = [];
  if (
    canonicalJson(input.runtimeContract.baseline) !==
    canonicalJson(input.runtimeContract.candidate)
  ) {
    return {
      interfaceVersion: "harness-evaluation.v1",
      status: "inconclusive",
      recommendedAction: "collect_more_data",
      fixedScenarios: [],
      regressedScenarios: [],
      hardInvariantFailures: [],
      comparisons: [],
      warnings: ["Baseline and candidate runtime contracts differ."],
    };
  }

  const scenarioIds = unique(input.runs.map((run) => run.scenarioId));
  const hardInvariantFailures = scenarioIds.flatMap((scenarioId) => {
    const failures = unique(
      input.runs
        .filter(
          (run) => run.scenarioId === scenarioId && run.cohort === "candidate",
        )
        .flatMap((run) => run.hardInvariantFailures),
    );
    return failures.length > 0 ? [{ scenarioId, failures }] : [];
  });

  const fixedScenarios: string[] = [];
  const regressedScenarios: string[] = [];
  let insufficientSamples = false;
  const comparisons = scenarioIds.flatMap((scenarioId) => {
    const baselineRuns = input.runs.filter(
      (run) => run.scenarioId === scenarioId && run.cohort === "baseline",
    );
    const candidateRuns = input.runs.filter(
      (run) => run.scenarioId === scenarioId && run.cohort === "candidate",
    );
    const baselineSuccess = baselineRuns.filter(
      (run) => run.status === "success",
    );
    const candidateSuccess = candidateRuns.filter(
      (run) => run.status === "success",
    );
    if (
      baselineSuccess.length < input.minimumSampleSize ||
      candidateSuccess.length < input.minimumSampleSize
    ) {
      insufficientSamples = true;
      warnings.push(`Scenario ${scenarioId} has insufficient matched samples.`);
    }
    const baseline = averageMetrics(baselineRuns);
    const candidate = averageMetrics(candidateRuns);
    const commonMetrics = Object.keys(baseline).filter(
      (metric) => candidate[metric] !== undefined,
    );
    const delta = Object.fromEntries(
      commonMetrics.map((metric) => [
        metric,
        candidate[metric] - baseline[metric],
      ]),
    );
    if (Object.values(delta).some((value) => value > 0)) {
      fixedScenarios.push(scenarioId);
    }
    if (
      Object.entries(delta).some(
        ([metric, value]) => value < -(input.regressionBudget[metric] ?? 0),
      ) ||
      candidateRuns.some((run) => run.status === "failed")
    ) {
      regressedScenarios.push(scenarioId);
    }
    return [
      {
        scenarioId,
        baseline,
        candidate,
        delta,
        sampleSize: {
          baseline: baselineSuccess.length,
          candidate: candidateSuccess.length,
        },
      },
    ];
  });

  const fixed = unique(fixedScenarios);
  const regressed = unique(regressedScenarios);
  if (hardInvariantFailures.length > 0) {
    warnings.push("A protected hard invariant failed.");
    return {
      interfaceVersion: "harness-evaluation.v1",
      status: "rejected",
      recommendedAction: "rollback",
      fixedScenarios: fixed,
      regressedScenarios: regressed,
      hardInvariantFailures,
      comparisons,
      warnings: unique(warnings),
    };
  }
  if (insufficientSamples) {
    return {
      interfaceVersion: "harness-evaluation.v1",
      status: "inconclusive",
      recommendedAction: "collect_more_data",
      fixedScenarios: fixed,
      regressedScenarios: regressed,
      hardInvariantFailures,
      comparisons,
      warnings: unique(warnings),
    };
  }
  if (regressed.length > 0) {
    return {
      interfaceVersion: "harness-evaluation.v1",
      status: "rejected",
      recommendedAction: "rollback",
      fixedScenarios: fixed,
      regressedScenarios: regressed,
      hardInvariantFailures,
      comparisons,
      warnings: unique(warnings),
    };
  }
  return {
    interfaceVersion: "harness-evaluation.v1",
    status: "passed",
    recommendedAction: "keep",
    fixedScenarios: fixed,
    regressedScenarios: regressed,
    hardInvariantFailures,
    comparisons,
    warnings: unique(warnings),
  };
}
