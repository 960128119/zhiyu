"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@openzhiyu/ui";
import { Spinner } from "@/components/spinner";
import { toast } from "@/components/toast";
import {
  invalidateDiskUsage,
  invalidateSessions,
  useDiskUsage,
  useSessions,
} from "@/hooks/use-disk-usage";

/**
 * Format byte count as human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Number.parseFloat((bytes / 1024 ** idx).toFixed(1))} ${units[idx]}`;
}

/**
 * Map storage categories to localized labels.
 */
function useStorageCategoryLabel() {
  const { t } = useTranslation();
  return useMemo(
    () => (key: string) => {
      const labels: Record<string, string> = {
        sessions: t("workspace.storageCategory.sessions", "Sessions"),
        logs: t("workspace.storageCategory.logs", "Logs"),
        cache: t("workspace.storageCategory.cache", "Cache"),
        storage: t("workspace.storageCategory.storage", "Storage"),
        database: t("workspace.storageCategory.database", "Database"),
        skills: t("workspace.storageCategory.skills", "Skills"),
        "agent-browser": t(
          "workspace.storageCategory.agent-browser",
          "Agent browser",
        ),
      };
      return labels[key] ?? key;
    },
    [t],
  );
}

/**
 * Return visual color style for storage category.
 */
function getStorageCategoryColorClass(key: string): string {
  const colorMap: Record<string, string> = {
    sessions: "bg-red-400",
    logs: "bg-orange-400",
    cache: "bg-amber-400",
    storage: "bg-zinc-500",
    database: "bg-zinc-400",
    skills: "bg-zinc-300",
    "agent-browser": "bg-zinc-300",
  };
  return colorMap[key] ?? "bg-zinc-300";
}

/**
 * Calculate category percentage of total usage, with minimum visible width preserved.
 */
function getCategoryPercent(sizeBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  const raw = (sizeBytes / totalBytes) * 100;
  return Math.max(raw, 1.2);
}

interface StorageManagementPanelProps {
  onRefresh?: () => void;
}

type StoragePathInfo = {
  path: string;
  exists: boolean;
  isDirectory?: boolean;
  sizeBytes?: number | null;
  modifiedAt?: string;
};

type StorageDiagnostics = {
  mode: "tauri_sqlite" | "server_postgres";
  isTauriMode: boolean;
  env: Record<string, boolean | string | null>;
  database:
    | StoragePathInfo
    | {
        url: string;
      };
  paths: null | {
    data: StoragePathInfo;
    storage: StoragePathInfo;
    logs: StoragePathInfo;
  };
  coreTables?: Array<{
    key: string;
    label: string;
    count: number | null;
    error?: string;
  }>;
  externalStores?: {
    quant?: {
      available: boolean;
      url: string;
      error?: string;
      diagnostics?: {
        provider: string;
        paper_trading_enabled: boolean;
        files: Record<
          string,
          {
            path: string;
            exists: boolean;
            is_file?: boolean;
            size_bytes?: number | null;
            modified_at?: string;
          }
        >;
        counts: {
          watchlist_codes: number;
          orders: number;
          fills: number;
          positions: number;
        };
      };
    };
  };
};

function isPathInfo(value: StorageDiagnostics["database"]): value is StoragePathInfo {
  return "path" in value;
}

function boolLabel(value: unknown) {
  return value ? "是" : "否";
}

function PathDiagnosticBlock({
  title,
  info,
}: {
  title: string;
  info: StoragePathInfo;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 font-medium text-foreground">{title}</div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <div className="break-all">
          路径：<span className="text-foreground">{info.path}</span>
        </div>
        <div>
          存在：<span className="text-foreground">{boolLabel(info.exists)}</span>
        </div>
        <div>
          类型：
          <span className="text-foreground">
            {info.exists ? (info.isDirectory ? "目录" : "文件") : "-"}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Storage management panel: displays disk usage and provides cleanup entry.
 */
export function StorageManagementPanel({
  onRefresh,
}: StorageManagementPanelProps) {
  const { t } = useTranslation();
  const getLabel = useStorageCategoryLabel();
  const { data: overview, refresh: refreshOverview } = useDiskUsage();
  const { data: sessions } = useSessions();
  const [confirmClean, setConfirmClean] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(
    null,
  );
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const totalBytes = overview?.totalBytes ?? 0;
  const overviewCategories = (overview?.categories ?? []).filter(
    (item) => item.key !== "agent-browser",
  );
  const sessionsCategory = overviewCategories.find(
    (item) => item.key === "sessions",
  );

  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const response = await fetch("/api/storage/diagnostics", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("诊断信息读取失败");
      }
      const payload = (await response.json()) as StorageDiagnostics;
      setDiagnostics(payload);
    } catch (error) {
      setDiagnosticsError(
        error instanceof Error ? error.message : "诊断信息读取失败",
      );
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  /**
   * Clean up storage data for specified category.
   */
  const handleCleanCategory = async (category: string) => {
    setCleaning(true);
    try {
      const response = await fetch("/api/storage/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!response.ok) {
        throw new Error("Cleanup failed");
      }
      await refreshOverview();
      invalidateSessions();
      onRefresh?.();
      toast({
        type: "success",
        description: t("workspace.storageDeleted", "Deleted successfully"),
      });
    } catch {
      toast({
        type: "error",
        description: t("workspace.storageCleanupFailed", "Cleanup failed"),
      });
    } finally {
      setCleaning(false);
      setConfirmClean(null);
    }
  };

  /**
   * Delete all session data and refresh usage statistics.
   */
  const handleDeleteAllSessions = async () => {
    setCleaning(true);
    try {
      const response = await fetch("/api/storage/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      if (!response.ok) {
        throw new Error("Delete failed");
      }
      invalidateSessions();
      invalidateDiskUsage();
      onRefresh?.();
      toast({
        type: "success",
        description: t("workspace.storageDeleted", "Deleted successfully"),
      });
    } catch {
      toast({
        type: "error",
        description: t("workspace.storageCleanupFailed", "Cleanup failed"),
      });
    } finally {
      setCleaning(false);
      setConfirmClean(null);
    }
  };

  return (
    <>
      <div className="w-full max-w-none space-y-3">
        <div className="mb-4 w-full rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-base font-semibold text-foreground">
                  数据位置诊断
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  查看当前页面实际连接的数据库、数据目录和文件目录。
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start sm:self-center"
                onClick={() => void loadDiagnostics()}
                disabled={diagnosticsLoading}
              >
                {diagnosticsLoading ? <Spinner size={16} /> : "刷新"}
              </Button>
            </div>

            {diagnosticsError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {diagnosticsError}
              </div>
            ) : null}

            {diagnostics ? (
              <div className="grid gap-3 text-sm lg:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="mb-2 font-medium text-foreground">
                    运行模式
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    <div>
                      类型：
                      <span className="text-foreground">
                        {diagnostics.isTauriMode
                          ? "桌面本地 SQLite"
                          : "服务端 Postgres"}
                      </span>
                    </div>
                    <div>
                      IS_TAURI：
                      <span className="text-foreground">
                        {String(diagnostics.env.IS_TAURI ?? "未设置")}
                      </span>
                    </div>
                    <div>
                      TAURI_DB_PATH 显式设置：
                      <span className="text-foreground">
                        {boolLabel(diagnostics.env.TAURI_DB_PATH_SET)}
                      </span>
                    </div>
                    <div>
                      TAURI_DATA_DIR 显式设置：
                      <span className="text-foreground">
                        {boolLabel(diagnostics.env.TAURI_DATA_DIR_SET)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="mb-2 font-medium text-foreground">
                    主数据库
                  </div>
                  {isPathInfo(diagnostics.database) ? (
                    <div className="space-y-1 text-muted-foreground">
                      <div className="break-all">
                        路径：
                        <span className="text-foreground">
                          {diagnostics.database.path}
                        </span>
                      </div>
                      <div>
                        文件存在：
                        <span className="text-foreground">
                          {boolLabel(diagnostics.database.exists)}
                        </span>
                      </div>
                      <div>
                        大小：
                        <span className="text-foreground">
                          {diagnostics.database.sizeBytes != null
                            ? formatBytes(diagnostics.database.sizeBytes)
                            : "-"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 text-muted-foreground">
                      <div className="break-all">
                        地址：
                        <span className="text-foreground">
                          {diagnostics.database.url || "未配置"}
                        </span>
                      </div>
                      <div>
                        POSTGRES_URL：
                        <span className="text-foreground">
                          {boolLabel(diagnostics.env.POSTGRES_URL_SET)}
                        </span>
                      </div>
                      <div>
                        DATABASE_URL：
                        <span className="text-foreground">
                          {boolLabel(diagnostics.env.DATABASE_URL_SET)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {diagnostics.paths ? (
                  <>
                    <PathDiagnosticBlock title="数据目录" info={diagnostics.paths.data} />
                    <PathDiagnosticBlock
                      title="文件存储目录"
                      info={diagnostics.paths.storage}
                    />
                    <PathDiagnosticBlock title="日志目录" info={diagnostics.paths.logs} />
                  </>
                ) : null}

                {diagnostics.coreTables?.length ? (
                  <div className="rounded-md border border-border bg-muted/20 p-3 lg:col-span-2">
                    <div className="mb-2 font-medium text-foreground">
                      核心数据数量
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {diagnostics.coreTables.map((item) => (
                        <div
                          key={item.key}
                          className="rounded-md border border-border bg-background px-3 py-2"
                        >
                          <div className="text-sm font-medium text-foreground">
                            {item.label}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {item.error
                              ? "读取失败"
                              : `${item.count ?? 0} 条`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {diagnostics.externalStores?.quant ? (
                  <div className="rounded-md border border-border bg-muted/20 p-3 lg:col-span-2">
                    <div className="mb-2 font-medium text-foreground">
                      量化服务存储
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="break-all">
                        服务地址：
                        <span className="text-foreground">
                          {diagnostics.externalStores.quant.url}
                        </span>
                      </div>
                      <div>
                        状态：
                        <span className="text-foreground">
                          {diagnostics.externalStores.quant.available
                            ? "可用"
                            : "不可用"}
                        </span>
                      </div>
                      {diagnostics.externalStores.quant.error ? (
                        <div className="break-all text-destructive">
                          {diagnostics.externalStores.quant.error}
                        </div>
                      ) : null}
                      {diagnostics.externalStores.quant.diagnostics ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-border bg-background px-3 py-2">
                            <div className="font-medium text-foreground">
                              自选股
                            </div>
                            <div className="mt-1">
                              {diagnostics.externalStores.quant.diagnostics.counts.watchlist_codes} 只
                            </div>
                            <div className="mt-1 break-all text-xs">
                              {
                                diagnostics.externalStores.quant.diagnostics.files
                                  .watchlist?.path
                              }
                            </div>
                          </div>
                          <div className="rounded-md border border-border bg-background px-3 py-2">
                            <div className="font-medium text-foreground">
                              模拟盘
                            </div>
                            <div className="mt-1">
                              {
                                diagnostics.externalStores.quant.diagnostics.counts
                                  .orders
                              }{" "}
                              笔订单 /{" "}
                              {
                                diagnostics.externalStores.quant.diagnostics.counts
                                  .fills
                              }{" "}
                              笔成交
                            </div>
                            <div className="mt-1 break-all text-xs">
                              {
                                diagnostics.externalStores.quant.diagnostics.files
                                  .paper_account?.path
                              }
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : diagnosticsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size={16} />
                正在读取诊断信息
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-4 w-full rounded-xl border border-border bg-muted/30 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-foreground">
                  {t("settings.storageBreakdownTitle", "Storage Breakdown")}
                </span>
              </div>
              <span className="text-[14px] font-normal text-muted-foreground">
                {overview ? formatBytes(totalBytes) : "..."}
              </span>
            </div>

            <div className="h-4 w-full overflow-hidden rounded-md bg-zinc-200">
              {overview && totalBytes > 0 ? (
                <div className="flex h-full w-full">
                  {overviewCategories
                    .filter((item) => item.sizeBytes > 0)
                    .map((item) => (
                      <div
                        key={`bar-${item.key}`}
                        className={getStorageCategoryColorClass(item.key)}
                        style={{
                          width: `${getCategoryPercent(item.sizeBytes, totalBytes)}%`,
                        }}
                      />
                    ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {overviewCategories
                .filter((item) => item.sizeBytes > 0)
                .map((item) => (
                  <div
                    key={`legend-${item.key}`}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                  >
                    <span
                      className={`inline-block size-2.5 rounded-full ${getStorageCategoryColorClass(item.key)}`}
                    />
                    <span>{getLabel(item.key)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="w-full px-1 sm:px-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0 space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {t("workspace.storageCategory.sessions", "Sessions")}
              </span>
              <span className="block text-sm text-muted-foreground">
                {`${formatBytes(sessionsCategory?.sizeBytes ?? 0)} (${sessions.length})`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start sm:self-center"
                onClick={() => setConfirmClean("browser-temp")}
                disabled={cleaning}
              >
                {t("workspace.storageCleanBrowserTemp", "Clear cache")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start sm:self-center text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setConfirmClean("sessions")}
                disabled={cleaning}
              >
                {t("workspace.storageDeleteAllSessions", "Delete all sessions")}
              </Button>
            </div>
          </div>
        </div>

        {overviewCategories
          .filter((item) => item.key !== "sessions")
          .map((item) => (
            <div key={item.key} className="w-full px-1 sm:px-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0 space-y-1">
                  <span className="block text-sm font-medium text-foreground">
                    {getLabel(item.key)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {formatBytes(item.sizeBytes)}
                  </span>
                </div>
                {["sessions", "logs", "cache"].includes(item.key) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => setConfirmClean(item.key)}
                    disabled={cleaning}
                  >
                    {t("workspace.storageCleanup", "Cleanup")}
                  </Button>
                )}
              </div>
            </div>
          ))}
      </div>

      <AlertDialog
        open={confirmClean !== null}
        onOpenChange={(open) => !open && setConfirmClean(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.storageCleanup", "Cleanup")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmClean === "sessions"
                ? t(
                    "workspace.storageConfirmDeleteAll",
                    "Are you sure you want to delete all sessions? This action cannot be undone.",
                  )
                : confirmClean === "browser-temp"
                  ? t(
                      "workspace.storageConfirmBrowserTemp",
                      "Are you sure you want to clear browser temp files from all sessions? This action cannot be undone.",
                    )
                  : t(
                      "workspace.storageConfirmClean",
                      "Are you sure you want to cleanup? This action cannot be undone.",
                    )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmClean === "sessions") {
                  handleDeleteAllSessions();
                  return;
                }
                if (confirmClean) {
                  handleCleanCategory(confirmClean);
                }
              }}
              disabled={cleaning}
            >
              {cleaning ? (
                <Spinner size={16} />
              ) : (
                t("workspace.storageCleanup", "Cleanup")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
