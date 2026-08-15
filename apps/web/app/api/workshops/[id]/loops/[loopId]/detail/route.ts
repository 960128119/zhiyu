import { auth } from "@/app/(auth)/auth";
import { getWorkLoopDetail } from "@/lib/work-runtime";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; loopId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, loopId } = await params;
    const detail = await getWorkLoopDetail({
      userId: session.user.id,
      workId: id,
      loopId,
    });

    if (!detail) {
      return NextResponse.json(
        { error: "Workshop loop not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[WorkshopLoopDetailAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workshop loop detail",
      },
      { status: 500 },
    );
  }
}
