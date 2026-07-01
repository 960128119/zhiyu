import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteLoop,
  getLoop,
  getLoopDashboardDetail,
  loopVerificationSchema,
  updateLoop,
} from "@/lib/loops";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const loop = await getLoopDashboardDetail(session.user.id, id);
    if (!loop) {
      return NextResponse.json({ error: "Loop not found" }, { status: 404 });
    }

    return NextResponse.json({ loop });
  } catch (error) {
    console.error("[Loops] GET by ID error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get loop" },
      { status: 500 },
    );
  }
}

const modelCheckerPatchSchema = z
  .object({
    modelChecker: z
      .object({
        enabled: z.boolean(),
        provider: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        maxInputChars: z.number().int().min(2_000).max(50_000).optional(),
      })
      .strict(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = modelCheckerPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid loop update" },
        { status: 400 },
      );
    }

    const existing = await getLoop(session.user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Loop not found" }, { status: 404 });
    }

    const verificationConfig = loopVerificationSchema.parse({
      ...existing.verificationConfig,
      modelChecker: parsed.data.modelChecker,
    });
    const updated = await updateLoop(session.user.id, id, {
      verificationConfig,
    });
    if (!updated) {
      return NextResponse.json({ error: "Loop not found" }, { status: 404 });
    }

    const loop = await getLoopDashboardDetail(session.user.id, id);
    return NextResponse.json({ loop });
  } catch (error) {
    console.error("[Loops] PATCH by ID error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update loop",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const deleted = await deleteLoop(session.user.id, id);
    if (!deleted) {
      return NextResponse.json({ error: "Loop not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Loops] DELETE by ID error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete loop",
      },
      { status: 500 },
    );
  }
}
