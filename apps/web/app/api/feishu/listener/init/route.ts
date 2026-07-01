/**
 * Feishu WebSocket listener initialization
 * Called by frontend after user authorizes Feishu, establishes long connections for all Feishu accounts under the user
 * Desktop/local web can pass cloudAuthToken for AI authentication when handling incoming messages.
 */
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { startFeishuListenersForUser } from "@/lib/integrations/feishu/ws-listener";
import { setCloudAuthToken } from "@/lib/auth/token-manager";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("FeishuListenerInit");

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Desktop/local web: frontend passes cloud auth token so restarted
    // listener connections can call the AI service for inbound messages.
    let authToken: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      authToken =
        typeof body?.cloudAuthToken === "string"
          ? body.cloudAuthToken.trim() || undefined
          : undefined;
      if (authToken) setCloudAuthToken(authToken);
    } catch {
      // Ignore when no body or not JSON
    }

    logger.info(`Feishu listener init, userId=${session.user.id}`);
    await startFeishuListenersForUser(session.user.id, authToken);

    return NextResponse.json({
      success: true,
      message: "Lark/Feishu listener(s) started",
    });
  } catch (error) {
    logger.error("Feishu listener init failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Initialization failed",
      },
      { status: 500 },
    );
  }
}
