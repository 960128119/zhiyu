import { auth } from "@/app/(auth)/auth";
import { sendWorkOutbox } from "@/lib/work-runtime";
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
    const result = await sendWorkOutbox({
      userId: session.user.id,
      workId: id,
      outboxId,
      source: "owner",
      reason: "Outbox send requested from workshop API.",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[WorkshopOutboxSendAPI] POST error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send outbox" },
      { status: 400 },
    );
  }
}
