import { afterEach, describe, expect, it, vi } from "vitest";
import { streamNativeAgentResponse } from "@/lib/ai/router/index";

function createSseResponse() {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}

describe("native agent router loop guard forwarding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards loopIdForGuard to the native agent request body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createSseResponse());
    const done = new Promise<void>((resolve) => {
      void streamNativeAgentResponse("check loop state", {
        chatId: "chat-1",
        loopIdForGuard: "loop-guard-1",
        onDone: resolve,
      });
    });

    await done;

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/native/agent",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: "check loop state",
      sessionId: "chat-1",
      loopIdForGuard: "loop-guard-1",
    });
  });
});
