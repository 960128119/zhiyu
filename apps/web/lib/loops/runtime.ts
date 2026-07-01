import {
  completeLoopRun,
  createLoopApprovalRequest,
  createLoop,
  createLoopRun,
  getLoop,
  getLoopState,
  listLoops,
  upsertLoopState,
} from "./service";
import type {
  LoopJson,
  LoopRunStatus,
  RunNativeLoopInput,
  RunLoopTriggerContext,
  RunScheduledJobLoopInput,
} from "./types";
import type { JobExecutionResult } from "@/lib/cron/types";
import type { Loop, LoopRun, LoopState, ScheduledJob } from "@/lib/db/schema";
import { getUserLlmProviderConfig } from "@/lib/ai/user-llm-api-settings";
import { verifyLoopRun } from "./verifier";
import {
  buildCheckerVerificationPayload,
  decideLoopOutcome,
  type LoopCheckerResult,
  type LoopOutcomeDecision,
  runLoopChecker,
  type LoopModelChecker,
} from "./checker";
import {
  evaluateLoopApprovals,
  extractActionNamesFromJobResult,
} from "./approval";
import {
  evaluateLoopActionGuard,
  type LoopActionGuardMode,
} from "./action-guard";
import {
  createRuntimeLoopModelChecker,
  resolveLoopModelChecker,
} from "./model-checker";
import type { LoopToolGateEvaluation } from "./tool-gate";
import type { LoopApprovalEvaluation } from "./approval";
import type { LoopActionGuardResult } from "./action-guard";
import type { LoopVerificationResult } from "./verifier";
import { loopRetryPolicySchema } from "./spec";

type RunNativeLoopRuntimeInput = RunNativeLoopInput & {
  modelChecker?: LoopModelChecker | null;
};

type RunScheduledJobLoopRuntimeInput = RunScheduledJobLoopInput & {
  modelChecker?: LoopModelChecker | null;
};

type LoopExecutionEvaluation = {
  loopStatus: Exclude<LoopRunStatus, "running">;
  verification: LoopVerificationResult;
  checker: LoopCheckerResult;
  decision: LoopOutcomeDecision;
  approval: LoopApprovalEvaluation;
  actionGuard: LoopActionGuardResult;
  toolGate?: LoopToolGateEvaluation;
  executionTrace?: LoopJson;
  modelCheckerMetadata: LoopJson;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractToolGateResult(
  result: JobExecutionResult,
): LoopToolGateEvaluation | undefined {
  const toolGate = asRecord(asRecord(result.result).toolGate);
  return Array.isArray(toolGate.decisions)
    ? (toolGate as unknown as LoopToolGateEvaluation)
    : undefined;
}

function extractExecutionTrace(
  result: JobExecutionResult,
): LoopJson | undefined {
  const executionTrace = asRecord(asRecord(result.result).executionTrace);
  return Array.isArray(executionTrace.events) ? executionTrace : undefined;
}

function scheduledJobTriggerConfig(jobId: string): LoopJson {
  return {
    type: "scheduled_job",
    scheduledJobId: jobId,
  };
}

function scheduledJobGoal(job: ScheduledJob): string {
  const description =
    typeof job.description === "string" ? job.description : "";
  if (description.trim()) {
    return description.trim();
  }
  return `Run scheduled job: ${job.name}`;
}

function mapJobResultToLoopStatus(
  result: JobExecutionResult,
): Exclude<LoopRunStatus, "running"> {
  return result.status === "success" ? "success" : "failed";
}

function resultSummary(result: JobExecutionResult): string | null {
  if (result.output?.trim()) {
    return result.output.trim();
  }
  if (result.error?.trim()) {
    return result.error.trim();
  }
  return result.status;
}

function compactStateSnapshot(state: Awaited<ReturnType<typeof getLoopState>>) {
  if (!state) return null;
  return {
    currentPhase: state.currentPhase,
    nextAction: state.nextAction,
    blockedReason: state.blockedReason,
    updatedAt: state.updatedAt,
  };
}

function maxAttemptsForLoop(loop: Loop): number {
  const retryPolicy = loopRetryPolicySchema.parse(loop.retryPolicy ?? {});
  return Math.max(1, retryPolicy.maxAttempts);
}

function buildRetryAttemptState(input: {
  previousState: LoopState | null;
  loopId: string;
  feedback: string;
  attemptNumber: number;
  maxAttempts: number;
  result: JobExecutionResult;
}): LoopState | null {
  const retryFeedback = {
    attemptNumber: input.attemptNumber,
    maxAttempts: input.maxAttempts,
    feedback: input.feedback,
    previousStatus: input.result.status,
    previousOutput: resultSummary(input.result),
    createdAt: new Date().toISOString(),
  };

  if (!input.previousState) {
    return {
      loopId: input.loopId,
      currentPhase: "retry_recommended",
      memorySummary: null,
      openQuestions: [],
      lastObservation: "Previous loop attempt needs retry",
      nextAction: "Retry maker execution with checker feedback",
      blockedReason: input.feedback,
      stateJson: {
        retryFeedback,
      },
      updatedAt: new Date(),
    } as LoopState;
  }

  return {
    ...input.previousState,
    currentPhase: "retry_recommended",
    lastObservation: "Previous loop attempt needs retry",
    nextAction: "Retry maker execution with checker feedback",
    blockedReason: input.feedback,
    stateJson: {
      ...(input.previousState.stateJson ?? {}),
      retryFeedback,
    },
  };
}

async function buildRuntimeModelChecker(input: {
  loop: Loop;
  candidate?: LoopModelChecker | null;
}): Promise<LoopModelChecker | null> {
  const userOpenAiConfig = await getUserLlmProviderConfig({
    userId: input.loop.userId,
    providerType: "openai_compatible",
  });

  return createRuntimeLoopModelChecker({
    verificationConfig: input.loop.verificationConfig,
    candidate: input.candidate,
    userProviderConfig: userOpenAiConfig,
    envProviderConfig: {
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL,
    },
  });
}

async function evaluateLoopExecution(input: {
  loop: Loop;
  result: JobExecutionResult;
  actionGuardMode?: LoopActionGuardMode;
  modelChecker?: LoopModelChecker | null;
  attemptsUsed?: number;
}): Promise<LoopExecutionEvaluation> {
  const loopStatus = mapJobResultToLoopStatus(input.result);
  const verification = verifyLoopRun({
    verificationConfig: input.loop.verificationConfig,
    result: input.result,
  });
  const runtimeModelChecker = await buildRuntimeModelChecker({
    loop: input.loop,
    candidate: input.modelChecker,
  });
  const modelCheckerResolution = resolveLoopModelChecker({
    verificationConfig: input.loop.verificationConfig,
    candidate: runtimeModelChecker,
  });
  const checker = await runLoopChecker({
    verification,
    modelChecker: modelCheckerResolution.modelChecker,
  });
  const decision = decideLoopOutcome({
    checker,
    retryPolicy: input.loop.retryPolicy,
    attemptsUsed: input.attemptsUsed,
  });
  const actionNames = extractActionNamesFromJobResult(input.result);
  const approval = evaluateLoopApprovals({
    actionNames,
    actionPolicy: input.loop.actionPolicy,
    approvalPolicy: input.loop.approvalPolicy,
  });
  const actionGuard = evaluateLoopActionGuard({
    actionNames,
    actionPolicy: input.loop.actionPolicy,
    approvalPolicy: input.loop.approvalPolicy,
    mode: input.actionGuardMode ?? "advisory",
  });

  return {
    loopStatus,
    verification,
    checker,
    decision,
    approval,
    actionGuard,
    toolGate: extractToolGateResult(input.result),
    executionTrace: extractExecutionTrace(input.result),
    modelCheckerMetadata: {
      enabled: modelCheckerResolution.enabled,
      reason: modelCheckerResolution.reason,
      maxInputChars: modelCheckerResolution.maxInputChars,
    },
  };
}

function buildNativeDryRunResult(loop: Loop): JobExecutionResult {
  return {
    status: "success",
    output: `Dry run prepared native loop "${loop.name}".`,
    duration: 0,
    result: {
      executionMode: "dry_run",
      structuredReport: {
        summary: `Native loop "${loop.name}" is ready to execute.`,
        subtitle: "Dry run only; no external actions were performed.",
        outcome:
          "Loop configuration, verification, checker, and approval policies were evaluated without running an agent.",
        reasoningChain: [
          {
            stepType: "input",
            summary: "Loaded loop goal",
            description: loop.goal,
            sourceType: "system",
            sourceLabel: "Loop spec",
          },
          {
            stepType: "verify",
            summary: "Checked native loop execution path",
            description:
              "Manual native loop trigger created a durable run and completed the verification pipeline.",
            sourceType: "system",
            sourceLabel: "Loop runtime",
          },
        ],
        suggestedActions: [],
      },
    },
  };
}

async function completeLoopExecution(input: {
  loop: Loop;
  loopRun: LoopRun;
  previousState: LoopState | null;
  result: JobExecutionResult;
  successObservation: string;
  followUpObservation: string;
  stateJson?: LoopJson;
  actionGuardMode?: LoopActionGuardMode;
  modelChecker?: LoopModelChecker | null;
  attemptsUsed?: number;
  evaluation?: LoopExecutionEvaluation;
}): Promise<void> {
  const evaluation =
    input.evaluation ??
    (await evaluateLoopExecution({
      loop: input.loop,
      result: input.result,
      actionGuardMode: input.actionGuardMode,
      modelChecker: input.modelChecker,
      attemptsUsed: input.attemptsUsed,
    }));
  const {
    loopStatus,
    verification,
    checker,
    decision,
    approval,
    actionGuard,
    toolGate,
    executionTrace,
    modelCheckerMetadata,
  } = evaluation;

  await completeLoopRun(input.loopRun.id, {
    status: decision.runStatus,
    outputSummary: resultSummary(input.result),
    verificationResult: buildCheckerVerificationPayload({
      verification,
      checker,
      decision,
      approval,
      actionGuard,
      toolGate,
      executionTrace,
      modelChecker: modelCheckerMetadata,
    }),
    error: input.result.error ?? null,
  });

  if (toolGate?.decisions.length) {
    await Promise.all(
      toolGate.decisions
        .filter((decision) => decision.decision === "require_approval")
        .map((decision) =>
          createLoopApprovalRequest({
            loopId: input.loop.id,
            loopRunId: input.loopRun.id,
            userId: input.loop.userId,
            source: "tool_gate",
            actionName: decision.actionName,
            capability: decision.capability ?? null,
            reason: decision.reason ?? null,
            message: decision.message ?? null,
            toolInput: decision.toolInput ?? null,
            actionPayload: decision.toolUseID
              ? { toolUseID: decision.toolUseID }
              : null,
          }),
        ),
    );
  }

  await upsertLoopState(input.loop.id, {
    currentPhase: loopStatus === "success" ? decision.statePhase : "error",
    lastObservation:
      loopStatus === "success" && decision.action === "complete"
        ? input.successObservation
        : input.followUpObservation,
    nextAction:
      loopStatus === "success" ? decision.nextAction : "Review failed loop run",
    blockedReason:
      loopStatus === "success"
        ? decision.blockedReason
        : input.result.error || decision.blockedReason,
    stateJson: {
      ...(input.previousState?.stateJson ?? {}),
      ...(input.stateJson ?? {}),
      lastLoopRunId: input.loopRun.id,
      lastJobStatus: input.result.status,
      lastVerificationPassed: verification.passed,
      lastCheckerPassed: checker.passed,
      lastOutcomeAction: decision.action,
      lastAttemptsUsed: decision.attemptsUsed,
      attemptsRemaining: decision.attemptsRemaining,
      lastApprovalRequiresApproval: approval.requiresApproval,
      lastApprovalDenied: approval.denied,
      lastActionGuardBlocked: actionGuard.blocked,
      lastActionGuardMode: actionGuard.mode,
    },
  });
}

async function failLoopExecution(input: {
  loop: Loop;
  loopRun: LoopRun;
  previousState: LoopState | null;
  error: unknown;
  observation: string;
  stateJson?: LoopJson;
  modelChecker?: LoopModelChecker | null;
}): Promise<never> {
  const errorMessage =
    input.error instanceof Error ? input.error.message : String(input.error);
  const verification = verifyLoopRun({
    verificationConfig: input.loop.verificationConfig,
    result: {
      status: "error",
      output: "",
      error: errorMessage,
      duration: 0,
    },
  });
  const runtimeModelChecker = await buildRuntimeModelChecker({
    loop: input.loop,
    candidate: input.modelChecker,
  });
  const modelCheckerResolution = resolveLoopModelChecker({
    verificationConfig: input.loop.verificationConfig,
    candidate: runtimeModelChecker,
  });
  const checker = await runLoopChecker({
    verification,
    modelChecker: modelCheckerResolution.modelChecker,
  });
  const decision = decideLoopOutcome({
    checker,
    retryPolicy: input.loop.retryPolicy,
    attemptsUsed: 1,
  });
  const approval = evaluateLoopApprovals({
    actionNames: [],
    actionPolicy: input.loop.actionPolicy,
    approvalPolicy: input.loop.approvalPolicy,
  });

  await completeLoopRun(input.loopRun.id, {
    status: decision.runStatus === "success" ? "failed" : decision.runStatus,
    outputSummary: errorMessage,
    verificationResult: buildCheckerVerificationPayload({
      verification,
      checker,
      decision,
      approval,
      modelChecker: {
        enabled: modelCheckerResolution.enabled,
        reason: modelCheckerResolution.reason,
        maxInputChars: modelCheckerResolution.maxInputChars,
      },
    }),
    error: errorMessage,
  });

  await upsertLoopState(input.loop.id, {
    currentPhase:
      decision.statePhase === "idle" ? "error" : decision.statePhase,
    lastObservation: input.observation,
    nextAction: decision.nextAction ?? "Review failed loop run",
    blockedReason: decision.blockedReason ?? errorMessage,
    stateJson: {
      ...(input.previousState?.stateJson ?? {}),
      ...(input.stateJson ?? {}),
      lastLoopRunId: input.loopRun.id,
      lastJobStatus: "error",
      lastVerificationPassed: verification.passed,
      lastCheckerPassed: checker.passed,
      lastOutcomeAction: decision.action,
      attemptsRemaining: decision.attemptsRemaining,
      lastApprovalRequiresApproval: approval.requiresApproval,
      lastApprovalDenied: approval.denied,
    },
  });

  throw input.error;
}

export async function findLoopForScheduledJob(
  userId: string,
  scheduledJobId: string,
): Promise<Loop | null> {
  const userLoops = await listLoops(userId, { limit: 1000 });
  return (
    userLoops.find(
      (loop) =>
        loop.triggerConfig?.type === "scheduled_job" &&
        loop.triggerConfig?.scheduledJobId === scheduledJobId,
    ) ?? null
  );
}

export async function getOrCreateLoopForScheduledJob(
  job: ScheduledJob,
): Promise<Loop> {
  const existing = await findLoopForScheduledJob(job.userId, job.id);
  if (existing) {
    return existing;
  }

  return createLoop({
    userId: job.userId,
    name: job.name,
    description: job.description ?? null,
    goal: scheduledJobGoal(job),
    status: job.enabled ? "active" : "paused",
    triggerConfig: {
      ...scheduledJobTriggerConfig(job.id),
      scheduleType: job.scheduleType,
      cronExpression: job.cronExpression,
      intervalMinutes: job.intervalMinutes,
      timezone: job.timezone,
    },
    contextConfig: {
      legacySource: "scheduled_jobs",
    },
    actionPolicy: {
      mode: "legacy_scheduled_job",
    },
    verificationConfig: {
      type: "legacy_status",
      successCriteria: ["Scheduled job execution returns success"],
    },
    retryPolicy: {},
    approvalPolicy: {},
    escalationPolicy: {},
    initialState: {
      currentPhase: "idle",
      stateJson: {
        legacyScheduledJobId: job.id,
      },
    },
  });
}

export async function runLoop(
  loopId: string,
  triggerContext: RunLoopTriggerContext,
): Promise<{ loop: Loop; loopRunId: string }> {
  const loop = await getLoop(triggerContext.userId, loopId);
  if (!loop) {
    throw new Error("Loop not found");
  }

  const state = await getLoopState(loopId);
  const loopRun = await createLoopRun({
    loopId,
    triggerReason: {
      triggeredBy: triggerContext.triggeredBy,
      executionId: triggerContext.executionId,
      ...(triggerContext.reason ?? {}),
    },
    inputSnapshot: {
      previousState: compactStateSnapshot(state),
      ...(triggerContext.inputSnapshot ?? {}),
    },
  });

  await upsertLoopState(loopId, {
    currentPhase: "running",
    lastObservation: `Loop triggered by ${triggerContext.triggeredBy}`,
    blockedReason: null,
    stateJson: {
      ...(state?.stateJson ?? {}),
      lastLoopRunId: loopRun.id,
      lastExecutionId: triggerContext.executionId,
    },
  });

  return { loop, loopRunId: loopRun.id };
}

export async function runNativeLoopOnce(
  input: RunNativeLoopRuntimeInput,
): Promise<JobExecutionResult> {
  const loop = await getLoop(input.userId, input.loopId);
  if (!loop) {
    throw new Error("Loop not found");
  }
  if (loop.status !== "active") {
    throw new Error(`Loop is ${loop.status} and cannot be executed`);
  }
  if (loop.triggerConfig?.type === "scheduled_job") {
    throw new Error("Legacy scheduled-job loops must run through scheduler");
  }

  const previousState = await getLoopState(loop.id);
  const loopRun = await createLoopRun({
    loopId: loop.id,
    triggerReason: {
      type: "native_loop",
      triggeredBy: input.triggeredBy,
      ...(input.reason ?? {}),
    },
    inputSnapshot: {
      loopName: loop.name,
      triggerConfig: loop.triggerConfig,
      previousState: compactStateSnapshot(previousState),
    },
  });

  await upsertLoopState(loop.id, {
    currentPhase: "running",
    lastObservation: `Native loop "${loop.name}" started via ${input.triggeredBy}`,
    blockedReason: null,
    stateJson: {
      ...(previousState?.stateJson ?? {}),
      lastLoopRunId: loopRun.id,
      lastExecutionMode: input.execute ? "native" : "dry_run",
    },
  });

  try {
    const maxAttempts = input.execute ? maxAttemptsForLoop(loop) : 1;
    let attemptNumber = 1;
    let attemptState = previousState;
    let retryFeedback: string | null = null;
    let retryPreviousResult: LoopJson | null = null;
    let finalResult: JobExecutionResult | null = null;
    let finalEvaluation: LoopExecutionEvaluation | null = null;

    while (attemptNumber <= maxAttempts) {
      const result: JobExecutionResult = input.execute
        ? await input.execute({
            loop,
            previousState: attemptState,
            loopRun,
            attemptContext: {
              attemptNumber,
              maxAttempts,
              previousFeedback: retryFeedback,
              previousResult: retryPreviousResult,
            },
          })
        : buildNativeDryRunResult(loop);

      const evaluation = await evaluateLoopExecution({
        loop,
        result,
        actionGuardMode: "enforce",
        modelChecker: input.modelChecker,
        attemptsUsed: attemptNumber,
      });

      finalResult = result;
      finalEvaluation = evaluation;

      if (
        input.execute &&
        evaluation.decision.action === "retry" &&
        attemptNumber < maxAttempts
      ) {
        retryFeedback = evaluation.checker.feedback;
        retryPreviousResult = {
          status: result.status,
          outputSummary: resultSummary(result),
          verification: evaluation.verification,
          checker: evaluation.checker,
          decision: evaluation.decision,
        };
        attemptState = buildRetryAttemptState({
          previousState,
          loopId: loop.id,
          feedback: retryFeedback,
          attemptNumber,
          maxAttempts,
          result,
        });
        attemptNumber += 1;
        continue;
      }

      break;
    }

    if (!finalResult || !finalEvaluation) {
      throw new Error("Native loop execution did not produce a result");
    }

    await completeLoopExecution({
      loop,
      loopRun,
      previousState,
      result: finalResult,
      successObservation: `Native loop "${loop.name}" completed successfully`,
      followUpObservation: `Native loop "${loop.name}" needs follow-up`,
      stateJson: {
        lastExecutionMode: input.execute ? "native" : "dry_run",
        lastAutoAttemptCount: finalEvaluation.decision.attemptsUsed,
        lastAutoRetryFeedback: retryFeedback,
      },
      actionGuardMode: "enforce",
      modelChecker: input.modelChecker,
      attemptsUsed: finalEvaluation.decision.attemptsUsed,
      evaluation: finalEvaluation,
    });

    return finalResult;
  } catch (error) {
    console.error("[LoopRuntime] native loop failed before completion", {
      loopId: loop.id,
      loopRunId: loopRun.id,
      userId: input.userId,
      triggeredBy: input.triggeredBy,
      errorName: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return await failLoopExecution({
      loop,
      loopRun,
      previousState,
      error,
      observation: `Native loop "${loop.name}" failed before completion`,
      stateJson: {
        lastExecutionMode: input.execute ? "native" : "dry_run",
      },
      modelChecker: input.modelChecker,
    });
  }
}

export async function runScheduledJobLoop(
  input: RunScheduledJobLoopRuntimeInput,
): Promise<JobExecutionResult> {
  const loop = await getOrCreateLoopForScheduledJob(input.job);
  const previousState = await getLoopState(loop.id);
  const loopRun = await createLoopRun({
    loopId: loop.id,
    triggerReason: {
      type: "scheduled_job",
      scheduledJobId: input.job.id,
      triggeredBy: input.context.triggeredBy,
      executionId: input.context.executionId,
    },
    inputSnapshot: {
      jobId: input.job.id,
      jobName: input.job.name,
      jobType: input.job.jobType,
      scheduleType: input.job.scheduleType,
      previousState: compactStateSnapshot(previousState),
    },
  });

  await upsertLoopState(loop.id, {
    currentPhase: "running",
    lastObservation: `Scheduled job "${input.job.name}" started via ${input.context.triggeredBy}`,
    blockedReason: null,
    stateJson: {
      ...(previousState?.stateJson ?? {}),
      legacyScheduledJobId: input.job.id,
      lastLoopRunId: loopRun.id,
      lastExecutionId: input.context.executionId,
    },
  });

  try {
    const result = await input.execute();

    await completeLoopExecution({
      loop,
      loopRun,
      previousState,
      result,
      successObservation: `Scheduled job "${input.job.name}" completed successfully`,
      followUpObservation: `Scheduled job "${input.job.name}" needs follow-up`,
      stateJson: {
        legacyScheduledJobId: input.job.id,
        lastExecutionId: input.context.executionId,
      },
      actionGuardMode: "advisory",
      modelChecker: input.modelChecker,
    });

    return result;
  } catch (error) {
    return await failLoopExecution({
      loop,
      loopRun,
      previousState,
      error,
      observation: `Scheduled job "${input.job.name}" failed before completion`,
      stateJson: {
        legacyScheduledJobId: input.job.id,
        lastExecutionId: input.context.executionId,
      },
      modelChecker: input.modelChecker,
    });
  }
}
