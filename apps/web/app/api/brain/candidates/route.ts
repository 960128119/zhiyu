import { NextResponse, type NextRequest } from "next/server";
import { createBrainMemoryCandidate, listBrainCandidates } from "@/lib/brain/service";
import { errorResponse, parseLimit, parseScope, requireBrainUser } from "../_shared";
import type { BrainMemory } from "@/lib/brain";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireBrainUser();
  if (user.error) return user.error;
  try {
    const params = request.nextUrl.searchParams;
    const candidates = await listBrainCandidates({
      userId: user.userId,
      limit: parseLimit(params.get("limit")),
      ownerType: (params.get("ownerType") as BrainMemory["ownerType"]) ?? undefined,
      ownerId: params.get("ownerId") ?? undefined,
    });
    return NextResponse.json({ candidates });
  } catch (error) {
    return errorResponse(error, "Failed to list Brain candidates");
  }
}

export async function POST(request: NextRequest) {
  const user = await requireBrainUser();
  if (user.error) return user.error;
  try {
    const body = await request.json();
    const candidate = await createBrainMemoryCandidate({
      requester: { type: "chat", userId: user.userId, id: "brain-api" },
      scope: parseScope(body.scope),
      ownerType: body.ownerType ?? "chat",
      ownerId: body.ownerId ?? user.userId,
      memoryType: body.memoryType ?? "fact",
      subject: String(body.subject ?? "Candidate"),
      content: String(body.content ?? ""),
      confidence: Number(body.confidence ?? 50),
      evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
    });
    return NextResponse.json({ candidate });
  } catch (error) {
    return errorResponse(error, "Failed to create Brain candidate");
  }
}
