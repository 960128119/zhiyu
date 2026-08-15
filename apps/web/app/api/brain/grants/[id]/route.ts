import { NextResponse, type NextRequest } from "next/server";
import { revokeBrainAccess } from "@/lib/brain/service";
import { errorResponse, requireBrainUser } from "../../_shared";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireBrainUser();
  if (user.error) return user.error;
  try {
    const { id } = await params;
    const result = await revokeBrainAccess({
      userId: user.userId,
      grantId: id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Failed to revoke Brain grant");
  }
}
