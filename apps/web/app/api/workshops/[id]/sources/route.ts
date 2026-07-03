import { auth } from "@/app/(auth)/auth";
import {
  addWorkshopSource,
  getWorkshop,
  listWorkshopSources,
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
    const workshop = await getWorkshop(session.user.id, id);
    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }
    return NextResponse.json({ sources: await listWorkshopSources(id) });
  } catch (error) {
    console.error("[WorkshopSourcesAPI] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load sources" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const workshop = await getWorkshop(session.user.id, id);
    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "manual");
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const source = await addWorkshopSource({
      workshopId: id,
      type: type as any,
      name,
      uri: body.uri ?? null,
      content: body.content ?? null,
      config: body.config ?? {},
      enabled: body.enabled ?? true,
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error("[WorkshopSourcesAPI] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add source" },
      { status: 500 },
    );
  }
}
