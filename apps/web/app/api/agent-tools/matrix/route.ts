import { auth } from "@/app/(auth)/auth";
import { buildAgentToolMatrix } from "@/lib/agent-tools/matrix";
import type { AgentToolRuntime } from "@/lib/agent-tools/types";
import { getWorkshop } from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function parseRuntime(value: string | null): AgentToolRuntime {
  if (
    value === "chat" ||
    value === "workshop" ||
    value === "loop" ||
    value === "cron"
  ) {
    return value;
  }
  return "chat";
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const runtime = parseRuntime(request.nextUrl.searchParams.get("runtime"));
    const workshopId = request.nextUrl.searchParams.get("workshopId") ?? undefined;
    const workshop =
      runtime === "workshop" && workshopId
        ? await getWorkshop(session.user.id, workshopId)
        : null;

    if (runtime === "workshop" && workshopId && !workshop) {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      buildAgentToolMatrix({
        runtime,
        workshopId,
        workshop,
      }),
    );
  } catch (error) {
    console.error("[AgentToolMatrixAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load agent tool matrix",
      },
      { status: 500 },
    );
  }
}
