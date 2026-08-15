import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  handleDeleteAllRagDocuments,
  handleListRagDocuments,
} from "@openzhiyu/runtime-api/rag";
import { ragRuntimeDeps } from "@/lib/runtime-api/rag";

/**
 * GET /api/rag/documents
 * Get all RAG documents for the current user
 * Supports pagination with cursor-based pagination for infinite scroll
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await handleListRagDocuments(
    ragRuntimeDeps,
    session.user,
    request.url,
  );
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * DELETE /api/rag/documents
 * Delete all RAG documents for the current user
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await handleDeleteAllRagDocuments(
    ragRuntimeDeps,
    session.user,
  );
  return NextResponse.json(result.body, { status: result.status });
}
