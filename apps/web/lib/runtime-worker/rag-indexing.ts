import {
  getUserRAGStats,
  processDocument,
  shouldSkipRAGEmbeddings,
} from "@/lib/ai/rag/langchain-service";
import {
  FileRuntimeWorkerQueue,
  runRuntimeWorkerJob,
  type RagIndexDocumentJob,
  type RagIndexDocumentOutput,
  type RuntimeWorkerHandlers,
} from "@openzhiyu/runtime-worker/jobs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface RunRagIndexDocumentInput {
  userId: string;
  userType?: string;
  fileName: string;
  contentType: string;
  content: string;
  blobPath?: string;
  authToken?: string;
  skipEmbeddings?: boolean;
}

export interface RunRagIndexDocumentResult extends RagIndexDocumentOutput {
  stats: {
    totalDocuments: number;
    totalChunks: number;
  };
}

export interface QueuedRagIndexDocumentResult {
  queued: true;
  jobId: string;
  queue: "file";
}

const ragWorkerHandlers: RuntimeWorkerHandlers = {
  async indexRagDocument(job) {
    const payload = job.payload;
    return processDocument(
      payload.userId,
      payload.userType ?? "regular",
      payload.fileName,
      payload.contentType,
      payload.content,
      {
        chunkSize: payload.chunkSize ?? 1000,
        chunkOverlap: payload.chunkOverlap ?? 200,
        blobPath: payload.blobPath,
        skipEmbeddings:
          payload.skipEmbeddings ?? shouldSkipRAGEmbeddings(false),
      },
      payload.authToken,
    );
  },
};

export async function runRagIndexDocumentJob(
  input: RunRagIndexDocumentInput,
): Promise<RunRagIndexDocumentResult> {
  const job = createRagIndexDocumentJob(input);

  const result = await runRuntimeWorkerJob(ragWorkerHandlers, job);
  if (!result.ok) {
    throw new Error(result.error || "RAG indexing worker job failed");
  }

  const output = result.output as RagIndexDocumentOutput;
  const stats = await getUserRAGStats(input.userId);
  return {
    ...output,
    stats: {
      totalDocuments: stats.totalDocuments,
      totalChunks: stats.totalChunks,
    },
  };
}

export async function enqueueRagIndexDocumentJob(
  input: RunRagIndexDocumentInput,
): Promise<QueuedRagIndexDocumentResult> {
  const queue = new FileRuntimeWorkerQueue({
    rootDir: getRagIndexQueueDir(),
  });
  const item = await queue.enqueue(createRagIndexDocumentJob(input));
  return {
    queued: true,
    jobId: item.id,
    queue: "file",
  };
}

export function shouldQueueRagIndexing(): boolean {
  return process.env.RAG_INDEX_QUEUE_MODE?.trim().toLowerCase() === "file";
}

export function getRagIndexQueueDir(): string {
  return (
    process.env.RAG_INDEX_QUEUE_DIR ||
    join(tmpdir(), "openzhiyu-runtime-worker", "rag-index")
  );
}

function createRagIndexDocumentJob(
  input: RunRagIndexDocumentInput,
): RagIndexDocumentJob {
  return {
    type: "rag.index-document",
    payload: {
      userId: input.userId,
      userType: input.userType,
      fileName: input.fileName,
      contentType: input.contentType,
      content: input.content,
      blobPath: input.blobPath,
      authToken: input.authToken,
      skipEmbeddings:
        input.skipEmbeddings ?? shouldSkipRAGEmbeddings(false),
      chunkSize: 1000,
      chunkOverlap: 200,
    },
  };
}
