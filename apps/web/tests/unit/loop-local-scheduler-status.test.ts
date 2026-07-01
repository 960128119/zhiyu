import { afterEach, describe, expect, it, vi } from "vitest";

const nativeStatus = vi.hoisted(() => ({ runningLoopIds: ["loop-1"] }));
const runDueNativeLoopsMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/cron/service", () => ({
  getDueJobs: vi.fn(async () => []),
  startJobExecution: vi.fn(),
  completeJobExecution: vi.fn(),
  recoverStuckJobs: vi.fn(),
  cleanupStuckJobs: vi.fn(),
}));

vi.mock("@/lib/cron/executor", () => ({
  executeJob: vi.fn(),
}));

vi.mock("@/lib/env/constants", () => ({
  isTauriMode: vi.fn(() => false),
  DEFAULT_AI_MODEL: "test-model",
  AI_PROXY_BASE_URL: "http://localhost.test",
}));

vi.mock("@/lib/auth/token-manager", () => ({
  getCloudAuthToken: vi.fn(() => undefined),
}));

vi.mock("@/lib/db/index", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => []) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  characters: { status: "status", id: "id" },
  jobExecutions: { status: "status", id: "id", jobId: "jobId" },
  scheduledJobs: { id: "id" },
}));

vi.mock("@/lib/loops", () => ({
  runScheduledJobLoop: vi.fn(),
}));

vi.mock("@/lib/loops/native-scheduler", () => ({
  getNativeLoopSchedulerStatus: vi.fn(() => nativeStatus),
  runDueNativeLoops: runDueNativeLoopsMock,
}));

vi.mock("@/lib/cron/insight-maintenance", () => ({
  runInsightEmbeddingDreamIfDue: vi.fn(),
  runInsightMaintenanceIfDue: vi.fn(),
  runRawMessageEmbeddingDreamIfDue: vi.fn(),
}));

import {
  getSchedulerStatus,
  setSchedulerUserId,
  startLocalScheduler,
  stopLocalScheduler,
} from "@/lib/cron/local-scheduler";

describe("local scheduler status", () => {
  afterEach(async () => {
    await stopLocalScheduler();
    setSchedulerUserId(undefined);
    runDueNativeLoopsMock.mockClear();
    delete process.env.ENABLE_LOCAL_SCHEDULER;
  });

  it("includes native loop scheduler visibility", () => {
    expect(getSchedulerStatus()).toMatchObject({
      isRunning: false,
      checkInterval: 60_000,
      nativeLoops: {
        runningLoopIds: ["loop-1"],
      },
    });
  });

  it("starts local web scheduler and checks native loops for the active user", async () => {
    process.env.ENABLE_LOCAL_SCHEDULER = "true";
    setSchedulerUserId("user-1");

    await startLocalScheduler();

    await vi.waitFor(() => {
      expect(runDueNativeLoopsMock).toHaveBeenCalledWith({ userId: "user-1" });
    });
    expect(getSchedulerStatus().isRunning).toBe(true);
  });
});
