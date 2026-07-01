export type RuntimeWorkerJob = RagIndexDocumentJob;

export interface RagIndexDocumentJob {
  type: "rag.index-document";
  payload: {
    userId: string;
    userType?: string;
    fileName: string;
    contentType: string;
    content: string;
    blobPath?: string;
    authToken?: string;
    skipEmbeddings?: boolean;
    chunkSize?: number;
    chunkOverlap?: number;
  };
}

export interface RagIndexDocumentOutput {
  documentId: string;
  chunksCount: number;
  totalTokensUsed: number;
  totalCreditCost: number;
}

export interface RuntimeWorkerJobResult {
  type: RuntimeWorkerJob["type"];
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface RuntimeWorkerHandlers {
  indexRagDocument(job: RagIndexDocumentJob): Promise<RagIndexDocumentOutput>;
}

export async function runRuntimeWorkerJob(
  handlers: RuntimeWorkerHandlers,
  job: RuntimeWorkerJob,
): Promise<RuntimeWorkerJobResult> {
  try {
    switch (job.type) {
      case "rag.index-document":
        return {
          type: job.type,
          ok: true,
          output: await handlers.indexRagDocument(job),
        };
    }
  } catch (error) {
    return {
      type: job.type,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
