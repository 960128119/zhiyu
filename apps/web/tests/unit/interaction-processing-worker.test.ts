import { beforeEach, describe, expect, it, vi } from "vitest";

const listRunnableJobsMock = vi.hoisted(() => vi.fn());
const processInteractionEventsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/interactions/processing-jobs", () => ({
  listRunnableInteractionProcessingJobs: listRunnableJobsMock,
}));

vi.mock("@/lib/interactions/processor", () => ({
  processInteractionEvents: processInteractionEventsMock,
}));

import { runPendingInteractionProcessingJobs } from "@/lib/interactions/worker";

describe("interaction processing worker", () => {
  beforeEach(() => {
    listRunnableJobsMock.mockReset();
    processInteractionEventsMock.mockReset();
  });

  it("replays durable jobs with their stored event IDs and mode", async () => {
    listRunnableJobsMock.mockResolvedValue([
      {
        id: "job-1",
        eventIds: ["event-1", "event-2"],
        processingMode: "summary_only",
      },
    ]);
    processInteractionEventsMock.mockResolvedValue({ mode: "llm" });

    const result = await runPendingInteractionProcessingJobs({
      userId: "user-1",
    });

    expect(result).toEqual({ completed: 1, failed: 0, skipped: 0 });
    expect(processInteractionEventsMock).toHaveBeenCalledWith({
      userId: "user-1",
      eventIds: ["event-1", "event-2"],
      processingMode: "summary_only",
      processingJobId: "job-1",
      fallbackToSummary: true,
    });
  });

  it("leaves failures available for the persisted retry policy", async () => {
    listRunnableJobsMock.mockResolvedValue([
      {
        id: "job-2",
        eventIds: ["event-3"],
        processingMode: "full",
      },
    ]);
    processInteractionEventsMock.mockRejectedValue(new Error("provider down"));

    const result = await runPendingInteractionProcessingJobs({
      userId: "user-1",
    });

    expect(result).toEqual({ completed: 0, failed: 1, skipped: 0 });
  });
});
