import { beforeEach, describe, expect, it, vi } from "vitest";

const processInteractionEventsMock = vi.hoisted(() => vi.fn());
const clearInteractionWikiItemsMock = vi.hoisted(() => vi.fn());
const listInteractionEventsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(async () => ({
    user: {
      id: "user-1",
      email: "user-1@example.com",
      name: "User One",
      type: "regular",
    },
  })),
}));

vi.mock("@/lib/ai", () => ({
  setAIUserContextFromRequest: vi.fn(async () => undefined),
  clearAIUserContext: vi.fn(),
}));

vi.mock("@/lib/interactions/processor", () => ({
  processInteractionEvents: processInteractionEventsMock,
}));

vi.mock("@/lib/interactions/service", () => ({
  clearInteractionWikiItems: clearInteractionWikiItemsMock,
  listInteractionEvents: listInteractionEventsMock,
}));

vi.mock("@/lib/knowledge-pipeline/source-policies", () => ({
  listInteractionSourcePolicies: vi.fn(async () => [
    {
      sourceId: "contact-1",
      sourceName: "Contact One",
      enabled: true,
      policy: "sync",
    },
  ]),
}));

vi.mock("@/lib/workshops/service", () => ({
  appendWorkshopEvent: vi.fn(),
  getWorkshop: vi.fn(),
}));

import { POST } from "@/app/api/interactions/process/route";

function request() {
  return new Request("http://localhost/api/interactions/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "selected_sources",
      clearExisting: true,
      chunkSize: 40,
    }),
  });
}

describe("interaction wiki replacement", () => {
  beforeEach(() => {
    processInteractionEventsMock.mockReset();
    clearInteractionWikiItemsMock.mockReset();
    listInteractionEventsMock.mockReset();
    listInteractionEventsMock.mockResolvedValue([
      {
        id: "event-1",
        conversationId: "contact-1",
        conversationName: "Contact One",
      },
    ]);
  });

  it("keeps existing wiki items when generation fails", async () => {
    processInteractionEventsMock.mockRejectedValue(new Error("LLM unavailable"));

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    expect(clearInteractionWikiItemsMock).not.toHaveBeenCalled();
  });

  it("clears old items only after generation and preserves new items", async () => {
    processInteractionEventsMock.mockResolvedValue({
      mode: "llm",
      model: "qwen",
      processedEventIds: ["event-1"],
      notes: [{ id: "note-new" }],
      tasks: [{ id: "task-new" }],
      memories: [{ id: "memory-new" }],
    });
    clearInteractionWikiItemsMock.mockResolvedValue({
      deletedNotes: 1,
      deletedTasks: 1,
      deletedMemories: 1,
      deletedCount: 3,
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(clearInteractionWikiItemsMock).toHaveBeenCalledWith({
      userId: "user-1",
      reason: "user_regenerated_wiki",
      preserve: {
        noteIds: ["note-new"],
        taskIds: ["task-new"],
        memoryIds: ["memory-new"],
      },
    });
    expect(
      processInteractionEventsMock.mock.invocationCallOrder[0],
    ).toBeLessThan(clearInteractionWikiItemsMock.mock.invocationCallOrder[0]);
  });
});
