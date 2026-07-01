import {
  FileRuntimeWorkerQueue,
  type ClaimedRuntimeWorkerJob,
} from "./file-queue";
import {
  runRuntimeWorkerJob,
  type RuntimeWorkerHandlers,
  type RuntimeWorkerJobResult,
} from "./jobs";

export interface RuntimeWorkerLoopOptions {
  queue: FileRuntimeWorkerQueue;
  handlers: RuntimeWorkerHandlers;
  pollIntervalMs?: number;
  maxIdlePolls?: number;
  onResult?: (
    item: ClaimedRuntimeWorkerJob,
    result: RuntimeWorkerJobResult,
  ) => void | Promise<void>;
}

export async function runRuntimeWorkerLoop(
  options: RuntimeWorkerLoopOptions,
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  let idlePolls = 0;

  await options.queue.initialize();

  for (;;) {
    const item = await options.queue.claimNext();
    if (!item) {
      idlePolls += 1;
      if (
        options.maxIdlePolls !== undefined &&
        idlePolls >= options.maxIdlePolls
      ) {
        return;
      }
      await sleep(pollIntervalMs);
      continue;
    }

    idlePolls = 0;
    const result = await runRuntimeWorkerJob(options.handlers, item.job);
    if (result.ok) {
      await options.queue.complete(item, result);
    } else {
      await options.queue.fail(item, result);
    }
    await options.onResult?.(item, result);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
