import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { listLoopDashboard } from "@/lib/loops";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const dashboard = await listLoopDashboard(session.user.id);
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[Loops] GET error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list loops",
      },
      { status: 500 },
    );
  }
}
