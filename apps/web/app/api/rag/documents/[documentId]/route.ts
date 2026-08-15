import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  handleDeleteRagDocument,
  handleGetRagDocument,
} from "@openzhiyu/runtime-api/rag";
import { ragRuntimeDeps } from "@/lib/runtime-api/rag";

/**
 * GET /api/rag/documents/[documentId]
 * Get a specific RAG document with its chunks
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { documentId } = await params;
    const result = await handleGetRagDocument(
      ragRuntimeDeps,
      session.user,
      documentId,
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("RAG document fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch document",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/rag/documents/[documentId]
 * Delete a specific RAG document
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { documentId } = await params;
    const result = await handleDeleteRagDocument(
      ragRuntimeDeps,
      session.user,
      documentId,
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("RAG document delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete document",
      },
      { status: 500 },
    );
  }
}
