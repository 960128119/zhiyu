import { NextResponse, type NextRequest } from "next/server";
import { grantBrainAccess, listBrainGrants } from "@/lib/brain/service";
import { errorResponse, parseLimit, parseScope, requireBrainUser } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireBrainUser();
  if (user.error) return user.error;
  try {
    const params = request.nextUrl.searchParams;
    const grants = await listBrainGrants({
      userId: user.userId,
      limit: parseLimit(params.get("limit")),
      subjectType: params.get("subjectType") as any,
      subjectId: params.get("subjectId") ?? undefined,
    });
    return NextResponse.json({ grants });
  } catch (error) {
    return errorResponse(error, "Failed to list Brain grants");
  }
}

export async function POST(request: NextRequest) {
  const user = await requireBrainUser();
  if (user.error) return user.error;
  try {
    const body = await request.json();
    const grant = await grantBrainAccess({
      userId: user.userId,
      subjectType: body.subjectType ?? "work",
      subjectId: typeof body.subjectId === "string" ? body.subjectId : undefined,
      scope: parseScope(body.scope),
      permissions: Array.isArray(body.permissions) ? body.permissions : ["reference"],
      memoryTypes: Array.isArray(body.memoryTypes) ? body.memoryTypes : undefined,
      reason: typeof body.reason === "string" ? body.reason : null,
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : undefined,
    });
    return NextResponse.json({ grant });
  } catch (error) {
    return errorResponse(error, "Failed to create Brain grant");
  }
}
