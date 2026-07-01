import {
  deleteDocument,
  deleteUserDocuments,
  formatSearchResultsForLLM,
  getDocument,
  getDocumentChunks,
  getUserDocuments,
  searchSimilarChunks,
} from "@/lib/ai/rag/langchain-service";
import { db, insight, insightDocuments } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import type { RagRuntimeDeps } from "@openzhiyu/runtime-api/rag";

export const ragRuntimeDeps: RagRuntimeDeps = {
  searchSimilarChunks,
  formatSearchResultsForLLM,
  getUserDocuments,
  deleteUserDocuments,
  getDocument,
  getDocumentChunks,
  deleteDocument,
  async getDocumentInsightLinks(userId, documentIds) {
    if (documentIds.length === 0) return [];

    const rows = await db
      .select({
        documentId: insightDocuments.documentId,
        insightId: insightDocuments.insightId,
        insightTitle: insight.title,
      })
      .from(insightDocuments)
      .innerJoin(insight, eq(insightDocuments.insightId, insight.id))
      .where(
        and(
          inArray(insightDocuments.documentId, documentIds),
          eq(insightDocuments.userId, userId),
        ),
      );

    return rows.map(
      (row: {
        documentId: unknown;
        insightId: unknown;
        insightTitle: unknown;
      }) => ({
      documentId: String(row.documentId),
      insightId: String(row.insightId),
      insightTitle: (row.insightTitle as string) ?? "",
      }),
    );
  },
  logError(message, error) {
    console.error(message, error);
  },
};
