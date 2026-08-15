import {
  createDouyinPublishDraft,
  listDouyinPublishDrafts,
} from "@/lib/douyin/client";
import type { DouyinPublishDraftInput } from "@/lib/douyin/types";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const drafts = await listDouyinPublishDrafts();
    return NextResponse.json(drafts);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list Douyin drafts.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DouyinPublishDraftInput>;
    const result = await createDouyinPublishDraft({
      id: body.id ? String(body.id) : undefined,
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : undefined,
      topics: Array.isArray(body.topics)
        ? body.topics.map((item) => String(item))
        : [],
      video_path: String(body.video_path ?? ""),
      cover_path: body.cover_path ? String(body.cover_path) : undefined,
      scheduled_at: body.scheduled_at ? String(body.scheduled_at) : undefined,
      ai_generated: Boolean(body.ai_generated),
      account_label: body.account_label
        ? String(body.account_label)
        : undefined,
      source:
        body.source && typeof body.source === "object" && !Array.isArray(body.source)
          ? body.source
          : {},
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Douyin draft.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
