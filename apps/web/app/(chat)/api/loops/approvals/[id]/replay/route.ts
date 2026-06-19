import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { replayLoopApprovalContinuation } from "@/lib/loops";

export const dynamic = "force-dynamic";

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
    const body = (await request.json().catch(() => ({}))) as {
      confirmationToken?: string | null;
    };
    const result = await replayLoopApprovalContinuation({
      userId: session.user.id,
      approvalRequestId: id,
      confirmationToken: body.confirmationToken ?? null,
    });

    return NextResponse.json(result, {
      status: result.replayResult.status === "success" ? 200 : 409,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to replay loop approval continuation";
    const status =
      message.includes("not found")
        ? 404
        : message.includes("Only approved") || message.includes("no continuation")
          ? 409
          : 500;

    console.error("[LoopApprovals] Replay error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
