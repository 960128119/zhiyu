import { auth } from "@/app/(auth)/auth";
import {
  addWorkshopMemory,
  getWorkshop,
  listWorkshopMemories,
} from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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
    const workshop = await getWorkshop(session.user.id, id);
    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }
    return NextResponse.json({ memories: await listWorkshopMemories(id) });
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
    const workshop = await getWorkshop(session.user.id, id);
    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }

    const body = await request.json();
    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    const memory = await addWorkshopMemory({
      workshopId: id,
      kind: body.kind ?? "finding",
      content,
      confidence: Number(body.confidence ?? 50),
      tags: Array.isArray(body.tags) ? body.tags : [],
      sourceEventIds: Array.isArray(body.sourceEventIds)
        ? body.sourceEventIds
        : [],
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
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
