/**
 * Scheduled Jobs API
 * GET /api/scheduled-jobs - List all jobs
 * POST /api/scheduled-jobs - Disabled; create native loops instead
 */

import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { listJobs } from "@/lib/cron/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const includeDisabled = url.searchParams.get("includeDisabled") === "true";
    const view = (url.searchParams.get("view") || "all") as
      | "all"
      | "active"
      | "executed";

    const jobs = await listJobs(session.user.id, { includeDisabled, view });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("[ScheduledJobs] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list jobs" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          "Legacy scheduled jobs are disabled. Create a native Zhiyu Loop via /api/loops/natural-language.",
      },
      { status: 410 },
    );
  } catch (error) {
    console.error("[ScheduledJobs] POST error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create job",
      },
      { status: 500 },
    );
  }
}
