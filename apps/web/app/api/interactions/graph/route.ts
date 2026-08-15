import { auth } from "@/app/(auth)/auth";
import { listInteractionGraphSnapshot } from "@/lib/interactions/graph";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const snapshot = await listInteractionGraphSnapshot({
      userId: session.user.id,
      entityLimit: Number(params.get("entityLimit") ?? 200),
      relationLimit: Number(params.get("relationLimit") ?? 160),
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[InteractionGraphAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load interaction graph",
      },
      { status: 500 },
    );
  }
}
