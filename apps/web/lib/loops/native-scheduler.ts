import type { Loop, LoopState } from "@/lib/db/schema";
import type { JobExecutionResult } from "@/lib/cron/types";
import {
  getEffectiveNextLoopRun,
  isLoopDue,
  isNativeScheduledTrigger,
  reserveNextLoopRun,
  type LoopSchedulerStateJson,
} from "./schedule";
import { getLoopState, listLoops, upsertLoopState } from "./service";
import { runNativeLoopOnce } from "./runtime";

const runningNativeLoops = new Set<string>();

export type NativeLoopSchedulerExecutionMode = "agent" | "dry_run";

function asSchedulerStateJson(state: LoopState | null): LoopSchedulerStateJson {
  return state?.stateJson && typeof state.stateJson === "object"
    ? (state.stateJson as LoopSchedulerStateJson)
    : {};
}

function loopBaseline(loop: Loop, state: LoopState | null): Date {
  return state?.updatedAt ?? loop.updatedAt ?? loop.createdAt ?? new Date();
}

export async function listDueNativeLoops(input: {
  userId: string;
  now?: Date;
}): Promise<Array<{ loop: Loop; state: LoopState | null; nextRunAt: Date }>> {
  const now = input.now ?? new Date();
  const loops = await listLoops(input.userId, { status: "active", limit: 500 });
  const due: Array<{ loop: Loop; state: LoopState | null; nextRunAt: Date }> =
    [];

  for (const loop of loops) {
    if (!isNativeScheduledTrigger(loop.triggerConfig)) continue;
    if (loop.triggerConfig.type === "scheduled_job") continue;
    if (runningNativeLoops.has(loop.id)) continue;

    const state = await getLoopState(loop.id);
    const stateJson = asSchedulerStateJson(state);
    const baseline = loopBaseline(loop, state);
    const nextRunAt = getEffectiveNextLoopRun({
      triggerConfig: loop.triggerConfig,
      stateJson,
      baseline,
    });

    if (
      nextRunAt &&
      isLoopDue({
        triggerConfig: loop.triggerConfig,
        stateJson,
        baseline,
        now,
      })
    ) {
      due.push({ loop, state, nextRunAt });
    } else if (nextRunAt && !stateJson.nextScheduledRunAt) {
      await upsertLoopState(loop.id, {
        stateJson: {
          ...stateJson,
          nextScheduledRunAt: nextRunAt.toISOString(),
          schedulerStatus: stateJson.schedulerStatus ?? "idle",
        },
      });
    }
  }

  return due;
}

async function markNativeLoopSchedulerError(input: {
  loop: Loop;
  state: LoopState | null;
  error: unknown;
}) {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  const latestState = await getLoopState(input.loop.id);
  await upsertLoopState(input.loop.id, {
    currentPhase: "error",
    lastObservation: `Native scheduled loop "${input.loop.name}" failed`,
    nextAction: "Review failed scheduled loop run",
    blockedReason: message,
    stateJson: {
      ...asSchedulerStateJson(input.state),
      ...asSchedulerStateJson(latestState),
      schedulerStatus: "idle",
      schedulerError: message,
    },
  });
}

async function markNativeLoopSchedulerComplete(loop: Loop) {
  const state = await getLoopState(loop.id);
  const stateJson = asSchedulerStateJson(state);
  await upsertLoopState(loop.id, {
    stateJson: {
      ...stateJson,
      schedulerStatus:
        stateJson.schedulerStatus === "completed_once"
          ? "completed_once"
          : "idle",
      schedulerError: undefined,
    },
  });
}

export async function runDueNativeLoops(input: {
  userId?: string;
  now?: Date;
  executionMode?: NativeLoopSchedulerExecutionMode;
  awaitCompletion?: boolean;
}): Promise<{ launched: number; skipped: number }> {
  if (!input.userId) {
    return { launched: 0, skipped: 0 };
  }

  const now = input.now ?? new Date();
  const executionMode = input.executionMode ?? "agent";
  const dueLoops = await listDueNativeLoops({ userId: input.userId, now });
  let launched = 0;
  let skipped = 0;

  for (const { loop, state } of dueLoops) {
    if (runningNativeLoops.has(loop.id)) {
      skipped += 1;
      continue;
    }

    runningNativeLoops.add(loop.id);
    const reservedStateJson = reserveNextLoopRun({
      triggerConfig: loop.triggerConfig,
      stateJson: asSchedulerStateJson(state),
      now,
    });

    try {
      await upsertLoopState(loop.id, {
        stateJson: {
          ...reservedStateJson,
          schedulerStatus:
            reservedStateJson.schedulerStatus === "completed_once"
              ? "completed_once"
              : "running",
        },
      });
      launched += 1;

      const runPromise: Promise<JobExecutionResult> = runNativeLoopOnce({
        userId: input.userId,
        loopId: loop.id,
        triggeredBy: "scheduler",
        reason: {
          type: "native_scheduler",
          scheduledAt: now.toISOString(),
        },
        execute:
          executionMode === "dry_run"
            ? undefined
            : async ({ previousState, loopRun }) => {
                const { executeNativeLoopAgent } = await import(
                  "./native-executor"
                );
                return executeNativeLoopAgent({
                  userId: input.userId!,
                  loop,
                  previousState,
                  runId: loopRun.id,
                });
              },
      });

      const trackedRun = runPromise
        .then(async (result) => {
          await markNativeLoopSchedulerComplete(loop);
          return result;
        })
        .catch(async (error) => {
          await markNativeLoopSchedulerError({
            loop,
            state,
            error,
          });
          return null;
        })
        .finally(() => {
          runningNativeLoops.delete(loop.id);
        });

      if (input.awaitCompletion) {
        await trackedRun;
      } else {
        trackedRun.catch(() => undefined);
      }
    } catch (error) {
      runningNativeLoops.delete(loop.id);
      skipped += 1;
      await markNativeLoopSchedulerError({ loop, state, error });
    }
  }

  return { launched, skipped };
}

export function getNativeLoopSchedulerStatus() {
  return {
    runningLoopIds: [...runningNativeLoops],
  };
}
