import { auth } from "@/app/(auth)/auth";
import {
  getOwnerContext,
  listOwnerKnowledge,
  resetOwnerKnowledge,
} from "@/lib/owner-context/service";
import type { OwnerContextScene } from "@/lib/owner-context/types";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const scenes = new Set<OwnerContextScene>([
  "chat",
  "workshop",
  "loop",
  "task",
  "quant",
  "dashboard",
]);

function parseScene(value: string | null): OwnerContextScene | undefined {
  if (!value) return undefined;
  return scenes.has(value as OwnerContextScene)
    ? (value as OwnerContextScene)
    : undefined;
}

function parseStringArray(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const view = params.get("view") ?? "context";
    const limit = Number(params.get("limit") ?? 120);
    const query = params.get("query") ?? undefined;

    if (view === "dashboard") {
      const dashboard = await listOwnerKnowledge({
        userId: session.user.id,
        limit,
        query,
      });
      return NextResponse.json(dashboard);
    }

    const context = await getOwnerContext({
      userId: session.user.id,
      scene: parseScene(params.get("scene")),
      query,
      conversationId: params.get("conversationId") ?? undefined,
      relatedPeople: parseStringArray(params.get("people")),
      relatedEntities: parseStringArray(params.get("entities")),
      maxItems: limit,
    });
    return NextResponse.json(context);
  } catch (error) {
    console.error("[OwnerContextAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load owner context",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    if (action !== "reset_owner_knowledge") {
      return NextResponse.json(
        { error: "action must be reset_owner_knowledge" },
        { status: 400 },
      );
    }

    const result = await resetOwnerKnowledge({
      userId: session.user.id,
      reason:
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim()
          : "owner_context_reset",
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[OwnerContextAPI] DELETE error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reset owner context",
      },
      { status: 500 },
    );
  }
}
