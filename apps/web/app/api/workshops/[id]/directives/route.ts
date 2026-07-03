import { auth } from "@/app/(auth)/auth";
import {
  addWorkshopDirective,
  getWorkshop,
  listActiveDirectives,
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
    return NextResponse.json({ directives: await listActiveDirectives(id) });
  } catch (error) {
    console.error("[WorkshopDirectivesAPI] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load directives" },
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
    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    const directive = await addWorkshopDirective({
      workshopId: id,
      runId: body.runId ?? null,
      content,
      priority: Number(body.priority ?? 0),
      scope: body.scope ?? "current_run",
    });
    return NextResponse.json({ directive }, { status: 201 });
  } catch (error) {
    console.error("[WorkshopDirectivesAPI] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add directive" },
      { status: 500 },
    );
  }
}
