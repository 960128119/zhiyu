import { auth } from "@/app/(auth)/auth";
import {
  getWorkshopDetail,
  updateWorkshop,
} from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const detail = await getWorkshopDetail(session.user.id, id);
    if (!detail) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[WorkshopAPI] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load workshop" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const workshop = await updateWorkshop(session.user.id, id, {
      name: body.name,
      mission: body.mission,
      status: body.status,
      autonomyLevel: body.autonomyLevel,
      boundaryPolicy: body.boundaryPolicy,
      modelConfig: body.modelConfig,
    });

    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }

    return NextResponse.json({ workshop });
  } catch (error) {
    console.error("[WorkshopAPI] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update workshop" },
      { status: 500 },
    );
  }
}
