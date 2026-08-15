"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AvatarDisplay,
  getAvatarConfigByState,
  AvatarState,
} from "@/components/agent-avatar";

/**
 * App Status type
 */
type AppStatusState = "starting" | "downloading" | "running" | "error";

/**
 * Server status payload from backend
 */
interface ServerStatusPayload {
  running: boolean;
  status: string;
  error_message: string | null;
  node_version: string | null;
}

/**
 * Minimum time (ms) to show the startup screen, even if server is already ready.
 * This ensures users always see the startup animation on cold start.
 */
const MIN_SHOW_DURATION = 800;

/**
 * Startup screen component
 * Displays a friendly loading UI while the app is starting up.
 *
 * Always renders immediately in Tauri production — no `mounted` guard that
 * delays the first paint, so the startup screen appears before React hydrates.
 */
export function AppStartupScreen() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AppStatusState>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [showScreen, setShowScreen] = useState(false);

  // Minimum display timer — ensures the screen stays visible for at least MIN_SHOW_DURATION
  const [minTimerDone, setMinTimerDone] = useState(false);

  useEffect(() => {
    setShowScreen(false);
    setStatus("running");
    setMinTimerDone(true);
  }, []);

  // Hide the startup screen once backend is running AND minimum display time has passed.
  const isReady = status === "running" && minTimerDone;
  if (!showScreen || isReady) {
    return null;
  }

  // Get corresponding Avatar state
  const getAvatarState = (): AvatarState => {
    switch (status) {
      case "starting":
      case "downloading":
        return AvatarState.REFRESHING;
      case "error":
        return AvatarState.DEFAULT;
      default:
        return AvatarState.DEFAULT;
    }
  };

  const avatarConfig = getAvatarConfigByState(getAvatarState());

  // Render status description
  const getStatusDescription = () => {
    switch (status) {
      case "starting":
        return t("toast.appStarting");
      case "downloading":
        return t("toast.appDownloading");
      case "error":
        // Show the main error line (before the "|" separator), or the full message if no separator
        return errorMessage?.split("|")[0]?.trim() || t("common.error");
      default:
        return "";
    }
  };

  const handleRetry = async () => {
    setIsRestarting(true);
    setErrorMessage(null);
    setStatus("starting");
    setStatus("running");
    setIsRestarting(false);
  };

  return (
    <div
      suppressHydrationWarning
      className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]"
    >
      {/* Avatar */}
      <div className="mb-6">
        <AvatarDisplay
          config={avatarConfig}
          className="w-[120px] h-[120px]"
          enableInteractions={false}
        />
      </div>

      {/* Status description */}
      {status === "error" && errorMessage?.includes("Download Node.js:") ? (
        <div className="text-sm text-muted-foreground text-center max-w-[360px]">
          <p className="mb-1">{errorMessage.split("|")[0]?.trim()}</p>
          {errorMessage.includes("|") && (
            <p className="mb-3 text-xs text-red-400 font-mono max-w-[340px] break-all">
              {errorMessage.split("|")[1]?.split("(")[0]?.trim()}
              {errorMessage.includes("exit code:") && (
                <span className="text-orange-400">
                  {" "}
                  ({errorMessage.match(/\(exit code: \d+\)/)?.[0]})
                </span>
              )}
            </p>
          )}
          <a
            href={errorMessage.split("Download Node.js:")[1]?.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:opacity-80 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            Click here to download Node.js
          </a>
        </div>
      ) : status === "error" ? (
        <div className="text-sm text-muted-foreground text-center max-w-[320px]">
          <p>{errorMessage}</p>
        </div>
      ) : (
        <h1 className="text-sm text-muted-foreground text-center max-w-[280px]">
          {getStatusDescription()}
        </h1>
      )}

      {/* Loading animation - only shown when not in error state */}
      {status !== "error" && (
        <div className="mt-6">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Error state shows retry button */}
      {status === "error" && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRestarting}
          className="mt-6 px-6 py-2 text-sm font-medium text-white bg-primary rounded-lg cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isRestarting ? t("toast.appStarting") : t("common.reconnect")}
        </button>
      )}
    </div>
  );
}
