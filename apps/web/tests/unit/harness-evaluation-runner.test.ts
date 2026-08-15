import { describe, expect, it } from "vitest";
import {
  CORE_HARNESS_EVALUATION_SUITES,
  runHarnessEvaluation,
} from "@/lib/harness-evolution";
import type { HarnessEvaluationExecutionRequest } from "@/lib/harness-evolution";

describe("Harness evaluation suites and runner", () => {
  it("ships role suites for memory, watchlist, trading, and global boundaries", () => {
    const roles = CORE_HARNESS_EVALUATION_SUITES.map((suite) => suite.workRole);
    expect(roles).toEqual(
      expect.arrayContaining([
        "memory_recall_steward",
        "watchlist_selector",
        "paper_trader",
        "*",
      ]),
    );
    for (const suite of CORE_HARNESS_EVALUATION_SUITES) {
      expect(suite.scenarios.length).toBeGreaterThan(0);
      expect(
        suite.scenarios.every((scenario) => scenario.repetitions > 0),
      ).toBe(true);
    }
  });

  it("runs matched cohorts under an isolated runtime contract", async () => {
    const scenario = CORE_HARNESS_EVALUATION_SUITES.find(
      (suite) => suite.workRole === "memory_recall_steward",
    )!.scenarios[0];
    const seen: HarnessEvaluationExecutionRequest[] = [];
    const result = await runHarnessEvaluation({
      runtimeContract: {
        baseline: { model: "model-1", timeoutMs: 60_000 },
        candidate: { timeoutMs: 60_000, model: "model-1" },
      },
      scenarios: [{ ...scenario, repetitions: 2 }],
      minimumSampleSize: 2,
      regressionBudget: { taskScore: 0.05 },
      execute: async (request) => {
        seen.push(request);
        return {
          status: "success",
          metrics: {
            taskScore: request.cohort === "candidate" ? 0.9 : 0.6,
          },
          actions: ["memory_read"],
        };
      },
    });

    expect(seen).toHaveLength(4);
    expect(
      seen.every(
        (request) =>
          request.allowExternalActions === false &&
          request.allowRealFunds === false,
      ),
    ).toBe(true);
    expect(result.status).toBe("passed");
  });

  it("turns a forbidden candidate action into a hard-invariant rejection", async () => {
    const scenario = {
      ...CORE_HARNESS_EVALUATION_SUITES.find((suite) => suite.workRole === "*")!
        .scenarios[0],
      repetitions: 1,
    };
    const result = await runHarnessEvaluation({
      runtimeContract: {
        baseline: { model: "model-1" },
        candidate: { model: "model-1" },
      },
      scenarios: [scenario],
      minimumSampleSize: 1,
      regressionBudget: {},
      execute: async (request) => ({
        status: "success",
        metrics: { taskScore: request.cohort === "candidate" ? 1 : 0.5 },
        actions: request.cohort === "candidate" ? ["external_send"] : ["read"],
      }),
    });

    expect(result.status).toBe("rejected");
    expect(result.recommendedAction).toBe("rollback");
    expect(result.hardInvariantFailures[0]?.failures).toContain(
      "forbidden_action:external_send",
    );
  });
});
