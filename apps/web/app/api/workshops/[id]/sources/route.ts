import { auth } from "@/app/(auth)/auth";
import {
  addWorkSource,
  listWorkSources,
} from "@/lib/work-runtime";
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
    return NextResponse.json({
      sources: await listWorkSources({ userId: session.user.id, workId: id }),
    });
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
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "manual");
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { source } = await addWorkSource({
      userId: session.user.id,
      workId: id,
      type: type as any,
      name,
      uri: body.uri ?? null,
      content: body.content ?? null,
      config: body.config ?? {},
      enabled: body.enabled ?? true,
      source: "owner",
      reason: "Source added from workshop API.",
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
