import { type NextRequest, NextResponse } from "next/server";

/**
 * Session File API
 * Used to sync session to file in Tauri mode
 * proxy.ts reads session from file for permission verification
 */

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: "Desktop session files are disabled in the web-only build." },
    { status: 410 },
  );
}
