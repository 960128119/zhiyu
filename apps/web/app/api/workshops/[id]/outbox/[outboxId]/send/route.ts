import { auth } from "@/app/(auth)/auth";
import {
  getWorkshop,
  getWorkshopOutboxItem,
} from "@/lib/workshops/service";
import { sendWorkshopOutboxWechat } from "@/lib/workshops/outbox-wechat";
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
    if (outbox.status !== "pending_approval" && outbox.status !== "approved") {
      return NextResponse.json(
        { error: "Outbox item must be previewed before sending." },
        { status: 400 },
      );
    }

    const result = await sendWorkshopOutboxWechat({ workshop, outbox });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[WorkshopOutboxSendAPI] POST error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send outbox" },
      { status: 400 },
    );
  }
}
