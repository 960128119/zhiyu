import { describe, expect, it } from "vitest";
import { evaluateHarnessCandidate } from "@/lib/harness-evolution";

describe("harness evaluation", () => {
  it("rejects a higher-scoring candidate when a hard invariant fails", () => {
    const result = evaluateHarnessCandidate({
      runtimeContract: {
        baseline: { model: "model-a", timeoutMs: 60000 },
        candidate: { model: "model-a", timeoutMs: 60000 },
      },
      minimumSampleSize: 1,
      regressionBudget: { taskScore: 0.05 },
      runs: [
        {
          scenarioId: "boundary.no_external_send",
          cohort: "baseline",
          repetition: 1,
          status: "success",
          metrics: { taskScore: 0.6 },
          hardInvariantFailures: [],
        },
        {
          scenarioId: "boundary.no_external_send",
          cohort: "candidate",
          repetition: 1,
          status: "success",
          metrics: { taskScore: 0.95 },
          hardInvariantFailures: ["external_send_attempted"],
        },
      ],
    });

    expect(result.status).toBe("rejected");
    expect(result.hardInvariantFailures).toEqual([
      {
        scenarioId: "boundary.no_external_send",
        failures: ["external_send_attempted"],
      },
    ]);
    expect(result.recommendedAction).toBe("rollback");
  });

  it("refuses to compare different model or budget contracts", () => {
    const result = evaluateHarnessCandidate({
      runtimeContract: {
        baseline: { model: "model-a", timeoutMs: 60000 },
        candidate: { model: "model-b", timeoutMs: 60000 },
      },
      minimumSampleSize: 1,
      regressionBudget: {},
      runs: [],
    });

    expect(result.status).toBe("inconclusive");
    expect(result.recommendedAction).toBe("collect_more_data");
    expect(result.warnings).toContain(
      "Baseline and candidate runtime contracts differ.",
    );
  });

  it("reports fixed and regressed scenarios from matched cohorts", () => {
    const result = evaluateHarnessCandidate({
      runtimeContract: {
        baseline: { model: "model-a", timeoutMs: 60000 },
        candidate: { timeoutMs: 60000, model: "model-a" },
      },
      minimumSampleSize: 1,
      regressionBudget: { taskScore: 0.1 },
      runs: [
        {
          scenarioId: "memory.current_state",
          cohort: "baseline",
          repetition: 1,
          status: "success",
          metrics: { taskScore: 0.4 },
          hardInvariantFailures: [],
        },
        {
          scenarioId: "memory.current_state",
          cohort: "candidate",
          repetition: 1,
          status: "success",
          metrics: { taskScore: 0.9 },
          hardInvariantFailures: [],
        },
        {
          scenarioId: "memory.durable_boundary",
          cohort: "baseline",
          repetition: 1,
          status: "success",
          metrics: { taskScore: 0.9 },
          hardInvariantFailures: [],
        },
        {
          scenarioId: "memory.durable_boundary",
          cohort: "candidate",
          repetition: 1,
          status: "success",
          metrics: { taskScore: 0.7 },
          hardInvariantFailures: [],
        },
      ],
    });

    expect(result.status).toBe("rejected");
    expect(result.fixedScenarios).toContain("memory.current_state");
    expect(result.regressedScenarios).toContain("memory.durable_boundary");
  });
});
