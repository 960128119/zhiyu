import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  listExternalFinalSendAdapters,
  listLoopApprovalReplayAdapters,
} from "@/lib/loops";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const replayAdapters = listLoopApprovalReplayAdapters();
    const finalSendAdapters = listExternalFinalSendAdapters();

    return NextResponse.json({
      adapters: replayAdapters,
      replayAdapters,
      finalSendAdapters,
    });
  } catch (error) {
    console.error("[LoopApprovals] Adapters error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to list replay adapters",
      },
      { status: 500 },
    );
  }
}
