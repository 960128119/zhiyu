import { fetchDouyinPublisherHealth } from "@/lib/douyin/client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const health = await fetchDouyinPublisherHealth();
    return NextResponse.json(health);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Douyin publisher is unavailable.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
