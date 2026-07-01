import { describe, expect, it, vi } from "vitest";
import {
  handleDeleteRagDocument,
  handleGetRagDocument,
  handleListRagDocuments,
  handleRagSearch,
  type RagRuntimeDeps,
} from "@openzhiyu/runtime-api/rag";

function createDeps(overrides: Partial<RagRuntimeDeps> = {}): RagRuntimeDeps {
  return {
    searchSimilarChunks: vi.fn(async () => [
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentName: "Notes.md",
        content: "alpha",
        similarity: 0.91,
        chunkIndex: 0,
      },
    ]),
    formatSearchResultsForLLM: vi.fn(() => "formatted context"),
    getUserDocuments: vi.fn(async () => [
      document("doc-new", "user-1", "2026-01-02T00:00:00.000Z"),
      document("doc-old", "user-1", "2026-01-01T00:00:00.000Z"),
    ]),
    deleteUserDocuments: vi.fn(async () => {}),
    getDocument: vi.fn(async (documentId) =>
      documentId === "missing"
        ? undefined
        : document(documentId, documentId === "foreign" ? "user-2" : "user-1"),
    ),
    getDocumentChunks: vi.fn(async () => [
      {
        id: "chunk-1",
        chunkIndex: 0,
        content: "content",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]),
    deleteDocument: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runtime-api RAG handlers", () => {
  it("validates and executes semantic search", async () => {
    const deps = createDeps();

    await expect(
      handleRagSearch(deps, { id: "user-1" }, { query: "  " }),
    ).resolves.toEqual({
      status: 400,
      body: { error: "Query cannot be empty" },
    });

    const result = await handleRagSearch(deps, { id: "user-1" }, {
      query: "alpha",
      limit: 999,
      threshold: 2,
    });

    expect(deps.searchSimilarChunks).toHaveBeenCalledWith("user-1", "alpha", {
      limit: 50,
      threshold: 1,
    });
    expect(result).toMatchObject({
      status: 200,
      body: {
        query: "alpha",
        count: 1,
        context: "formatted context",
      },
    });
  });

  it("lists documents with cursor pagination and insight links", async () => {
    const deps = createDeps({
      getDocumentInsightLinks: vi.fn(async () => [
        {
          documentId: "doc-new",
          insightId: "insight-1",
          insightTitle: "Launch",
        },
      ]),
    });

    const result = await handleListRagDocuments(
      deps,
      { id: "user-1" },
      "https://app.test/api/rag/documents?pageSize=1",
    );

    expect(result).toMatchObject({
      status: 200,
      body: {
        hasMore: true,
        total: 2,
        documents: [
          {
            id: "doc-new",
            insightId: "insight-1",
            insightTitle: "Launch",
          },
        ],
      },
    });
  });

  it("protects document detail and deletion by owner", async () => {
    const deps = createDeps();

    await expect(
      handleGetRagDocument(deps, { id: "user-1" }, "foreign"),
    ).resolves.toEqual({
      status: 404,
      body: { error: "Document not found" },
    });

    const detail = await handleGetRagDocument(deps, { id: "user-1" }, "doc-1");
    expect(detail).toMatchObject({
      status: 200,
      body: {
        document: {
          id: "doc-1",
          chunks: [{ id: "chunk-1", content: "content" }],
        },
      },
    });

    const deletion = await handleDeleteRagDocument(
      deps,
      { id: "user-1" },
      "doc-1",
    );
    expect(deps.deleteDocument).toHaveBeenCalledWith("doc-1");
    expect(deletion).toMatchObject({
      status: 200,
      body: { success: true },
    });
  });
});

function document(
  id: string,
  userId: string,
  uploadedAt: string = "2026-01-02T00:00:00.000Z",
) {
  return {
    id,
    userId,
    fileName: `${id}.md`,
    contentType: "text/markdown",
    blobPath: null,
    sizeBytes: "42",
    totalChunks: 1,
    uploadedAt,
  };
}
