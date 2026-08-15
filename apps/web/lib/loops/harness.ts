import type { JobExecutionResult } from "@/lib/cron/types";
import type { LoopJson, RunNativeLoopInput } from "./types";
import type { LoopModelChecker } from "./checker";
import { executeNativeLoopAgent } from "./native-executor";
import { runNativeLoopOnce } from "./runtime";

export type LoopRunHarnessMode = "dry_run" | "native_agent";

export interface RunLoopHarnessInput {
  userId: string;
  loopId: string;
  mode: LoopRunHarnessMode;
  triggeredBy: RunNativeLoopInput["triggeredBy"];
  reason?: LoopJson;
  modelChecker?: LoopModelChecker | null;
}

export interface RunLoopHarnessOutput {
  result: JobExecutionResult;
  harness: {
    name: "loop-run-harness";
    mode: LoopRunHarnessMode;
    loopId: string;
    triggeredBy: RunNativeLoopInput["triggeredBy"];
  };
}

export async function runLoopHarness(
  input: RunLoopHarnessInput,
): Promise<RunLoopHarnessOutput> {
  const result = await runNativeLoopOnce({
    userId: input.userId,
    loopId: input.loopId,
    triggeredBy: input.triggeredBy,
    reason: {
      ...(input.reason ?? {}),
      harness: "loop-run-harness",
      harnessMode: input.mode,
    },
    modelChecker: input.modelChecker,
    execute:
      input.mode === "dry_run"
        ? undefined
        : async ({ loop, previousState, loopRun, attemptContext }) => {
            return executeNativeLoopAgent({
              userId: input.userId,
              loop,
              previousState,
              runId: loopRun.id,
              attemptContext,
            });
          },
  });

  return {
    result,
    harness: {
      name: "loop-run-harness",
      mode: input.mode,
      loopId: input.loopId,
      triggeredBy: input.triggeredBy,
    },
  };
}
