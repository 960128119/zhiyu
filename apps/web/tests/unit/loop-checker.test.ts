import { describe, expect, it } from "vitest";
import {
  buildCheckerVerificationPayload,
  decideLoopOutcome,
  runDeterministicChecker,
  runLoopChecker,
  type LoopVerificationResult,
} from "@/lib/loops";

const passingVerification: LoopVerificationResult = {
  type: "structured_check",
  passed: true,
  issues: [],
  evidence: {
    status: "success",
    observedFields: ["summary"],
    observedSources: ["memory"],
    artifactCount: 0,
    hasOutput: true,
    hasStructuredReport: true,
  },
  checkedAt: "2026-06-16T00:00:00.000Z",
};

const failingVerification: LoopVerificationResult = {
  ...passingVerification,
  passed: false,
  issues: [
    {
      code: "missing_required_field",
      message: 'Required field "riskLevel" was not observed',
      severity: "error",
    },
  ],
};

describe("loop checker", () => {
  it("completes when deterministic verification passes", () => {
    const checker = runDeterministicChecker(passingVerification);
    const decision = decideLoopOutcome({
      checker,
      retryPolicy: { maxAttempts: 2, onFailure: "summarize_and_block" },
      attemptsUsed: 1,
    });

    expect(checker.passed).toBe(true);
    expect(decision).toMatchObject({
      action: "complete",
      runStatus: "success",
      statePhase: "idle",
      attemptsRemaining: 1,
    });
  });

  it("recommends retry when verification fails and attempts remain", () => {
    const checker = runDeterministicChecker(failingVerification);
    const decision = decideLoopOutcome({
      checker,
      retryPolicy: { maxAttempts: 2, onFailure: "summarize_and_block" },
      attemptsUsed: 1,
    });

    expect(checker.retryRecommended).toBe(true);
    expect(decision).toMatchObject({
      action: "retry",
      runStatus: "blocked",
      statePhase: "retry_recommended",
      attemptsRemaining: 1,
    });
  });

  it("blocks when retries are exhausted with summarize_and_block", () => {
    const checker = runDeterministicChecker(failingVerification);
    const decision = decideLoopOutcome({
      checker,
      retryPolicy: { maxAttempts: 1, onFailure: "summarize_and_block" },
      attemptsUsed: 1,
    });

    expect(decision).toMatchObject({
      action: "block",
      runStatus: "blocked",
      statePhase: "blocked",
      attemptsRemaining: 0,
    });
  });

  it("asks for approval when policy says ask_human", () => {
    const checker = runDeterministicChecker(failingVerification);
    const decision = decideLoopOutcome({
      checker,
      retryPolicy: { maxAttempts: 1, onFailure: "ask_human" },
      attemptsUsed: 1,
    });

    expect(decision).toMatchObject({
      action: "needs_approval",
      runStatus: "needs_approval",
      statePhase: "approval",
    });
  });

  it("builds a durable verification payload", () => {
    const checker = runDeterministicChecker(passingVerification);
    const decision = decideLoopOutcome({
      checker,
      retryPolicy: { maxAttempts: 1, onFailure: "mark_failed" },
      attemptsUsed: 1,
    });

    expect(
      buildCheckerVerificationPayload({
        verification: passingVerification,
        checker,
        decision,
      }),
    ).toMatchObject({
      passed: true,
      verification: { passed: true },
      checker: { checkerType: "deterministic" },
      decision: { action: "complete" },
    });
  });

  it("uses deterministic checker when no model checker is configured", async () => {
    const checker = await runLoopChecker({
      verification: passingVerification,
    });

    expect(checker).toMatchObject({
      checkerType: "deterministic",
      passed: true,
    });
  });

  it("combines deterministic and model checker feedback", async () => {
    const checker = await runLoopChecker({
      verification: passingVerification,
      modelChecker: {
        check: async () => ({
          passed: false,
          feedback: "Model checker found an ambiguous source.",
          requiresHumanApproval: true,
          modelFeedback: {
            confidence: 0.4,
          },
        }),
      },
    });
    const decision = decideLoopOutcome({
      checker,
      retryPolicy: { maxAttempts: 1, onFailure: "summarize_and_block" },
    });

    expect(checker).toMatchObject({
      checkerType: "hybrid",
      passed: false,
      requiresHumanApproval: true,
      modelFeedback: {
        confidence: 0.4,
      },
    });
    expect(decision).toMatchObject({
      action: "needs_approval",
      runStatus: "needs_approval",
    });
  });
});
