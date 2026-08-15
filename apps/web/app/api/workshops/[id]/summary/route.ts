import { auth } from "@/app/(auth)/auth";
import { getWorkSummarySnapshot } from "@/lib/work-runtime";
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
    const snapshot = await getWorkSummarySnapshot({
      userId: session.user.id,
      workId: id,
    });
    if (!snapshot) {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ...snapshot.detail,
      dashboard: snapshot.dashboard,
      interfaceVersion: snapshot.interfaceVersion,
      generatedAt: snapshot.generatedAt,
    });
  } catch (error) {
    console.error("[WorkshopSummaryAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workshop summary",
      },
      { status: 500 },
    );
  }
}
