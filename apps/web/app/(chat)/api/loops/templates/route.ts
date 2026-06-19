import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createLoopFromTemplate, listLoopTemplates } from "@/lib/loops";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    return NextResponse.json({ templates: listLoopTemplates() });
  } catch (error) {
    console.error("[LoopTemplates] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to list loop templates",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const loop = await createLoopFromTemplate({
      ...body,
      userId: session.user.id,
    });

    return NextResponse.json({ loop }, { status: 201 });
  } catch (error) {
    console.error("[LoopTemplates] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create loop from template",
      },
      { status: 400 },
    );
  }
}
