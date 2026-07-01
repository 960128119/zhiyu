export interface RuntimeApiResult<TBody = unknown> {
  status: number;
  body: TBody;
}

export interface RuntimeUser {
  id: string;
  type?: string;
}

export interface RagSearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  chunkIndex: number;
}

export interface RagDocumentRecord {
  id: string;
  userId: string;
  fileName: string;
  contentType: string;
  blobPath?: string | null;
  sizeBytes: number | string;
  totalChunks: number;
  uploadedAt: Date | string | number;
}

export interface RagChunkRecord {
  id: string;
  chunkIndex: number;
  content: string;
  createdAt: Date | string | number;
}

export interface RagDocumentInsightLink {
  documentId: string;
  insightId: string;
  insightTitle: string;
}

export interface RagRuntimeDeps {
  searchSimilarChunks(
    userId: string,
    query: string,
    options: { limit: number; threshold: number },
  ): Promise<RagSearchResult[]>;
  formatSearchResultsForLLM(results: RagSearchResult[]): string;
  getUserDocuments(userId: string): Promise<RagDocumentRecord[]>;
  deleteUserDocuments(userId: string): Promise<void>;
  getDocument(documentId: string): Promise<RagDocumentRecord | undefined | null>;
  getDocumentChunks(documentId: string): Promise<RagChunkRecord[]>;
  deleteDocument(documentId: string): Promise<void>;
  getDocumentInsightLinks?(
    userId: string,
    documentIds: string[],
  ): Promise<RagDocumentInsightLink[]>;
  logError?(message: string, error: unknown): void;
}

export async function handleRagSearch(
  deps: RagRuntimeDeps,
  user: RuntimeUser,
  body: unknown,
): Promise<RuntimeApiResult> {
  try {
    const input = isObject(body) ? body : {};
    const query = input.query;
    const limit = clampInteger(input.limit, 5, 1, 50);
    const threshold = clampNumber(input.threshold, 0.7, -1, 1);

    if (!query || typeof query !== "string") {
      return errorResult("Query is required and must be a string", 400);
    }

    if (query.trim().length === 0) {
      return errorResult("Query cannot be empty", 400);
    }

    const results = await deps.searchSimilarChunks(user.id, query, {
      limit,
      threshold,
    });

    return okResult({
      query,
      results: results.map(toSearchResponse),
      count: results.length,
      context: deps.formatSearchResultsForLLM(results),
    });
  } catch (error) {
    deps.logError?.("RAG search error", error);
    return errorResult(toErrorMessage(error, "Failed to search strategy memory"), 500);
  }
}

export async function handleListRagDocuments(
  deps: RagRuntimeDeps,
  user: RuntimeUser,
  url: string,
): Promise<RuntimeApiResult> {
  try {
    const searchParams = new URL(url).searchParams;
    const pageSize = clampInteger(searchParams.get("pageSize"), 50, 1, 200);
    const cursor = searchParams.get("cursor");
    const documents = await deps.getUserDocuments(user.id);
    const sortedDocs = documents.map(toDocumentListItem).sort(sortByUploadedDesc);

    const startIndex = getCursorStartIndex(sortedDocs, cursor);
    let documentsPage = sortedDocs.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < sortedDocs.length;
    const nextCursor = hasMore
      ? String(toTimestamp(documentsPage[documentsPage.length - 1]?.uploadedAt))
      : null;

    const docIds = documentsPage.map((document) => document.id);
    if (docIds.length > 0 && deps.getDocumentInsightLinks) {
      const links = await deps.getDocumentInsightLinks(user.id, docIds);
      const docToInsight = new Map(
        links.map((link) => [
          link.documentId,
          {
            insightId: link.insightId,
            insightTitle: link.insightTitle,
          },
        ]),
      );
      documentsPage = documentsPage.map((document) => ({
        ...document,
        ...(docToInsight.get(document.id) ?? {}),
      }));
    }

    return okResult({
      documents: documentsPage,
      hasMore,
      nextCursor,
      total: sortedDocs.length,
    });
  } catch (error) {
    deps.logError?.("RAG documents fetch error", error);
    return errorResult(toErrorMessage(error, "Failed to fetch documents"), 500);
  }
}

export async function handleDeleteAllRagDocuments(
  deps: RagRuntimeDeps,
  user: RuntimeUser,
): Promise<RuntimeApiResult> {
  try {
    await deps.deleteUserDocuments(user.id);
    return okResult({
      success: true,
      message: "All documents deleted from strategy memory",
    });
  } catch (error) {
    deps.logError?.("RAG documents delete error", error);
    return errorResult(toErrorMessage(error, "Failed to delete documents"), 500);
  }
}

export async function handleGetRagDocument(
  deps: RagRuntimeDeps,
  user: RuntimeUser,
  documentId: string,
): Promise<RuntimeApiResult> {
  try {
    const document = await deps.getDocument(documentId);
    if (!document || document.userId !== user.id) {
      return errorResult("Document not found", 404);
    }

    const chunks = await deps.getDocumentChunks(documentId);
    return okResult({
      document: {
        id: document.id,
        fileName: document.fileName,
        contentType: document.contentType,
        blobPath: document.blobPath,
        sizeBytes: Number(document.sizeBytes),
        totalChunks: document.totalChunks,
        uploadedAt: document.uploadedAt,
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          createdAt: chunk.createdAt,
        })),
      },
    });
  } catch (error) {
    deps.logError?.("RAG document fetch error", error);
    return errorResult(toErrorMessage(error, "Failed to fetch document"), 500);
  }
}

export async function handleDeleteRagDocument(
  deps: RagRuntimeDeps,
  user: RuntimeUser,
  documentId: string,
): Promise<RuntimeApiResult> {
  try {
    const document = await deps.getDocument(documentId);
    if (!document || document.userId !== user.id) {
      return errorResult("Document not found", 404);
    }

    await deps.deleteDocument(documentId);
    return okResult({
      success: true,
      message: "Document deleted from strategy memory",
    });
  } catch (error) {
    deps.logError?.("RAG document delete error", error);
    return errorResult(toErrorMessage(error, "Failed to delete document"), 500);
  }
}

function okResult<TBody>(body: TBody): RuntimeApiResult<TBody> {
  return { status: 200, body };
}

function errorResult(message: string, status: number): RuntimeApiResult {
  return { status, body: { error: message } };
}

function toSearchResponse(result: RagSearchResult) {
  return {
    chunkId: result.chunkId,
    documentId: result.documentId,
    documentName: result.documentName,
    content: result.content,
    similarity: result.similarity,
    chunkIndex: result.chunkIndex,
  };
}

function toDocumentListItem(document: RagDocumentRecord) {
  return {
    id: document.id,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: Number(document.sizeBytes),
    totalChunks: document.totalChunks,
    uploadedAt: document.uploadedAt,
  };
}

function sortByUploadedDesc(
  a: ReturnType<typeof toDocumentListItem>,
  b: ReturnType<typeof toDocumentListItem>,
) {
  return toTimestamp(b.uploadedAt) - toTimestamp(a.uploadedAt);
}

function getCursorStartIndex(
  documents: Array<ReturnType<typeof toDocumentListItem>>,
  cursor: string | null,
): number {
  if (!cursor) return 0;
  const cursorTime = Number.parseInt(cursor, 10);
  if (!Number.isFinite(cursorTime)) return 0;

  const exactIndex = documents.findIndex(
    (document) => toTimestamp(document.uploadedAt) === cursorTime,
  );
  if (exactIndex !== -1) return exactIndex + 1;

  const nextIndex = documents.findIndex(
    (document) => toTimestamp(document.uploadedAt) < cursorTime,
  );
  return nextIndex === -1 ? documents.length : nextIndex;
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
