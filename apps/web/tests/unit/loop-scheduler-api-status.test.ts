import { beforeEach, describe, expect, it, vi } from "vitest";

const startLocalSchedulerMock = vi.hoisted(() => vi.fn());
const stopLocalSchedulerMock = vi.hoisted(() => vi.fn());
const getSchedulerStatusMock = vi.hoisted(() => vi.fn());
const setSchedulerUserIdMock = vi.hoisted(() => vi.fn());
const setCloudAuthTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cron/local-scheduler", () => ({
  startLocalScheduler: startLocalSchedulerMock,
  stopLocalScheduler: stopLocalSchedulerMock,
  getSchedulerStatus: getSchedulerStatusMock,
  setSchedulerUserId: setSchedulerUserIdMock,
}));

vi.mock("@/lib/auth/token-manager", () => ({
  setCloudAuthToken: setCloudAuthTokenMock,
}));

vi.mock("@/lib/env", () => ({
  isTauriMode: vi.fn(() => true),
}));

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import {
  GET,
  POST,
} from "@/app/(chat)/api/scheduled-jobs/internal/scheduler/route";

describe("scheduler internal API status", () => {
  beforeEach(() => {
    startLocalSchedulerMock.mockReset();
    stopLocalSchedulerMock.mockReset();
    getSchedulerStatusMock.mockReset();
    setSchedulerUserIdMock.mockReset();
    setCloudAuthTokenMock.mockReset();
  });

  it("returns native loop scheduler status through the existing scheduler response", async () => {
    getSchedulerStatusMock
      .mockReturnValueOnce({
        isRunning: false,
        checkInterval: 60_000,
        nativeLoops: { runningLoopIds: ["loop-1"] },
      })
      .mockReturnValueOnce({
        isRunning: true,
        checkInterval: 60_000,
        nativeLoops: { runningLoopIds: ["loop-1"] },
      });

    const response = await GET(
      new Request("http://localhost/api/scheduled-jobs/internal/scheduler?cloudAuthToken=token-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(setSchedulerUserIdMock).toHaveBeenCalledWith("user-1");
    expect(setCloudAuthTokenMock).toHaveBeenCalledWith("token-1");
    expect(startLocalSchedulerMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      success: true,
      scheduler: {
        isRunning: true,
        nativeLoops: { runningLoopIds: ["loop-1"] },
      },
    });
  });

  it("clears scheduler auth context when stopping", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(stopLocalSchedulerMock).toHaveBeenCalledTimes(1);
    expect(setCloudAuthTokenMock).toHaveBeenCalledWith(undefined);
    expect(body).toEqual({ success: true });
  });
});