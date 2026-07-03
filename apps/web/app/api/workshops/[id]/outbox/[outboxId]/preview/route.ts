import { auth } from "@/app/(auth)/auth";
import {
  getWorkshop,
  getWorkshopOutboxItem,
} from "@/lib/workshops/service";
import { previewWorkshopOutboxWechat } from "@/lib/workshops/outbox-wechat";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
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

    const result = await previewWorkshopOutboxWechat({ workshop, outbox });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[WorkshopOutboxPreviewAPI] POST error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to preview outbox" },
      { status: 400 },
    );
  }
}
