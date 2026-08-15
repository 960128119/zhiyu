import { auth } from "@/app/(auth)/auth";
import { listWorkEvents } from "@/lib/work-runtime";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const after = request.nextUrl.searchParams.get("after");
    const events = await listWorkEvents({
      userId: session.user.id,
      workId: id,
      afterSeq: after ? Number(after) : undefined,
      limit: Number(request.nextUrl.searchParams.get("limit") ?? 100),
      order: after ? "asc" : "latest",
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[WorkshopEventsAPI] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load workshop events" },
      { status: 500 },
    );
  }
}
