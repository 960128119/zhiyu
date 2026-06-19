import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getLoopDashboardDetail, runNativeLoopOnce } from "@/lib/loops";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const body = await readJsonBody(request);
    const dryRun = body.dryRun !== false;

    const result = await runNativeLoopOnce({
      userId: session.user.id,
      loopId: id,
      triggeredBy: "manual",
      reason: {
        api: "/api/loops/[id]/execute",
        dryRun,
      },
      execute: dryRun
        ? undefined
        : async ({ loop, previousState, loopRun }) => {
            const { executeNativeLoopAgent } = await import(
              "@/lib/loops/native-executor"
            );
            return executeNativeLoopAgent({
              userId: session.user.id,
              loop,
              previousState,
              runId: loopRun.id,
            });
          },
    });
    const loop = await getLoopDashboardDetail(session.user.id, id);

    return NextResponse.json({ result, loop });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to execute loop";
    const status = message === "Loop not found" ? 404 : 400;

    console.error("[Loops] POST execute error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
