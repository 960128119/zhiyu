import { auth } from "@/app/(auth)/auth";
import { getWorkToolMatrix } from "@/lib/work-runtime";
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
    const matrix = await getWorkToolMatrix({
      userId: session.user.id,
      workId: id,
    });
    if (!matrix) {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(matrix);
  } catch (error) {
    console.error("[WorkshopToolsAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workshop tool matrix",
      },
      { status: 500 },
    );
  }
}
