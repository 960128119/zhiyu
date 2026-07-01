/**
 * Feishu / DingTalk / QQ / WeChat listener initialization (Bot mode, not self mode)
 *
 * These platforms are all "user chatting with bot": openzhiyu listens to messages received by bot and replies on behalf.
 * This component only runs under Tauri, after session is ready, passes cloud_auth_token to backend,
 * for bot to call cloud AI when receiving user messages, and re-establishes WebSocket connection after app restart.
 */
"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getAuthToken } from "@/lib/auth/token-manager";

function shouldInitBotListeners() {
  if (typeof window === "undefined") return false;
  const isTauri = Boolean((window as any).__TAURI__);
  const isLocalDev =
    process.env.NODE_ENV === "development" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  return isTauri || isLocalDev;
}

export function FeishuListenerInit() {
  const { data: session, status } = useSession();
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!shouldInitBotListeners()) {
      return;
    }

    // Too long delay causes server-side WS to connect but token not yet injected; user sends Feishu message first will get 401
    initTimeoutRef.current = setTimeout(async () => {
      const userId = session?.user?.id;
      if (status === "loading") {
        return;
      }
      if (status !== "authenticated" || !userId) {
        return;
      }

      try {
        const cloudAuthToken = getAuthToken() || undefined;

        const response = await fetch("/api/feishu/listener/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloudAuthToken }),
        });
        if (!response.ok) {
          console.warn(
            "[FeishuListenerInit] Feishu listener init failed:",
            response.status,
          );
        }
      } catch {
        console.warn(
          "[FeishuListenerInit] Feishu listener init request failed",
        );
      }
    }, 400);

    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
    };
  }, [session?.user?.id, status]);

  return null;
}

export function DingTalkListenerInit() {
  const { data: session, status } = useSession();
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!shouldInitBotListeners()) {
      return;
    }

    initTimeoutRef.current = setTimeout(async () => {
      const userId = session?.user?.id;
      if (status === "loading") {
        return;
      }
      if (status !== "authenticated" || !userId) {
        return;
      }

      try {
        const cloudAuthToken = getAuthToken() || undefined;

        const response = await fetch("/api/dingtalk/listener/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloudAuthToken }),
        });
        if (!response.ok) {
          console.warn(
            "[FeishuListenerInit] DingTalk listener init failed:",
            response.status,
          );
        }
      } catch {
        console.warn(
          "[FeishuListenerInit] DingTalk listener init request failed",
        );
      }
    }, 3000);

    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
    };
  }, [session?.user?.id, status]);

  return null;
}

export function QQBotListenerInit() {
  const { data: session, status } = useSession();
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!shouldInitBotListeners()) {
      return;
    }

    initTimeoutRef.current = setTimeout(async () => {
      const userId = session?.user?.id;
      if (status === "loading") {
        return;
      }
      if (status !== "authenticated" || !userId) {
        return;
      }

      try {
        const cloudAuthToken = getAuthToken() || undefined;

        const response = await fetch("/api/qqbot/listener/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloudAuthToken }),
        });
        if (!response.ok) {
          console.warn(
            "[FeishuListenerInit] QQBot listener init failed:",
            response.status,
          );
        }
      } catch {
        console.warn("[FeishuListenerInit] QQBot listener init request failed");
      }
    }, 3000);

    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
    };
  }, [session?.user?.id, status]);

  return null;
}

export function WeixinListenerInit() {
  const { data: session, status } = useSession();
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!shouldInitBotListeners()) {
      return;
    }

    initTimeoutRef.current = setTimeout(async () => {
      const userId = session?.user?.id;
      if (status === "loading") {
        return;
      }
      if (status !== "authenticated" || !userId) {
        return;
      }

      try {
        const cloudAuthToken = getAuthToken() || undefined;

        const response = await fetch("/api/weixin/listener/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloudAuthToken }),
        });
        if (!response.ok) {
          console.warn(
            "[FeishuListenerInit] Weixin listener init failed:",
            response.status,
          );
        }
      } catch {
        console.warn(
          "[FeishuListenerInit] Weixin listener init request failed",
        );
      }
    }, 3000);

    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
    };
  }, [session?.user?.id, status]);

  return null;
}
