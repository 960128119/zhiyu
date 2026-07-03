import { auth } from "@/app/(auth)/auth";
import {
  createWorkshop,
  listWorkshops,
} from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workshops = await listWorkshops(session.user.id);
    return NextResponse.json({ workshops });
  } catch (error) {
    console.error("[WorkshopsAPI] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load workshops" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const mission = String(body.mission ?? "").trim();

    if (!name || !mission) {
      return NextResponse.json(
        { error: "name and mission are required" },
        { status: 400 },
      );
    }

    const workshop = await createWorkshop({
      userId: session.user.id,
      name,
      mission,
      autonomyLevel: body.autonomyLevel ?? "draft",
      boundaryPolicy: body.boundaryPolicy ?? {},
      modelConfig: body.modelConfig ?? {},
    });

    return NextResponse.json({ workshop }, { status: 201 });
  } catch (error) {
    console.error("[WorkshopsAPI] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create workshop" },
      { status: 500 },
    );
  }
}
