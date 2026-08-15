"use client";

import type { QuantWatchlistConfig } from "@/lib/quant/types";
import { cn } from "@/lib/utils";
import { Button } from "@openzhiyu/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

function splitCodes(value: string): string[] {
  return value
    .split(/[\s,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    default: "默认列表",
    env: "环境配置",
    file: "本地配置",
    legacy_file: "旧版本地配置",
    legacy_migrated: "旧列表迁移",
    structured_config: "结构化配置",
    universe_file: "结构化池",
  };
  return labels[source] ?? source;
}

function poolSummary(config: QuantWatchlistConfig | null): string | null {
  if (!config?.pool_counts) return null;
  const labels: Record<string, string> = {
    candidate: "候选",
    core: "核心",
    trading: "交易关注",
    holding: "持仓跟踪",
    archived: "归档",
  };
  return Object.entries(config.pool_counts)
    .filter(([, count]) => count > 0)
    .map(([pool, count]) => `${labels[pool] ?? pool} ${count}`)
    .join(" · ");
}

export function WatchlistManager({ initialCodes }: { initialCodes: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState(initialCodes.join(", "));
  const [config, setConfig] = useState<QuantWatchlistConfig | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quant/watchlist/config")
      .then((response) => {
        if (!response.ok) throw new Error("读取自选股失败");
        return response.json() as Promise<QuantWatchlistConfig>;
      })
      .then((nextConfig) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setValue(nextConfig.codes.join(", "));
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "读取自选股失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parsedCodes = useMemo(() => splitCodes(value), [value]);

  async function handleSave() {
    setState("saving");
    setMessage(null);
    try {
      const response = await fetch("/api/quant/watchlist/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: parsedCodes }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "保存自选股失败");
      }
      setConfig(payload as QuantWatchlistConfig);
      setValue((payload as QuantWatchlistConfig).codes.join(", "));
      setState("saved");
      setMessage("已保存，自选股会用于行情、信号和模拟组合。");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "保存自选股失败");
    }
  }

  return (
    <div className="mb-4 rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">自选股</h3>
            <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
              只读观察
            </span>
            {config ? (
              <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                来源：{sourceLabel(config.source)}
              </span>
            ) : null}
            {config?.max_active_symbols ? (
              <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                上限：{config.max_active_symbols} 只
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            输入股票代码，用逗号或换行分隔。保存后更新核心自选股池，不会执行实盘交易。
          </p>
          {poolSummary(config) ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {poolSummary(config)}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          className="h-8 gap-2 px-3 text-xs"
          disabled={state === "saving" || parsedCodes.length === 0}
          onClick={handleSave}
        >
          <span
            className={cn(
              state === "saving" ? "ri-loader-2-line animate-spin" : "ri-save-line",
            )}
            aria-hidden
          />
          保存
        </Button>
      </div>
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setState("idle");
          setMessage(null);
        }}
        className="mt-3 min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder="600519.SH, 300750.SZ, 601318.SH"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>当前 {parsedCodes.length} 只</span>
        {message ? (
          <span
            className={cn(
              state === "error" ? "text-destructive" : "text-emerald-700",
            )}
          >
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
