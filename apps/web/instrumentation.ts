export function register() {
  // Install audit interceptors: Only load in Node.js runtime, Edge Runtime does not support fs/child_process
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { installAuditInterceptors } = require("@openzhiyu/audit");
      installAuditInterceptors();
    } catch (e) {
      console.warn("[Audit] Failed to load audit interceptors:", e);
    }

    const importAtRuntime = (specifier: string): Promise<Record<string, any>> =>
      Function("specifier", "return import(specifier)")(specifier);

    // Start Feishu WebSocket listener (server mode only; Tauri with Telegram/iMessage only starts when frontend calls init with token)
    const isTauri =
      process.env.TAURI_MODE === "1" || process.env.IS_TAURI === "true";
    const shouldStartStartupListeners =
      process.env.ENABLE_STARTUP_LISTENERS === "true" ||
      (process.env.NODE_ENV === "production" && isTauri);

    if (isTauri && shouldStartStartupListeners) {
      // Load token from ~/.openzhiyu/token and pass it to listeners
      let token: string | undefined;
      try {
        const { homedir } = require("node:os");
        const { join } = require("node:path");
        const { existsSync, readFileSync } = require("node:fs");

        const tokenPath = join(homedir(), ".openzhiyu", "token");
        if (existsSync(tokenPath)) {
          const encoded = readFileSync(tokenPath, "utf-8").trim();
          if (encoded) {
            try {
              token =
                Buffer.from(encoded, "base64").toString("utf-8") || undefined;
              console.log(
                `[Instrumentation] Loaded auth token from ${tokenPath}, ` +
                  `length=${token?.length ?? 0}, valid=${token ? "yes" : "no"}`,
              );
            } catch {
              console.warn(
                "[Instrumentation] Failed to decode auth token from base64",
              );
            }
          } else {
            console.warn(
              "[Instrumentation] Auth token file exists but is empty",
            );
          }
        } else {
          console.warn(
            "[Instrumentation] Auth token file does not exist at",
            tokenPath,
          );
        }
      } catch (e) {
        console.warn("[Instrumentation] Failed to load auth token:", e);
      }

      importAtRuntime("./lib/integrations/feishu/ws-listener")
        .then(({ startAllFeishuListeners }) => {
          console.log(
            "[Instrumentation] Starting Feishu listeners with token:",
            token ? "yes" : "no",
          );
          startAllFeishuListeners(token);
        })
        .catch((e: unknown) =>
          console.warn("[Feishu] Failed to start listener:", e),
        );
      importAtRuntime("./lib/integrations/dingtalk/ws-listener")
        .then(({ startAllDingTalkListeners }) => startAllDingTalkListeners())
        .catch((e: unknown) =>
          console.warn("[DingTalk] Failed to start listener:", e),
        );
      importAtRuntime("./lib/integrations/qqbot/ws-listener")
        .then(({ startAllQQListeners }) => startAllQQListeners())
        .catch((e: unknown) =>
          console.warn("[QQBot] Failed to start listener:", e),
        );
      // Weixin listener is started on-demand by WeixinListenerInit (frontend component)
      // after user authentication, not here, to avoid duplicate poll loops.
    }
  }
}
