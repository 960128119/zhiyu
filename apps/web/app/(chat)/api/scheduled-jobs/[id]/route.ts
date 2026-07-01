/**
 * Single Scheduled Job API
 * GET /api/scheduled-jobs/[id] - Get a job
 * PATCH /api/scheduled-jobs/[id] - Update a job
 * DELETE /api/scheduled-jobs/[id] - Delete a job
 * POST /api/scheduled-jobs/[id]/execute - Manually execute a job
 */

import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getJob,
  updateJob,
  deleteJob as deleteCronJob,
  toggleJob,
} from "@/lib/cron/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const job = await getJob(session.user.id, id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error("[ScheduledJobs] GET by ID error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get job" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { id } = await params;

    const updatedJob = await updateJob(session.user.id, id, body);

    return NextResponse.json({ job: updatedJob });
  } catch (error) {
    console.error("[ScheduledJobs] PATCH error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update job",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    await deleteCronJob(session.user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ScheduledJobs] DELETE error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete job",
      },
      { status: 500 },
    );
  }
}

// POST for actions like execute, enable, disable
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const { id } = await params;

    if (action === "execute") {
      return NextResponse.json(
        {
          error:
            "Legacy scheduled job execution is disabled. Run native OpenZhiyu Loops from /loops.",
        },
        { status: 410 },
      );
    }

    if (action === "enable") {
      const updatedJob = await toggleJob(session.user.id, id, true);
      return NextResponse.json({ job: updatedJob });
    }

    if (action === "disable") {
      const updatedJob = await toggleJob(session.user.id, id, false);
      return NextResponse.json({ job: updatedJob });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[ScheduledJobs] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to perform action",
      },
      { status: 500 },
    );
  }
}
