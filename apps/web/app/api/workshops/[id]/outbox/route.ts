import { auth } from "@/app/(auth)/auth";
import {
  createOutboxDraft,
  getWorkshop,
  listWorkshopOutbox,
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
    return NextResponse.json({ outbox: await listWorkshopOutbox(id) });
  } catch (error) {
    console.error("[WorkshopOutboxAPI] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load outbox" },
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
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    const outbox = await createOutboxDraft({
      workshopId: id,
      runId: body.runId ?? null,
      channel: body.channel ?? "wechat_desktop",
      recipientName: body.recipientName ?? null,
      message,
      status: body.status ?? "draft",
      confidence: Number(body.confidence ?? 50),
      riskLevel: body.riskLevel ?? "medium",
      sourceEventIds: Array.isArray(body.sourceEventIds)
        ? body.sourceEventIds
        : [],
      boundaryResult: body.boundaryResult ?? {},
    });
    return NextResponse.json({ outbox }, { status: 201 });
  } catch (error) {
    console.error("[WorkshopOutboxAPI] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create outbox draft" },
      { status: 500 },
    );
  }
}
