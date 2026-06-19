import type { Loop, LoopRun, LoopState } from "@/lib/db/schema";
import { getLoop, getLoopState, listLoopRuns, listLoops } from "./service";

export type LoopDashboardStatus =
  | "active"
  | "paused"
  | "blocked"
  | "needs_approval"
  | "error"
  | "archived";

export interface LoopRunDashboardSummary {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  outputSummary: string | null;
  error: string | null;
  verificationPassed: boolean | null;
  checkerAction: string | null;
  checkerType: string | null;
  requiresApproval: boolean;
  denied: boolean;
  actionGuardMode: string | null;
  actionGuardBlocked: boolean;
  modelCheckerEnabled: boolean;
  modelCheckerReason: string | null;
}

export interface LoopDashboardSummary {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  status: string;
  dashboardStatus: LoopDashboardStatus;
  triggerConfig: Record<string, unknown>;
  currentPhase: string | null;
  nextAction: string | null;
  blockedReason: string | null;
  lastObservation: string | null;
  stateJson: Record<string, unknown>;
  nextScheduledRunAt: string | null;
  lastScheduledRunAt: string | null;
  schedulerStatus: string | null;
  latestRun: LoopRunDashboardSummary | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface LoopDashboardDetail extends LoopDashboardSummary {
  contextConfig: Record<string, unknown>;
  actionPolicy: Record<string, unknown>;
  verificationConfig: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
  escalationPolicy: Record<string, unknown>;
  runs: LoopRunDashboardSummary[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getNestedRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return asRecord(value[key]);
}

export function summarizeLoopRun(run: LoopRun): LoopRunDashboardSummary {
  const verification = asRecord(run.verificationResult);
  const nestedVerification = getNestedRecord(verification, "verification");
  const decision = getNestedRecord(verification, "decision");
  const checker = getNestedRecord(verification, "checker");
  const approval = getNestedRecord(verification, "approval");
  const actionGuard = getNestedRecord(verification, "actionGuard");
  const modelChecker = getNestedRecord(verification, "modelChecker");

  const verificationPassed =
    typeof verification.passed === "boolean"
      ? verification.passed
      : typeof nestedVerification.passed === "boolean"
        ? nestedVerification.passed
        : null;

  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    outputSummary: run.outputSummary,
    error: run.error,
    verificationPassed,
    checkerAction: typeof decision.action === "string" ? decision.action : null,
    checkerType:
      typeof checker.checkerType === "string" ? checker.checkerType : null,
    requiresApproval: approval.requiresApproval === true,
    denied: approval.denied === true,
    actionGuardMode:
      typeof actionGuard.mode === "string" ? actionGuard.mode : null,
    actionGuardBlocked: actionGuard.blocked === true,
    modelCheckerEnabled: modelChecker.enabled === true,
    modelCheckerReason:
      typeof modelChecker.reason === "string" ? modelChecker.reason : null,
  };
}

export function deriveLoopDashboardStatus(input: {
  loop: Loop;
  state: LoopState | null;
  latestRun: LoopRunDashboardSummary | null;
}): LoopDashboardStatus {
  if (input.loop.status === "archived") return "archived";
  if (input.loop.status === "paused") return "paused";

  const stateJson = asRecord(input.state?.stateJson);
  if (
    input.latestRun?.requiresApproval ||
    stateJson.lastApprovalRequiresApproval === true ||
    input.state?.currentPhase === "approval"
  ) {
    return "needs_approval";
  }

  if (
    input.latestRun?.status === "blocked" ||
    input.latestRun?.actionGuardBlocked ||
    stateJson.lastActionGuardBlocked === true ||
    input.state?.currentPhase === "blocked" ||
    input.state?.currentPhase === "retry_recommended"
  ) {
    return "blocked";
  }

  if (
    input.loop.status === "error" ||
    input.latestRun?.status === "failed" ||
    input.state?.currentPhase === "error"
  ) {
    return "error";
  }

  return "active";
}

export function summarizeLoop(input: {
  loop: Loop;
  state: LoopState | null;
  latestRun: LoopRun | null;
}): LoopDashboardSummary {
  const latestRun = input.latestRun ? summarizeLoopRun(input.latestRun) : null;
  const stateJson = asRecord(input.state?.stateJson);
  return {
    id: input.loop.id,
    name: input.loop.name,
    description: input.loop.description,
    goal: input.loop.goal,
    status: input.loop.status,
    dashboardStatus: deriveLoopDashboardStatus({
      loop: input.loop,
      state: input.state,
      latestRun,
    }),
    triggerConfig: input.loop.triggerConfig,
    currentPhase: input.state?.currentPhase ?? null,
    nextAction: input.state?.nextAction ?? null,
    blockedReason: input.state?.blockedReason ?? null,
    lastObservation: input.state?.lastObservation ?? null,
    stateJson,
    nextScheduledRunAt:
      typeof stateJson.nextScheduledRunAt === "string"
        ? stateJson.nextScheduledRunAt
        : null,
    lastScheduledRunAt:
      typeof stateJson.lastScheduledRunAt === "string"
        ? stateJson.lastScheduledRunAt
        : null,
    schedulerStatus:
      typeof stateJson.schedulerStatus === "string"
        ? stateJson.schedulerStatus
        : null,
    latestRun,
    updatedAt: input.loop.updatedAt,
    createdAt: input.loop.createdAt,
  };
}

export async function listLoopDashboard(userId: string): Promise<{
  loops: LoopDashboardSummary[];
  counts: Record<LoopDashboardStatus, number>;
}> {
  const loops = await listLoops(userId, { limit: 200 });
  const summaries = await Promise.all(
    loops.map(async (loop) => {
      const [state, runs] = await Promise.all([
        getLoopState(loop.id),
        listLoopRuns(loop.id, { limit: 1 }),
      ]);
      return summarizeLoop({
        loop,
        state,
        latestRun: runs[0] ?? null,
      });
    }),
  );

  const counts: Record<LoopDashboardStatus, number> = {
    active: 0,
    paused: 0,
    blocked: 0,
    needs_approval: 0,
    error: 0,
    archived: 0,
  };

  for (const summary of summaries) {
    counts[summary.dashboardStatus] += 1;
  }

  return { loops: summaries, counts };
}

export async function getLoopDashboardDetail(
  userId: string,
  loopId: string,
): Promise<LoopDashboardDetail | null> {
  const loop = await getLoop(userId, loopId);
  if (!loop) return null;

  const [state, runs] = await Promise.all([
    getLoopState(loop.id),
    listLoopRuns(loop.id, { limit: 25 }),
  ]);

  return {
    ...summarizeLoop({
      loop,
      state,
      latestRun: runs[0] ?? null,
    }),
    contextConfig: loop.contextConfig,
    actionPolicy: loop.actionPolicy,
    verificationConfig: loop.verificationConfig,
    approvalPolicy: loop.approvalPolicy,
    retryPolicy: loop.retryPolicy,
    escalationPolicy: loop.escalationPolicy,
    runs: runs.map((run) => summarizeLoopRun(run)),
  };
}
