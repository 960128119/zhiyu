import { auth } from "@/app/(auth)/auth";
import { getDouyinPublishDraft } from "@/lib/douyin/client";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const GENERATED_VIDEO_ROOT = resolve(homedir(), ".openzhiyu", "generated-videos");

function isInside(root: string, candidate: string) {
  const rel = relative(root, candidate);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;
  const startText = match[1];
  const endText = match[2];
  if (!startText && endText) {
    const suffixLength = Number.parseInt(endText, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }
  const start = startText ? Number.parseInt(startText, 10) : 0;
  const end = endText ? Number.parseInt(endText, 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }
  return {
    start: Math.max(0, start),
    end: Math.min(size - 1, end),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { draftId } = await context.params;
    const result = await getDouyinPublishDraft(draftId);
    const videoPath = resolve(String(result.draft.video_path ?? ""));
    if (!isInside(GENERATED_VIDEO_ROOT, videoPath)) {
      return NextResponse.json(
        { error: "Video path is outside generated video storage." },
        { status: 403 },
      );
    }

    const fileStat = await stat(videoPath);
    const range = parseRange(request.headers.get("range"), fileStat.size);
    const file = await readFile(videoPath);
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Content-Type": "video/mp4",
    });

    if (range) {
      const chunk = file.subarray(range.start, range.end + 1);
      headers.set("Content-Length", String(chunk.length));
      headers.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${fileStat.size}`,
      );
      return new Response(chunk, { status: 206, headers });
    }

    headers.set("Content-Length", String(file.length));
    return new Response(file, { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load video.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
