import { beforeEach, describe, expect, it, vi } from "vitest";

const runNativeLoopOnceMock = vi.hoisted(() => vi.fn());
const getLoopDashboardDetailMock = vi.hoisted(() => vi.fn());
const executeNativeLoopAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/lib/loops", () => ({
  getLoopDashboardDetail: getLoopDashboardDetailMock,
  runNativeLoopOnce: runNativeLoopOnceMock,
}));

vi.mock("@/lib/loops/native-executor", () => ({
  executeNativeLoopAgent: executeNativeLoopAgentMock,
}));

import { POST } from "@/app/(chat)/api/loops/[id]/execute/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/loops/loop-1/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("loop execute route", () => {
  beforeEach(() => {
    runNativeLoopOnceMock.mockReset();
    getLoopDashboardDetailMock.mockReset();
    executeNativeLoopAgentMock.mockReset();
    getLoopDashboardDetailMock.mockResolvedValue({ id: "loop-1" });
  });

  it("keeps dry-run execution free of native agent executor calls", async () => {
    runNativeLoopOnceMock.mockResolvedValue({ status: "success" });

    const response = await POST(request({ dryRun: true }), {
      params: Promise.resolve({ id: "loop-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toEqual({ status: "success" });
    expect(runNativeLoopOnceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        loopId: "loop-1",
        triggeredBy: "manual",
        execute: undefined,
      }),
    );
    expect(executeNativeLoopAgentMock).not.toHaveBeenCalled();
  });

  it("loads and calls the native agent executor for real execution", async () => {
    executeNativeLoopAgentMock.mockResolvedValue({ status: "success" });
    runNativeLoopOnceMock.mockImplementation(async (input) => {
      return input.execute({
        loop: { id: "loop-1" },
        previousState: { stateJson: {} },
        loopRun: { id: "run-1" },
      });
    });

    const response = await POST(request({ dryRun: false }), {
      params: Promise.resolve({ id: "loop-1" }),
    });

    expect(response.status).toBe(200);
    expect(executeNativeLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        loop: { id: "loop-1" },
        runId: "run-1",
      }),
    );
  });
});