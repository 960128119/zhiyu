import { auth } from "@/app/(auth)/auth";
import { getDouyinPublishDraft, prepareDouyinUpload } from "@/lib/douyin/client";
import { addWorkDirective, assertWorkAccess } from "@/lib/work-runtime";
import {
  appendWorkshopEvent,
} from "@/lib/workshops/service";
import { buildVideoRegenerationDirective } from "@/lib/workshops/video-review";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type VideoReviewAction = "approve" | "reject" | "regenerate";

function parseAction(value: unknown): VideoReviewAction | null {
  return value === "approve" || value === "reject" || value === "regenerate"
    ? value
    : null;
}

function actionTitle(action: VideoReviewAction) {
  if (action === "approve") return "视频已通过审核";
  if (action === "regenerate") return "视频要求重生成";
  return "视频已驳回";
}

function actionBody(action: VideoReviewAction, title: string) {
  if (action === "approve") {
    return `主人已审核通过《${title}》，系统已生成抖音上传计划，但不会自动发布。`;
  }
  if (action === "regenerate") {
    return `主人要求重生成《${title}》，投研视频发布官需要重新整理脚本、画面和风险提示。`;
  }
  return `主人已驳回《${title}》，该视频不进入上传流程。`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, draftId } = await params;
    try {
      await assertWorkAccess({ userId: session.user.id, workId: id });
    } catch {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      note?: unknown;
    };
    const action = parseAction(body.action);
    if (!action) {
      return NextResponse.json(
        { error: "action must be approve, reject or regenerate" },
        { status: 400 },
      );
    }

    const draftResult = await getDouyinPublishDraft(draftId);
    const draft = draftResult.draft;
    const reviewNote = typeof body.note === "string" ? body.note : null;
    const uploadPlan =
      action === "approve"
        ? await prepareDouyinUpload({ draftId, execute: false })
        : null;

    const event = await appendWorkshopEvent({
      workshopId: id,
      type:
        action === "approve"
          ? "video_review_approved"
          : action === "regenerate"
            ? "video_review_regenerate_requested"
            : "video_review_rejected",
      title: actionTitle(action),
      body: actionBody(action, draft.title),
      metadata: {
        kind: "douyin_video_review",
        action,
        draftId,
        draftTitle: draft.title,
        draftStatus: draft.status,
        videoPath: draft.video_path,
        topics: draft.topics,
        accountLabel: draft.account_label,
        note: reviewNote,
        uploadPlan: uploadPlan
          ? {
              ok: uploadPlan.ok,
              command: uploadPlan.command,
              publisherCliAvailable: uploadPlan.publisher_cli_available,
              message: uploadPlan.message,
            }
          : null,
      },
    });

    let directive = null;
    let run = null;
    let runError: string | null = null;

    if (action === "regenerate") {
      const content = buildVideoRegenerationDirective({
        draftTitle: draft.title,
        draftId,
        videoPath: draft.video_path,
        note: reviewNote,
      });
      const result = await addWorkDirective({
        userId: session.user.id,
        workId: id,
        content,
        priority: 100,
        scope: "current_run",
        triggerRun: true,
        source: "owner",
        reason: "Video regeneration requested from review surface.",
        triggerReason: {
          origin: "video_review_regenerate",
          reviewEventId: event.id,
          draftId,
          draftTitle: draft.title,
          videoPath: draft.video_path,
        },
      });
      directive = result.directive;
      run = result.run;
      runError = result.runError;
    }

    return NextResponse.json({
      ok: true,
      event,
      draft,
      uploadPlan,
      directive,
      run,
      runError,
    });
  } catch (error) {
    console.error("[WorkshopVideoReviewAPI] POST error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to review video",
      },
      { status: 400 },
    );
  }
}
