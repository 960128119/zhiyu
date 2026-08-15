import { auth } from "@/app/(auth)/auth";
import { ensureWorkSelfAuditLoop } from "@/lib/work-runtime";
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
    const result = await ensureWorkSelfAuditLoop({
      userId: session.user.id,
      workId: id,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      cronExpression:
        typeof body.cronExpression === "string"
          ? body.cronExpression
          : undefined,
      source: "owner",
      reason: "Work self-audit upgrade requested.",
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("[WorkshopWorkUpgradeAPI] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to ensure Work self-audit loop",
      },
      { status: 400 },
    );
  }
}
