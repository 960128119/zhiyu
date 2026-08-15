import { auth } from "@/app/(auth)/auth";
import { startWorkRun } from "@/lib/work-runtime";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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
    const body = await request.json().catch(() => ({}));
    const { run, workshop } = await startWorkRun({
      userId: session.user.id,
      workId: id,
      triggerReason: body.triggerReason ?? { type: "manual" },
      source: "owner",
      reason: typeof body.reason === "string" ? body.reason : null,
    });

    return NextResponse.json({ run, workshop }, { status: 202 });
  } catch (error) {
    console.error("[WorkshopRunsAPI] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start workshop run" },
      { status: 500 },
    );
  }
}
