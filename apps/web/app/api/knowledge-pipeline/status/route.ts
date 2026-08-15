import { auth } from "@/app/(auth)/auth";
import { clearAIUserContext, setAIUserContextFromRequest } from "@/lib/ai";
import { getLightweightSchedulerStatus } from "@/lib/cron/scheduler-state";
import { runPendingInteractionProcessingJobs } from "@/lib/interactions/worker";
import {
  getInteractionIngestionStatus,
  runInteractionIngestion,
} from "@/lib/knowledge-pipeline/ingestion-runtime";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      scheduler: getLightweightSchedulerStatus(),
      ingestion: getInteractionIngestionStatus(session.user.id),
    });
  } catch (error) {
    console.error("[KnowledgePipelineStatusAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load knowledge pipeline status",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.action !== "run-now") {
      return NextResponse.json(
        { error: "Unsupported knowledge pipeline action" },
        { status: 400 },
      );
    }

    await setAIUserContextFromRequest({
      userId: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? session.user.displayName ?? null,
      userType: session.user.type,
      request,
      body: {
        ...body,
        cloudAuthToken: body.cloudAuthToken ?? session.cloudAuthToken,
      },
    });

    const ingestion = await runInteractionIngestion({
      userId: session.user.id,
      reason: "manual",
      force: true,
      limit: Number(body.limit ?? 50),
    });
    const processing = await runPendingInteractionProcessingJobs({
      userId: session.user.id,
      limit: Number(body.processingLimit ?? 20),
    });

    return NextResponse.json({
      scheduler: getLightweightSchedulerStatus(),
      ingestion,
      processing,
    });
  } catch (error) {
    console.error("[KnowledgePipelineStatusAPI] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run knowledge pipeline",
      },
      { status: 500 },
    );
  } finally {
    clearAIUserContext();
  }
}
