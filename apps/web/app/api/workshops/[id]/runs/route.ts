import { auth } from "@/app/(auth)/auth";
import { getWorkshop } from "@/lib/workshops/service";
import { startWorkshopRun } from "@/lib/workshops/runtime";
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
    const workshop = await getWorkshop(session.user.id, id);
    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const run = await startWorkshopRun({
      userId: session.user.id,
      workshopId: id,
      triggerReason: body.triggerReason ?? { type: "manual" },
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
