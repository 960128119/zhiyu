import { searchSimilarChunks } from "@/lib/ai/rag/langchain-service";
import { searchInsightsSemantically } from "@/lib/insights/search";
import {
  getRawMessageManager,
  isRawMessageStorageAvailable,
} from "@/lib/memory/raw-message-store";

export type UnifiedMemorySearchSource = "memory" | "insights" | "knowledge";

export interface UnifiedMemorySearchResult {
  type: "memory" | "insight" | "knowledge";
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface UnifiedMemorySearchWarning {
  source: UnifiedMemorySearchSource;
  code: string;
  message: string;
}

export interface UnifiedMemorySearchInput {
  userId: string;
  query: string;
  sources?: UnifiedMemorySearchSource[];
  limit?: number;
  threshold?: number;
  authToken?: string;
  includeArchivedInsights?: boolean;
  botIds?: string[];
  documentIds?: string[];
}

export interface UnifiedMemorySearchOutput {
  query: string;
  sources: UnifiedMemorySearchSource[];
  results: UnifiedMemorySearchResult[];
  count: number;
  warnings: UnifiedMemorySearchWarning[];
}

const DEFAULT_LIMIT = 10;
const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_SOURCES: UnifiedMemorySearchSource[] = [
  "memory",
  "insights",
  "knowledge",
];
const SOURCE_SET = new Set<UnifiedMemorySearchSource>(DEFAULT_SOURCES);

export function normalizeUnifiedMemorySearchSources(
  sources: unknown,
): UnifiedMemorySearchSource[] {
  if (!Array.isArray(sources) || sources.length === 0) {
    return [...DEFAULT_SOURCES];
  }

  const normalized = sources
    .filter((source): source is string => typeof source === "string")
    .map((source) => source.trim().toLowerCase())
    .filter((source): source is UnifiedMemorySearchSource =>
      SOURCE_SET.has(source as UnifiedMemorySearchSource),
    );

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : [...DEFAULT_SOURCES];
}

export function clampUnifiedMemorySearchLimit(limit: unknown): number {
  const parsed =
    typeof limit === "number" ? limit : Number(limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

export function clampUnifiedMemorySearchThreshold(threshold: unknown): number {
  const parsed =
    typeof threshold === "number"
      ? threshold
      : Number(threshold ?? DEFAULT_THRESHOLD);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_THRESHOLD;
  }
  return Math.min(1, Math.max(-1, parsed));
}

export function mergeUnifiedMemorySearchResults(
  results: UnifiedMemorySearchResult[],
  limit: number,
): UnifiedMemorySearchResult[] {
  return [...results]
    .sort((a, b) => {
      const scoreDelta = b.similarity - a.similarity;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

function toKnowledgeResult(result: {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  chunkIndex: number;
}): UnifiedMemorySearchResult {
  return {
    type: "knowledge",
    id: result.chunkId,
    content: result.content,
    similarity: result.similarity,
    metadata: {
      documentId: result.documentId,
      documentName: result.documentName,
      chunkIndex: result.chunkIndex,
    },
  };
}

function isRawMessageChromaBackendEnabled(): boolean {
  const keys = [
    "RAW_MESSAGE_VECTOR_STORE_BACKEND",
    "MEMORY_VECTOR_STORE_BACKEND",
    "VECTOR_STORE_BACKEND",
  ];
  return keys.some((key) => process.env[key]?.trim().toLowerCase() === "chroma");
}

async function searchRawMessagesWithChromaBackend(input: {
  userId: string;
  queryEmbedding: number[];
  limit: number;
  threshold: number;
  botId?: string;
}) {
  const { searchRawMessagesWithChroma } = await import(
    "@/lib/memory/chroma-memory-index"
  );
  return searchRawMessagesWithChroma(input);
}

function hasEmbeddingProviderConfig(authToken?: string): boolean {
  if (process.env.EMBEDDING_PROVIDER?.trim().toLowerCase() === "local") {
    return true;
  }
  return Boolean(
    authToken ||
    process.env.OPENAI_EMBEDDINGS_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.LLM_API_KEY,
  );
}

async function embedQuery(
  query: string,
  authToken?: string,
): Promise<number[]> {
  if (!hasEmbeddingProviderConfig(authToken)) {
    throw new Error("Embedding provider API key is not configured");
  }

  const { UniversalEmbeddings } =
    await import("@openzhiyu/rag/universal-embeddings");
  const embeddings = new UniversalEmbeddings(authToken);
  return embeddings.embedQuery(query);
}

function toMemoryResult(result: {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}): UnifiedMemorySearchResult {
  return {
    type: "memory",
    id: result.id,
    content: result.content,
    similarity: result.similarity,
    metadata: result.metadata,
  };
}

function isRawMemorySemanticResult(result: unknown): result is {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
} {
  if (!result || typeof result !== "object") {
    return false;
  }
  const item = result as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.content === "string" &&
    typeof item.similarity === "number" &&
    Boolean(item.metadata) &&
    typeof item.metadata === "object"
  );
}

async function searchRawMemorySemantically(input: {
  userId: string;
  query: string;
  queryEmbedding?: number[];
  authToken?: string;
  botIds?: string[];
  limit: number;
  threshold: number;
}): Promise<UnifiedMemorySearchResult[]> {
  const manager = await getRawMessageManager();
  const filters =
    input.botIds && input.botIds.length > 0
      ? input.botIds.map((botId) => ({ botId }))
      : [{}];

  let semanticResults: UnifiedMemorySearchResult[] = [];
  let semanticBackendHandled = false;
  if (hasEmbeddingProviderConfig(input.authToken)) {
    const queryEmbedding =
      input.queryEmbedding ?? (await embedQuery(input.query, input.authToken));
    if (queryEmbedding.length > 0) {
      if (isRawMessageChromaBackendEnabled()) {
        try {
          semanticResults = (
            await Promise.all(
              filters.map((filter) => {
                const botId = "botId" in filter ? filter.botId : undefined;
                return searchRawMessagesWithChromaBackend({
                  userId: input.userId,
                  queryEmbedding,
                  limit: input.limit,
                  threshold: input.threshold,
                  botId,
                });
              }),
            )
          )
            .flat()
            .map(toMemoryResult);
          semanticBackendHandled = true;
          console.log("[UnifiedMemory] Raw message semantic search completed", {
            backend: "chroma",
            dimensions: queryEmbedding.length,
            count: semanticResults.length,
          });
        } catch (error) {
          console.warn(
            "[UnifiedMemory] Chroma raw message search failed; falling back to database search:",
            error,
          );
        }
      }

      if (
        !semanticBackendHandled &&
        typeof manager.searchMessagesSemantically === "function"
      ) {
        semanticResults = (
          await Promise.all(
            filters.map((filter) =>
              manager.searchMessagesSemantically?.({
                userId: input.userId,
                queryEmbedding,
                limit: input.limit,
                threshold: input.threshold,
                ...filter,
              }),
            ),
          )
        )
          .flat()
          .filter(isRawMemorySemanticResult)
          .map(toMemoryResult);
      }
    }
  }

  return mergeUnifiedMemorySearchResults(semanticResults, input.limit);
}

export async function searchUnifiedMemory(
  input: UnifiedMemorySearchInput,
): Promise<UnifiedMemorySearchOutput> {
  const query = input.query.trim();
  const sources = normalizeUnifiedMemorySearchSources(input.sources);
  const limit = clampUnifiedMemorySearchLimit(input.limit);
  const threshold = clampUnifiedMemorySearchThreshold(input.threshold);
  const warnings: UnifiedMemorySearchWarning[] = [];
  const results: UnifiedMemorySearchResult[] = [];
  let queryEmbeddingPromise: Promise<number[]> | undefined;

  if (!query) {
    return {
      query,
      sources,
      results: [],
      count: 0,
      warnings,
    };
  }

  const getQueryEmbedding = () => {
    queryEmbeddingPromise ??= embedQuery(query, input.authToken);
    return queryEmbeddingPromise;
  };

  const searchTasks: Array<Promise<UnifiedMemorySearchResult[]>> = [];

  if (sources.includes("memory")) {
    if (isRawMessageStorageAvailable()) {
      searchTasks.push(
        (async () =>
          searchRawMemorySemantically({
            userId: input.userId,
            query,
            queryEmbedding: await getQueryEmbedding(),
            authToken: input.authToken,
            botIds: input.botIds,
            limit,
            threshold,
          }))(),
      );
    } else {
      warnings.push({
        source: "memory",
        code: "raw_message_storage_unavailable",
        message: "Raw memory storage is not available in this environment.",
      });
    }
  }

  if (sources.includes("insights")) {
    searchTasks.push(
      (async () => {
        const insightResults = await searchInsightsSemantically({
          userId: input.userId,
          query,
          queryEmbedding: await getQueryEmbedding(),
          limit,
          threshold,
          botIds: input.botIds,
          includeArchived: input.includeArchivedInsights,
          authToken: input.authToken,
        });
        return insightResults;
      })(),
    );
  }

  if (sources.includes("knowledge")) {
    searchTasks.push(
      (async () => {
        const knowledgeResults = await searchSimilarChunks(
          input.userId,
          query,
          {
            limit,
            threshold,
            documentIds: input.documentIds,
            queryEmbedding: await getQueryEmbedding(),
          },
          input.authToken,
        );
        return knowledgeResults.map(toKnowledgeResult);
      })(),
    );
  }

  const sourceResults = await Promise.all(searchTasks);
  results.push(...sourceResults.flat());

  const merged = mergeUnifiedMemorySearchResults(results, limit);
  return {
    query,
    sources,
    results: merged,
    count: merged.length,
    warnings,
  };
}
