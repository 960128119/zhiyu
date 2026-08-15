import { checkDouyinAccount } from "@/lib/douyin/client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await checkDouyinAccount({ execute: false });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Douyin check plan.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      execute?: boolean;
    };
    const result = await checkDouyinAccount({ execute: Boolean(body.execute) });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check Douyin account.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
