import { NextResponse, type NextRequest } from "next/server";
import { reviewBrainMemory } from "@/lib/brain/service";
import { errorResponse, requireBrainUser } from "../../../_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireBrainUser();
  if (user.error) return user.error;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const memory = await reviewBrainMemory({
      requester: { type: "chat", userId: user.userId, id: "brain-api" },
      memoryId: id,
      decision: body.decision === "confirmed" ? "confirmed" : "dismissed",
      reason: typeof body.reason === "string" ? body.reason : null,
    });
    return NextResponse.json({ memory });
  } catch (error) {
    return errorResponse(error, "Failed to review Brain candidate");
  }
}
