import { describe, expect, it, vi } from "vitest";
import { runRuntimeWorkerJob } from "../../../../packages/runtime-worker/src/jobs";

describe("runtime worker jobs", () => {
  it("runs RAG index jobs through the worker handler contract", async () => {
    const indexRagDocument = vi.fn(async () => ({
      documentId: "doc-1",
      chunksCount: 2,
      totalTokensUsed: 50,
      totalCreditCost: 1,
    }));

    await expect(
      runRuntimeWorkerJob(
        { indexRagDocument },
        {
          type: "rag.index-document",
          payload: {
            userId: "user-1",
            fileName: "notes.md",
            contentType: "text/markdown",
            content: "hello",
          },
        },
      ),
    ).resolves.toEqual({
      type: "rag.index-document",
      ok: true,
      output: {
        documentId: "doc-1",
        chunksCount: 2,
        totalTokensUsed: 50,
        totalCreditCost: 1,
      },
    });
    expect(indexRagDocument).toHaveBeenCalledTimes(1);
  });
});
