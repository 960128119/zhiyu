import { describe, expect, it, vi } from "vitest";

const { processDocumentMock, getUserRAGStatsMock } = vi.hoisted(() => ({
  processDocumentMock: vi.fn(),
  getUserRAGStatsMock: vi.fn(),
}));

vi.mock("@/lib/ai/rag/langchain-service", () => ({
  processDocument: processDocumentMock,
  getUserRAGStats: getUserRAGStatsMock,
  shouldSkipRAGEmbeddings: vi.fn(() => false),
}));

import { runRagIndexDocumentJob } from "@/lib/runtime-worker/rag-indexing";

describe("web runtime worker RAG indexing adapter", () => {
  it("runs document indexing through the worker job contract", async () => {
    processDocumentMock.mockResolvedValue({
      documentId: "doc-1",
      chunksCount: 3,
      totalTokensUsed: 123,
      totalCreditCost: 1,
    });
    getUserRAGStatsMock.mockResolvedValue({
      totalDocuments: 4,
      totalChunks: 12,
    });

    await expect(
      runRagIndexDocumentJob({
        userId: "user-1",
        userType: "regular",
        fileName: "notes.md",
        contentType: "text/markdown",
        content: "hello world",
        blobPath: "blob/path",
        authToken: "token",
      }),
    ).resolves.toEqual({
      documentId: "doc-1",
      chunksCount: 3,
      totalTokensUsed: 123,
      totalCreditCost: 1,
      stats: {
        totalDocuments: 4,
        totalChunks: 12,
      },
    });

    expect(processDocumentMock).toHaveBeenCalledWith(
      "user-1",
      "regular",
      "notes.md",
      "text/markdown",
      "hello world",
      {
        chunkSize: 1000,
        chunkOverlap: 200,
        blobPath: "blob/path",
        skipEmbeddings: false,
      },
      "token",
    );
  });
});
