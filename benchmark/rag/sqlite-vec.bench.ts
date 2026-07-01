import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  SQLiteVecStore,
  type DocumentChunk,
} from "../../packages/ai/rag/src/sqlite-vec-store";

interface BenchmarkConfig {
  chunks: number;
  dimensions: number;
  topK: number;
  iterations: number;
  filteredIterations: number;
  deleteOlderThan: number;
}

interface TimedResult<T> {
  durationMs: number;
  value: T;
}

const config: BenchmarkConfig = {
  chunks: readIntegerEnv("RAG_BENCH_CHUNKS", 10_000),
  dimensions: readIntegerEnv("RAG_BENCH_DIMENSIONS", 384),
  topK: readIntegerEnv("RAG_BENCH_TOP_K", 10),
  iterations: readIntegerEnv("RAG_BENCH_ITERATIONS", 100),
  filteredIterations: readIntegerEnv("RAG_BENCH_FILTERED_ITERATIONS", 100),
  deleteOlderThan: readIntegerEnv("RAG_BENCH_DELETE_OLDER_THAN", 5_000),
};

const tempDir = mkdtempSync(join(tmpdir(), "openzhiyu-rag-bench-"));
const dbPath = join(tempDir, "sqlite-vec-bench.db");

try {
  const store = new SQLiteVecStore(dbPath, undefined, {
    collectionName: "bench_rag",
  });

  const chunks = createChunks(config);
  const query = createEmbedding("query", config.dimensions);

  const upsert = await time(() => store.addChunks(chunks));
  const topK = await timeMany(config.iterations, () =>
    store.similaritySearch(query, config.topK, "user-1"),
  );
  const filtered = await timeMany(config.filteredIterations, () =>
    store.similaritySearchWithOptions(query, {
      limit: config.topK,
      filter: {
        userId: "user-1",
        platform: "feishu",
        channel: "project-7",
        startTime: 1_000,
        endTime: 9_000,
      },
    }),
  );
  const deleted = await time(() => store.deleteOlderThan(config.deleteOlderThan));
  const stats = await store.getStats();

  const report = {
    benchmark: "sqlite-vec-rag",
    config,
    dbPath,
    capabilities: store.getCapabilities(),
    results: {
      batchUpsert: summarizeSingle(upsert),
      topKSearch: summarizeMany(topK),
      filteredSearch: summarizeMany(filtered),
      deleteOlderThan: {
        ...summarizeSingle(deleted),
        deletedRows: deleted.value,
      },
      finalStats: stats,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  store.close();
} finally {
  if (process.env.RAG_BENCH_KEEP_DB !== "true") {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function time<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();
  const value = await fn();
  return {
    durationMs: performance.now() - start,
    value,
  };
}

async function timeMany<T>(
  count: number,
  fn: () => Promise<T>,
): Promise<Array<TimedResult<T>>> {
  const results: Array<TimedResult<T>> = [];
  for (let index = 0; index < count; index += 1) {
    results.push(await time(fn));
  }
  return results;
}

function summarizeSingle<T>(result: TimedResult<T>) {
  return {
    durationMs: round(result.durationMs),
  };
}

function summarizeMany(results: Array<TimedResult<unknown>>) {
  const durations = results
    .map((result) => result.durationMs)
    .sort((a, b) => a - b);
  return {
    iterations: durations.length,
    minMs: round(percentile(durations, 0)),
    p50Ms: round(percentile(durations, 0.5)),
    p95Ms: round(percentile(durations, 0.95)),
    maxMs: round(percentile(durations, 1)),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * p) - 1),
  );
  return values[index];
}

function createChunks(input: BenchmarkConfig): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  for (let index = 0; index < input.chunks; index += 1) {
    chunks.push({
      id: `chunk-${index}`,
      documentId: `document-${Math.floor(index / 20)}`,
      content: `Synthetic RAG chunk ${index}`,
      embedding: createEmbedding(`chunk-${index}`, input.dimensions),
      metadata: {
        userId: index % 5 === 0 ? "user-2" : "user-1",
        platform: index % 3 === 0 ? "slack" : "feishu",
        channel: `project-${index % 16}`,
        timestamp: index,
      },
    });
  }
  return chunks;
}

function createEmbedding(seed: string, dimensions: number): number[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  const vector: number[] = [];
  let norm = 0;
  for (let index = 0; index < dimensions; index += 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    const value = ((state >>> 0) / 0xffffffff) * 2 - 1;
    vector.push(value);
    norm += value * value;
  }

  const scale = Math.sqrt(norm) || 1;
  return vector.map((value) => value / scale);
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
