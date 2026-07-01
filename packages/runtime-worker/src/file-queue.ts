import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { RuntimeWorkerJob, RuntimeWorkerJobResult } from "./jobs";

export interface QueuedRuntimeWorkerJob {
  id: string;
  enqueuedAt: string;
  attempts: number;
  job: RuntimeWorkerJob;
}

export interface ClaimedRuntimeWorkerJob extends QueuedRuntimeWorkerJob {
  path: string;
}

export interface FileRuntimeWorkerQueueOptions {
  rootDir: string;
}

export class FileRuntimeWorkerQueue {
  private readonly rootDir: string;
  private readonly pendingDir: string;
  private readonly runningDir: string;
  private readonly completedDir: string;
  private readonly failedDir: string;

  constructor(options: FileRuntimeWorkerQueueOptions) {
    this.rootDir = options.rootDir;
    this.pendingDir = join(this.rootDir, "pending");
    this.runningDir = join(this.rootDir, "running");
    this.completedDir = join(this.rootDir, "completed");
    this.failedDir = join(this.rootDir, "failed");
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.pendingDir, { recursive: true }),
      mkdir(this.runningDir, { recursive: true }),
      mkdir(this.completedDir, { recursive: true }),
      mkdir(this.failedDir, { recursive: true }),
    ]);
  }

  async enqueue(job: RuntimeWorkerJob): Promise<QueuedRuntimeWorkerJob> {
    await this.initialize();
    const item: QueuedRuntimeWorkerJob = {
      id: randomUUID(),
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      job,
    };
    await writeFile(
      join(this.pendingDir, `${item.id}.json`),
      JSON.stringify(item, null, 2),
      "utf-8",
    );
    return item;
  }

  async claimNext(): Promise<ClaimedRuntimeWorkerJob | null> {
    await this.initialize();
    const entries = (await readdir(this.pendingDir))
      .filter((name) => name.endsWith(".json"))
      .sort();

    for (const entry of entries) {
      const pendingPath = join(this.pendingDir, entry);
      const runningPath = join(this.runningDir, entry);
      try {
        await rename(pendingPath, runningPath);
      } catch {
        continue;
      }

      const item = JSON.parse(
        await readFile(runningPath, "utf-8"),
      ) as QueuedRuntimeWorkerJob;
      return {
        ...item,
        attempts: item.attempts + 1,
        path: runningPath,
      };
    }

    return null;
  }

  async complete(
    item: ClaimedRuntimeWorkerJob,
    result: RuntimeWorkerJobResult,
  ): Promise<void> {
    await this.finish(item, result, this.completedDir);
  }

  async fail(
    item: ClaimedRuntimeWorkerJob,
    result: RuntimeWorkerJobResult,
  ): Promise<void> {
    await this.finish(item, result, this.failedDir);
  }

  private async finish(
    item: ClaimedRuntimeWorkerJob,
    result: RuntimeWorkerJobResult,
    targetDir: string,
  ): Promise<void> {
    const outputPath = join(targetDir, `${item.id}.json`);
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          ...item,
          completedAt: new Date().toISOString(),
          result,
        },
        null,
        2,
      ),
      "utf-8",
    );
    await rename(item.path, join(targetDir, `${item.id}.claimed.json`)).catch(
      async () => {
        await writeFile(
          join(targetDir, `${item.id}.claimed.json`),
          JSON.stringify(item, null, 2),
          "utf-8",
        );
      },
    );
  }
}
