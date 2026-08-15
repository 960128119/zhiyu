import { auth } from "@/app/(auth)/auth";
import {
  addWorkMemory,
  listWorkMemories,
} from "@/lib/work-runtime";
import type { WorkshopMemoryStatus } from "@/lib/workshops/types";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MEMORY_STATUSES = new Set<WorkshopMemoryStatus>([
  "candidate",
  "active",
  "verified",
  "weakened",
  "confirmed",
  "dismissed",
]);

function parseMemoryStatus(value: unknown): WorkshopMemoryStatus {
  return typeof value === "string" &&
    MEMORY_STATUSES.has(value as WorkshopMemoryStatus)
    ? (value as WorkshopMemoryStatus)
    : "active";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    return NextResponse.json({
      memories: await listWorkMemories({
        userId: session.user.id,
        workId: id,
        includeCandidates: true,
      }),
    });
  } catch (error) {
    console.error("[WorkshopMemoriesAPI] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load memories" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    const { memory } = await addWorkMemory({
      userId: session.user.id,
      workId: id,
      kind: body.kind ?? "finding",
      content,
      confidence: Number(body.confidence ?? 50),
      tags: Array.isArray(body.tags) ? body.tags : [],
      sourceEventIds: Array.isArray(body.sourceEventIds)
        ? body.sourceEventIds
        : [],
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      status: parseMemoryStatus(body.status),
      source: "owner",
      reason: "Memory added from workshop API.",
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    console.error("[WorkshopMemoriesAPI] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add memory" },
      { status: 500 },
    );
  }
}
