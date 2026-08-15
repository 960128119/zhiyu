import { fetchQuantPaperFills } from "@/lib/quant/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const fills = await fetchQuantPaperFills(limit);
    return NextResponse.json(fills);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "模拟盘成交暂不可用";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
