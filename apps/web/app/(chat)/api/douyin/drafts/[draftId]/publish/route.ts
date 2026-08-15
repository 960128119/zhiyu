import { publishDouyinDraft } from "@/lib/douyin/client";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      execute?: boolean;
    };
    const result = await publishDouyinDraft({
      draftId,
      execute: Boolean(body.execute),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to publish Douyin draft.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
