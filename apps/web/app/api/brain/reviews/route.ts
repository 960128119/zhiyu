import { NextResponse, type NextRequest } from "next/server";
import { listBrainReviews } from "@/lib/brain/service";
import { errorResponse, parseLimit, requireBrainUser } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireBrainUser();
  if (user.error) return user.error;
  try {
    const params = request.nextUrl.searchParams;
    const reviews = await listBrainReviews({
      userId: user.userId,
      memoryId: params.get("memoryId") ?? undefined,
      limit: parseLimit(params.get("limit")),
    });
    return NextResponse.json({ reviews });
  } catch (error) {
    return errorResponse(error, "Failed to list Brain reviews");
  }
}
