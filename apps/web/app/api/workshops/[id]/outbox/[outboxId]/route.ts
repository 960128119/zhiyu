import { auth } from "@/app/(auth)/auth";
import {
  getWorkshop,
  getWorkshopOutboxItem,
  updateWorkshopOutboxItem,
} from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; outboxId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, outboxId } = await params;
    const workshop = await getWorkshop(session.user.id, id);
    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }

    const outbox = await getWorkshopOutboxItem(id, outboxId);
    if (!outbox) {
      return NextResponse.json({ error: "Outbox item not found" }, { status: 404 });
    }
    if (outbox.status === "sent") {
      return NextResponse.json(
        { error: "Sent outbox items cannot be edited." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const recipientName =
      typeof body.recipientName === "string"
        ? body.recipientName.trim() || null
        : null;
    const boundaryResult = { ...(outbox.boundaryResult ?? {}) };
    delete boundaryResult.wechatPreview;

    const updated = await updateWorkshopOutboxItem(id, outboxId, {
      recipientName,
      status: "draft",
      boundaryResult: {
        ...boundaryResult,
        recipientUpdatedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ outbox: updated });
  } catch (error) {
    console.error("[WorkshopOutboxItemAPI] PATCH error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update outbox item",
      },
      { status: 500 },
    );
  }
}
