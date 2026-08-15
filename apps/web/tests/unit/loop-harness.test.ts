import { beforeEach, describe, expect, it, vi } from "vitest";

const runNativeLoopOnceMock = vi.hoisted(() => vi.fn());
const executeNativeLoopAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/loops/runtime", () => ({
  runNativeLoopOnce: runNativeLoopOnceMock,
}));

vi.mock("@/lib/loops/native-executor", () => ({
  executeNativeLoopAgent: executeNativeLoopAgentMock,
}));

import { runLoopHarness } from "@/lib/loops/harness";

describe("loop harness", () => {
  beforeEach(() => {
    runNativeLoopOnceMock.mockReset();
    executeNativeLoopAgentMock.mockReset();
  });

  it("keeps dry-run mode free of native agent execution", async () => {
    runNativeLoopOnceMock.mockResolvedValue({ status: "success" });

    const output = await runLoopHarness({
      userId: "user-1",
      loopId: "loop-1",
      mode: "dry_run",
      triggeredBy: "manual",
    });

    expect(output.result).toEqual({ status: "success" });
    expect(output.harness).toMatchObject({
      name: "loop-run-harness",
      mode: "dry_run",
      loopId: "loop-1",
    });
    expect(runNativeLoopOnceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        loopId: "loop-1",
        execute: undefined,
      }),
    );
    expect(executeNativeLoopAgentMock).not.toHaveBeenCalled();
  });

  it("delegates native-agent mode to the native loop executor", async () => {
    executeNativeLoopAgentMock.mockResolvedValue({ status: "success" });
    runNativeLoopOnceMock.mockImplementation(async (input) =>
      input.execute({
        loop: { id: "loop-1" },
        previousState: null,
        loopRun: { id: "run-1" },
      }),
    );

    const output = await runLoopHarness({
      userId: "user-1",
      loopId: "loop-1",
      mode: "native_agent",
      triggeredBy: "manual",
    });

    expect(output.result).toEqual({ status: "success" });
    expect(executeNativeLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        loop: { id: "loop-1" },
        previousState: null,
        runId: "run-1",
      }),
    );
  });
});
