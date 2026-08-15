import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { sendWechatDesktopMessage } from "@/lib/wechat-desktop/client";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const recipientName = body?.recipientName;
  const message = body?.message;
  const confirmToken = body?.confirmToken;

  if (
    typeof recipientName !== "string" ||
    typeof message !== "string" ||
    typeof confirmToken !== "string" ||
    !recipientName.trim() ||
    !message.trim() ||
    !confirmToken.trim()
  ) {
    return NextResponse.json(
      { error: "recipientName, message, and confirmToken are required." },
      { status: 400 },
    );
  }

  try {
    const result = await sendWechatDesktopMessage({
      recipientName,
      message,
      confirmToken,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
