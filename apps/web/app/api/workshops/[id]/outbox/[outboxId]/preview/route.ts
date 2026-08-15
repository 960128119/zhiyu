import { auth } from "@/app/(auth)/auth";
import { previewWorkOutbox } from "@/lib/work-runtime";
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
    const result = await previewWorkOutbox({
      userId: session.user.id,
      workId: id,
      outboxId,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[WorkshopOutboxPreviewAPI] POST error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to preview outbox" },
      { status: 400 },
    );
  }
}
