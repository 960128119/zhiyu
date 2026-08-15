import { auth } from "@/app/(auth)/auth";
import { updateWorkOutboxRecipient } from "@/lib/work-runtime";
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
    const body = await request.json();
    const recipientName =
      typeof body.recipientName === "string"
        ? body.recipientName.trim() || null
        : null;
    const { outbox } = await updateWorkOutboxRecipient({
      userId: session.user.id,
      workId: id,
      outboxId,
      recipientName,
      source: "owner",
      reason: "Outbox recipient updated from workshop API.",
    });

    return NextResponse.json({ outbox });
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
