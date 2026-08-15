import { fetchQuantPaperAccount } from "@/lib/quant/client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const account = await fetchQuantPaperAccount();
    return NextResponse.json(account);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "模拟盘账户暂不可用";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
