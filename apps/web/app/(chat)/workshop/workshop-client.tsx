"use client";

import { RemixIcon } from "@/components/remix-icon";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@openzhiyu/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Workshop = {
  id: string;
  name: string;
  mission: string;
  status: string;
  autonomyLevel: string;
  boundaryPolicy: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
};

type WorkshopEvent = {
  id: string;
  workshopId: string;
  runId: string | null;
  seq: number;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type WorkshopSource = {
  id: string;
  type: string;
  name: string;
  uri: string | null;
  content: string | null;
  enabled: boolean;
  createdAt: string;
};

type WorkshopMemory = {
  id: string;
  kind: string;
  content: string;
  confidence: number;
  tags: string[];
  createdAt: string;
};

type WorkshopOutbox = {
  id: string;
  runId: string | null;
  channel: string;
  recipientName: string | null;
  message: string;
  status: string;
  confidence: number;
  riskLevel: string;
  boundaryResult: Record<string, unknown>;
  createdAt: string;
};

type WorkshopDetail = {
  workshop: Workshop;
  events: WorkshopEvent[];
  sources: WorkshopSource[];
  memories: WorkshopMemory[];
  outbox: WorkshopOutbox[];
};

function sortWorkshopEvents(events: WorkshopEvent[]) {
  return [...events].sort(
    (a, b) =>
      a.seq - b.seq ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function mergeWorkshopEvents(
  events: WorkshopEvent[],
  nextEvent: WorkshopEvent,
) {
  if (events.some((event) => event.id === nextEvent.id)) {
    return events;
  }
  return sortWorkshopEvents([...events, nextEvent]);
}

const defaultMission =
  "你是我的股票分析师。持续研究市场和公司信息，当发现值得我知道的新信息时，整理来源、判断、置信度和反方风险，必要时生成微信提醒草稿。";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function eventIcon(type: string) {
  if (type.includes("source")) return "link";
  if (type.includes("memory")) return "brain";
  if (type.includes("outbox")) return "chat";
  if (type.includes("directive")) return "arrow_right_s";
  if (type.includes("run")) return "play";
  return "pulse";
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function WorkshopClient() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkshopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("股票分析师车间");
  const [newMission, setNewMission] = useState(defaultMission);
  const [directive, setDirective] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [outboxRecipients, setOutboxRecipients] = useState<Record<string, string>>({});
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const selectedWorkshop = useMemo(
    () => detail?.workshop ?? workshops.find((item) => item.id === selectedId),
    [detail?.workshop, selectedId, workshops],
  );

  const refreshWorkshops = useCallback(async () => {
    const data = await jsonFetch<{ workshops: Workshop[] }>("/api/workshops");
    setWorkshops(data.workshops);
    setSelectedId((current) => current ?? data.workshops[0]?.id ?? null);
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    const data = await jsonFetch<WorkshopDetail>(`/api/workshops/${id}`);
    setDetail({
      ...data,
      events: sortWorkshopEvents(data.events),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshWorkshops()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshWorkshops]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    refreshDetail(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshDetail, selectedId]);

  useEffect(() => {
    if (!selectedId || !detail || detail.workshop.id !== selectedId) return;

    let lastSeq = detail.events.at(-1)?.seq ?? 0;

    const source = new EventSource(
      `/api/workshops/${selectedId}/events/stream?after=${lastSeq}`,
    );

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as WorkshopEvent;
      if (event.type === "error") {
        return;
      }
      lastSeq = Math.max(lastSeq, event.seq);
      setDetail((current) => {
        if (!current || current.workshop.id !== selectedId) return current;
        return {
          ...current,
          events: mergeWorkshopEvents(current.events, event),
        };
      });
    };

    source.onerror = () => {
      // Let EventSource use its built-in reconnect. Duplicate history from a
      // reconnect is filtered by event id in the state updater.
    };

    return () => {
      source.close();
    };
  }, [detail?.workshop.id, selectedId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.events.length]);

  async function createWorkshop() {
    setBusy(true);
    setError(null);
    try {
      const data = await jsonFetch<{ workshop: Workshop }>("/api/workshops", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          mission: newMission,
          autonomyLevel: "draft",
          boundaryPolicy: {
            externalWrites: "outbox_first",
            requireSourcesForWechat: true,
          },
        }),
      });
      await refreshWorkshops();
      setSelectedId(data.workshop.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startRun() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/runs`, {
        method: "POST",
        body: JSON.stringify({ triggerReason: { type: "manual" } }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendDirective() {
    if (!selectedId || !directive.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/directives`, {
        method: "POST",
        body: JSON.stringify({
          content: directive,
          scope: "current_run",
        }),
      });
      setDirective("");
      await refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addSource() {
    if (!selectedId || !sourceName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/sources`, {
        method: "POST",
        body: JSON.stringify({
          type: sourceUri.trim() ? "url" : "manual",
          name: sourceName,
          uri: sourceUri || null,
          content: sourceContent || null,
        }),
      });
      setSourceName("");
      setSourceUri("");
      setSourceContent("");
      await refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateOutboxRecipient(
    outboxId: string,
    recipientName: string,
    refresh = true,
  ) {
    if (!selectedId) return;
    await jsonFetch(`/api/workshops/${selectedId}/outbox/${outboxId}`, {
      method: "PATCH",
      body: JSON.stringify({ recipientName }),
    });
    if (refresh) {
      await refreshDetail(selectedId);
    }
  }

  async function previewOutbox(outbox: WorkshopOutbox) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const recipientName =
        outboxRecipients[outbox.id] ?? outbox.recipientName ?? "";
      if (recipientName.trim() !== (outbox.recipientName ?? "")) {
        await updateOutboxRecipient(outbox.id, recipientName, false);
      }
      await jsonFetch(`/api/workshops/${selectedId}/outbox/${outbox.id}/preview`, {
        method: "POST",
      });
      await refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function sendOutbox(outboxId: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/outbox/${outboxId}/send`, {
        method: "POST",
      });
      await refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function saveOutboxRecipient(outbox: WorkshopOutbox) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await updateOutboxRecipient(
        outbox.id,
        outboxRecipients[outbox.id] ?? outbox.recipientName ?? "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <RemixIcon name="store_3" size="size-4" />
              <span>工作工坊</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-foreground">
                让智能体在自己的车间里开工
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                每个车间都有使命、资料源、工作日志、记忆和发信箱。你给方向，它持续探索；外部动作先进入边界和 outbox。
              </p>
            </div>
          </div>
          <Button onClick={startRun} disabled={!selectedId || busy} className="gap-2">
            <RemixIcon name="play" size="size-4" />
            启动一轮
          </Button>
        </header>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium text-foreground">车间</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                一个车间对应一个长期工作的智能体空间。
              </p>
            </div>
            <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
              {loading ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  正在加载车间...
                </div>
              ) : workshops.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  还没有车间。先创建一个。
                </div>
              ) : (
                workshops.map((workshop) => (
                  <button
                    key={workshop.id}
                    type="button"
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-muted/60",
                      selectedId === workshop.id && "bg-primary/5",
                    )}
                    onClick={() => setSelectedId(workshop.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {workshop.name}
                      </span>
                      <Badge variant="secondary">{workshop.status}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {workshop.mission}
                    </p>
                  </button>
                ))
              )}
            </div>
            <div className="space-y-3 border-t border-border p-4">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="车间名称"
              />
              <Textarea
                value={newMission}
                onChange={(event) => setNewMission(event.target.value)}
                className="min-h-28 resize-none"
                placeholder="车间使命"
              />
              <Button onClick={createWorkshop} disabled={busy} className="w-full gap-2">
                <RemixIcon name="add" size="size-4" />
                新建车间
              </Button>
            </div>
          </aside>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-medium text-foreground">
                        {selectedWorkshop?.name ?? "未选择车间"}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedWorkshop?.mission ??
                          "选择或创建一个车间后，这里会显示它的使命。"}
                      </p>
                    </div>
                    {selectedWorkshop ? (
                      <Badge>{selectedWorkshop.autonomyLevel}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">
                        智能体工作窗口
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        这里展示结构化工作事件：读了什么、记住了什么、生成了什么草稿。
                      </p>
                    </div>
                    <Badge variant="secondary">SSE 实时日志</Badge>
                  </div>
                </div>

                <div className="max-h-[560px] overflow-y-auto p-4">
                  {!detail || detail.events.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      暂无日志。启动一轮或追加方向后会写入事件。
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {detail.events.map((event) => (
                        <div key={event.id} className="flex gap-3">
                          <div className="flex w-14 shrink-0 justify-end pt-1 text-xs text-muted-foreground">
                            {formatTime(event.createdAt)}
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                              <RemixIcon name={eventIcon(event.type)} size="size-4" />
                            </div>
                            <div className="mt-2 h-full w-px bg-border" />
                          </div>
                          <div className="min-w-0 flex-1 rounded-lg border border-border bg-background p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{event.type}</Badge>
                              <h4 className="text-sm font-medium text-foreground">
                                {event.title}
                              </h4>
                            </div>
                            {event.body ? (
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                                {event.body}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  )}
                </div>

                <div className="border-t border-border p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={directive}
                      onChange={(event) => setDirective(event.target.value)}
                      placeholder="中途告诉这个车间新的方向，比如：今天只看 NVDA 和台积电，不要看宏观。"
                      className="min-h-11 resize-none"
                    />
                    <Button
                      onClick={sendDirective}
                      disabled={!selectedId || busy || !directive.trim()}
                      className="shrink-0 gap-2"
                    >
                      <RemixIcon name="arrow_right_s" size="size-4" />
                      发送方向
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <aside className="rounded-lg border border-border bg-card">
              <Tabs defaultValue="sources" className="flex h-full flex-col">
                <div className="border-b border-border px-4 py-3">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="sources">资料</TabsTrigger>
                    <TabsTrigger value="memory">记忆</TabsTrigger>
                    <TabsTrigger value="outbox">发信</TabsTrigger>
                    <TabsTrigger value="boundary">边界</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="sources" className="m-0 space-y-4 p-4">
                  <div className="space-y-2">
                    <Input
                      value={sourceName}
                      onChange={(event) => setSourceName(event.target.value)}
                      placeholder="资料名称"
                    />
                    <Input
                      value={sourceUri}
                      onChange={(event) => setSourceUri(event.target.value)}
                      placeholder="网址，可选"
                    />
                    <Textarea
                      value={sourceContent}
                      onChange={(event) => setSourceContent(event.target.value)}
                      className="min-h-24 resize-none"
                      placeholder="手动资料，可选"
                    />
                    <Button
                      onClick={addSource}
                      disabled={!selectedId || busy || !sourceName.trim()}
                      className="w-full gap-2"
                    >
                      <RemixIcon name="link" size="size-4" />
                      接入资料
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {(detail?.sources ?? []).map((source) => (
                      <div key={source.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {source.name}
                          </span>
                          <Badge variant="secondary">{source.type}</Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {source.uri ?? source.content ?? "无额外内容"}
                        </p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="memory" className="m-0 space-y-3 p-4">
                  {(detail?.memories ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      暂无长期记忆。后续 CC SDK 执行器会在每轮结束后提炼写入。
                    </p>
                  ) : (
                    detail?.memories.map((memory) => (
                      <div key={memory.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary">{memory.kind}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {memory.confidence}%
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground">
                          {memory.content}
                        </p>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="outbox" className="m-0 space-y-3 p-4">
                  {(detail?.outbox ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      暂无发信草稿。以后智能体只会先生成 outbox，再由边界策略决定是否发送。
                    </p>
                  ) : (
                    detail?.outbox.map((item) => {
                      const boundary = item.boundaryResult?.boundary as
                        | {
                            status?: string;
                            violations?: string[];
                            warnings?: string[];
                          }
                        | undefined;
                      const preview = item.boundaryResult?.wechatPreview as
                        | { expiresAt?: string }
                        | undefined;
                      return (
                        <div key={item.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Badge>{item.status}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {item.riskLevel} / {item.confidence}%
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-foreground">
                            {item.message}
                          </p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                              <label className="mb-1 block text-xs text-muted-foreground">
                                发送对象
                              </label>
                              <Input
                                value={
                                  outboxRecipients[item.id] ??
                                  item.recipientName ??
                                  ""
                                }
                                onChange={(event) =>
                                  setOutboxRecipients((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                placeholder="例如：文件传输助手"
                                disabled={item.status === "sent" || busy}
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => saveOutboxRecipient(item)}
                              disabled={item.status === "sent" || busy}
                              className="mt-5 shrink-0 gap-2 sm:mt-6"
                            >
                              <RemixIcon name="save" size="size-4" />
                              保存
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.channel}
                          </p>
                          {boundary?.violations?.length ? (
                            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
                              {boundary.violations.join(" / ")}
                            </div>
                          ) : null}
                          {boundary?.warnings?.length ? (
                            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                              {boundary.warnings.join(" / ")}
                            </div>
                          ) : null}
                          {preview?.expiresAt ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              预览有效期至 {new Date(preview.expiresAt).toLocaleTimeString("zh-CN")}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.status !== "sent" && item.status !== "blocked" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => previewOutbox(item)}
                                disabled={busy}
                                className="gap-2"
                              >
                                <RemixIcon name="eye" size="size-4" />
                                生成预览
                              </Button>
                            ) : null}
                            {item.status === "pending_approval" ? (
                              <Button
                                size="sm"
                                onClick={() => sendOutbox(item.id)}
                                disabled={busy}
                                className="gap-2"
                              >
                                <RemixIcon name="send_plane" size="size-4" />
                                确认发送
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="boundary" className="m-0 space-y-3 p-4">
                  <div className="rounded-lg border border-border p-3">
                    <h3 className="text-sm font-medium text-foreground">
                      当前边界
                    </h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                      <li>开放探索：允许自己规划资料阅读和下一步。</li>
                      <li>外部动作：必须先进入 outbox。</li>
                      <li>微信：必须带来源、置信度和风险。</li>
                      <li>金融：不允许自动生成交易指令。</li>
                    </ul>
                  </div>
                </TabsContent>
              </Tabs>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
