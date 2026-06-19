"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageSectionHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@openloomi/ui";
import { RemixIcon } from "@/components/remix-icon";
import { Spinner } from "@/components/spinner";
import { toast } from "@/components/toast";
import { cn, fetcher } from "@/lib/utils";

type LoopDashboardStatus =
  | "active"
  | "paused"
  | "blocked"
  | "needs_approval"
  | "error"
  | "archived";

interface LoopRunSummary {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  outputSummary: string | null;
  error: string | null;
  verificationPassed: boolean | null;
  checkerAction: string | null;
  checkerType: string | null;
  requiresApproval: boolean;
  denied: boolean;
  modelCheckerEnabled: boolean;
  modelCheckerReason: string | null;
}

interface LoopSummary {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  status: string;
  dashboardStatus: LoopDashboardStatus;
  triggerConfig: Record<string, unknown>;
  currentPhase: string | null;
  nextAction: string | null;
  blockedReason: string | null;
  lastObservation: string | null;
  stateJson: Record<string, unknown>;
  nextScheduledRunAt: string | null;
  lastScheduledRunAt: string | null;
  schedulerStatus: string | null;
  latestRun: LoopRunSummary | null;
  updatedAt: string;
  createdAt: string;
}

interface LoopDetail extends LoopSummary {
  contextConfig: Record<string, unknown>;
  actionPolicy: Record<string, unknown>;
  verificationConfig: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
  escalationPolicy: Record<string, unknown>;
  runs: LoopRunSummary[];
}

interface LoopDashboardResponse {
  loops: LoopSummary[];
  counts: Record<LoopDashboardStatus, number>;
}

interface LoopTemplatesResponse {
  templates: Array<{
    id: string;
    name: string;
    description: string;
    defaultCronExpression: string;
    requiredInputFields: string[];
  }>;
}

interface LoopApprovalInboxResponse {
  items: Array<{
    id: string;
    loopId: string;
    loopName: string;
    runId: string;
    status:
      | "pending"
      | "approved"
      | "rejected"
      | "superseded"
      | "consumed"
      | "denied";
    actionName: string;
    capability: string | null;
    reason: string | null;
    message: string | null;
    source: "tool_gate" | "approval";
    startedAt: string;
    completedAt: string | null;
    continuationStatus?: "ready" | "not_resumable" | "consumed" | null;
  }>;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    superseded: number;
    consumed: number;
    denied: number;
  };
}

interface LoopTemplateFormState {
  templateId: string;
  projectName: string;
  meetingTopic: string;
  contactGroup: string;
  cronExpression: string;
  timezone: string;
  description: string;
  modelCheckerEnabled: boolean;
  modelCheckerMaxInputChars: string;
}

const STATUS_COPY: Record<LoopDashboardStatus, { label: string; className: string }> = {
  active: {
    label: "运行中",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  paused: {
    label: "已暂停",
    className: "border-border bg-muted text-muted-foreground",
  },
  blocked: {
    label: "已阻塞",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  needs_approval: {
    label: "待审批",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  error: {
    label: "错误",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  archived: {
    label: "已归档",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  approved: "已批准",
  rejected: "已拒绝",
  superseded: "已替代",
  consumed: "已消费",
  denied: "已拒绝",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  failed: "失败",
  blocked: "已阻塞",
  running: "运行中",
  pending: "待处理",
};

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "从未";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTriggerLabel(triggerConfig: Record<string, unknown>): string {
  const type = triggerConfig.type;
  if (type === "cron") return `Cron ${triggerConfig.expression ?? ""}`.trim();
  if (type === "interval") return `每 ${triggerConfig.minutes ?? "?"} 分钟`;
  if (type === "once") return `单次 ${triggerConfig.at ?? ""}`.trim();
  if (type === "manual") return "手动";
  if (type === "scheduled_job") return "旧版定时任务";
  return "原生循环";
}

function labelFromMap(map: Record<string, string>, value: string | null | undefined) {
  if (!value) return "未知";
  return map[value] ?? value;
}

function StatusBadge({ status }: { status: LoopDashboardStatus }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.error;
  return (
    <Badge variant="outline" className={cn("rounded-md", copy.className)}>
      {copy.label}
    </Badge>
  );
}

function buildInitialForm(templates: LoopTemplatesResponse["templates"]): LoopTemplateFormState {
  const template = templates[0];
  return {
    templateId: template?.id ?? "",
    projectName: "",
    meetingTopic: "",
    contactGroup: "",
    cronExpression: template?.defaultCronExpression ?? "",
    timezone: defaultTimezone(),
    description: "",
    modelCheckerEnabled: false,
    modelCheckerMaxInputChars: "12000",
  };
}

function readError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return fallback;
}

export default function LoopsPage() {
  const router = useRouter();
  const { data: dashboard, error: dashboardError, mutate: refreshDashboard } =
    useSWR<LoopDashboardResponse>("/api/loops", fetcher);
  const { data: templatesData } = useSWR<LoopTemplatesResponse>(
    "/api/loops/templates",
    fetcher,
  );
  const { data: approvalsData, mutate: refreshApprovals } =
    useSWR<LoopApprovalInboxResponse>("/api/loops/approvals", fetcher);

  const loops = dashboard?.loops ?? [];
  const templates = templatesData?.templates ?? [];
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<LoopTemplateFormState>(() =>
    buildInitialForm([]),
  );
  const [creating, setCreating] = useState(false);
  const [dryRunId, setDryRunId] = useState<string | null>(null);
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(
    null,
  );

  const selectedLoopKey = selectedLoopId ? `/api/loops/${selectedLoopId}` : null;
  const { data: detailData, mutate: refreshDetail } = useSWR<{ loop: LoopDetail }>(
    selectedLoopKey,
    fetcher,
  );
  const selectedLoop = detailData?.loop ?? loops.find((loop) => loop.id === selectedLoopId) ?? null;

  const pendingApprovals = useMemo(
    () => (approvalsData?.items ?? []).filter((item) => item.status === "pending"),
    [approvalsData],
  );

  useEffect(() => {
    if (!selectedLoopId && loops.length > 0) {
      setSelectedLoopId(loops[0].id);
    }
  }, [loops, selectedLoopId]);

  useEffect(() => {
    if (templates.length > 0 && !form.templateId) {
      setForm(buildInitialForm(templates));
    }
  }, [form.templateId, templates]);

  function updateForm(updates: Partial<LoopTemplateFormState>) {
    setForm((current) => ({ ...current, ...updates }));
  }

  function openGuardedChat(loop: LoopSummary) {
    const params = new URLSearchParams({
      loopIdForGuard: loop.id,
      loopName: loop.name,
    });
    router.push(`/chat?${params.toString()}`);
  }

  async function createLoop() {
    if (!form.templateId) return;
    setCreating(true);
    try {
      const response = await fetch("/api/loops/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: form.templateId,
          projectName: form.projectName || undefined,
          meetingTopic: form.meetingTopic || undefined,
          contactGroup: form.contactGroup || undefined,
          cronExpression: form.cronExpression || undefined,
          timezone: form.timezone || undefined,
          description: form.description || undefined,
          modelChecker: {
            enabled: form.modelCheckerEnabled,
            maxInputChars: Number(form.modelCheckerMaxInputChars) || 12000,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(data, "创建循环失败"));
      const loop = (data as { loop?: LoopSummary }).loop;
      toast({ type: "success", description: "循环已创建" });
      setCreateOpen(false);
      setForm(buildInitialForm(templates));
      await refreshDashboard();
      if (loop?.id) setSelectedLoopId(loop.id);
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "创建循环失败",
      });
    } finally {
      setCreating(false);
    }
  }

  async function executeLoop(loopId: string, dryRun: boolean) {
    if (dryRun) setDryRunId(loopId);
    else setAgentRunId(loopId);
    try {
      const response = await fetch(`/api/loops/${loopId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(data, "执行循环失败"));
      toast({
        type: "success",
        description: dryRun ? "循环试运行完成" : "循环运行完成",
      });
      await Promise.all([refreshDashboard(), refreshDetail(), refreshApprovals()]);
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "执行循环失败",
      });
    } finally {
      if (dryRun) setDryRunId(null);
      else setAgentRunId(null);
    }
  }

  async function resolveApproval(approvalId: string, status: "approved" | "rejected") {
    setResolvingApprovalId(approvalId);
    try {
      const response = await fetch(`/api/loops/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(data, "更新审批失败"));
      toast({
        type: "success",
        description: status === "approved" ? "审批已通过" : "审批已拒绝",
      });
      await Promise.all([refreshDashboard(), refreshDetail(), refreshApprovals()]);
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "更新审批失败",
      });
    } finally {
      setResolvingApprovalId(null);
    }
  }

  const loading = !dashboard && !dashboardError;

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <PageSectionHeader
        title="Loop Engineering"
        description="管理持续运行的原生循环、审批队列和运行状态。"
      >
        <Button variant="outline" onClick={() => refreshDashboard()}>
          <RemixIcon name="refresh" size="size-4" />
          刷新
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <RemixIcon name="add" size="size-4" />
          新建循环
        </Button>
      </PageSectionHeader>

      <section className="grid gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-6">
        {(Object.keys(STATUS_COPY) as LoopDashboardStatus[]).map((status) => (
          <div key={status} className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">{STATUS_COPY[status].label}</div>
            <div className="mt-1 text-2xl font-semibold">{dashboard?.counts?.[status] ?? 0}</div>
          </div>
        ))}
      </section>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center">
          <Spinner />
        </div>
      ) : dashboardError ? (
        <div className="border-y border-border px-6 py-16 text-center">
          <h2 className="text-base font-medium">循环不可用</h2>
          <p className="mt-1 text-sm text-muted-foreground">{String(dashboardError)}</p>
        </div>
      ) : loops.length === 0 ? (
        <div className="border-y border-border px-6 py-16 text-center">
          <h2 className="text-base font-medium">还没有循环</h2>
          <p className="mt-1 text-sm text-muted-foreground">从模板创建一个循环后，就可以在这里试运行、守护聊天和查看审批。</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <RemixIcon name="add" size="size-4" />
            新建循环
          </Button>
        </div>
      ) : (
        <section className="grid flex-1 gap-0 border-y border-border lg:grid-cols-[minmax(320px,420px)_1fr]">
          <aside className="border-b border-border lg:border-b-0 lg:border-r">
            <div className="space-y-2 p-4">
              {loops.map((loop) => (
                <button
                  key={loop.id}
                  type="button"
                  onClick={() => setSelectedLoopId(loop.id)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/60",
                    selectedLoopId === loop.id ? "border-primary bg-muted" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{loop.name}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {loop.description ?? loop.goal}
                      </div>
                    </div>
                    <StatusBadge status={loop.dashboardStatus} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>触发: {getTriggerLabel(loop.triggerConfig)}</span>
                    <span>下次: {formatDate(loop.nextScheduledRunAt)}</span>
                    <span>阶段: {loop.currentPhase ?? "idle"}</span>
                    <span>调度: {loop.schedulerStatus ?? "idle"}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 p-6">
            {selectedLoop ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold">{selectedLoop.name}</h2>
                      <StatusBadge status={selectedLoop.dashboardStatus} />
                    </div>
                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                      {selectedLoop.description ?? selectedLoop.goal}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => openGuardedChat(selectedLoop)}>
                      <RemixIcon name="message-3" size="size-4" />
                      守护聊天
                    </Button>
                    <Button
                      variant="outline"
                      disabled={dryRunId === selectedLoop.id}
                      onClick={() => executeLoop(selectedLoop.id, true)}
                    >
                      {dryRunId === selectedLoop.id ? <Spinner /> : <RemixIcon name="play" size="size-4" />}
                      试运行
                    </Button>
                    <Button
                      disabled={agentRunId === selectedLoop.id}
                      onClick={() => executeLoop(selectedLoop.id, false)}
                    >
                      {agentRunId === selectedLoop.id ? <Spinner /> : <RemixIcon name="rocket" size="size-4" />}
                      真实运行
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">上次运行</div>
                    <div className="mt-1 text-sm font-medium">{formatDate(selectedLoop.latestRun?.startedAt)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {labelFromMap(RUN_STATUS_LABELS, selectedLoop.latestRun?.status)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">下次调度</div>
                    <div className="mt-1 text-sm font-medium">{formatDate(selectedLoop.nextScheduledRunAt)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{getTriggerLabel(selectedLoop.triggerConfig)}</div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">下一步</div>
                    <div className="mt-1 text-sm font-medium">{selectedLoop.nextAction ?? "等待触发"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selectedLoop.blockedReason ?? selectedLoop.lastObservation ?? "无阻塞"}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium">最近运行</h3>
                  <div className="mt-2 overflow-hidden rounded-md border border-border">
                    {(detailData?.loop.runs ?? []).length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">暂无运行记录</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {(detailData?.loop.runs ?? []).slice(0, 8).map((run) => (
                          <div key={run.id} className="grid gap-2 p-3 text-sm md:grid-cols-[140px_1fr_160px]">
                            <Badge variant="outline" className="w-fit rounded-md">
                              {labelFromMap(RUN_STATUS_LABELS, run.status)}
                            </Badge>
                            <div className="min-w-0 text-muted-foreground">
                              <div className="truncate">{run.outputSummary ?? run.error ?? "无摘要"}</div>
                              {run.modelCheckerReason ? (
                                <div className="mt-1 truncate text-xs">模型检查: {run.modelCheckerReason}</div>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground md:text-right">{formatDate(run.startedAt)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium">审批队列</h3>
                  <div className="mt-2 overflow-hidden rounded-md border border-border">
                    {pendingApprovals.filter((item) => item.loopId === selectedLoop.id).length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">当前循环没有待审批动作</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {pendingApprovals
                          .filter((item) => item.loopId === selectedLoop.id)
                          .map((item) => (
                            <div key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="text-sm font-medium">{item.actionName}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{item.reason ?? item.message ?? "等待人工确认"}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{APPROVAL_STATUS_LABELS[item.status]}</Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={resolvingApprovalId === item.id}
                                  onClick={() => resolveApproval(item.id, "rejected")}
                                >
                                  拒绝
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={resolvingApprovalId === item.id}
                                  onClick={() => resolveApproval(item.id, "approved")}
                                >
                                  通过
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">选择一个循环查看详情</div>
            )}
          </section>
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>新建循环</DialogTitle>
            <DialogDescription>从内置模板创建可调度、可审批、可守护聊天的 Loop Engineering 循环。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>模板</Label>
              <Select
                value={form.templateId}
                onValueChange={(templateId) => {
                  const template = templates.find((item) => item.id === templateId);
                  updateForm({
                    templateId,
                    cronExpression: template?.defaultCronExpression ?? form.cronExpression,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择模板" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>项目名称</Label>
                <Input value={form.projectName} onChange={(event) => updateForm({ projectName: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>会议主题</Label>
                <Input value={form.meetingTopic} onChange={(event) => updateForm({ meetingTopic: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>联系人群组</Label>
                <Input value={form.contactGroup} onChange={(event) => updateForm({ contactGroup: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Cron</Label>
                <Input value={form.cronExpression} onChange={(event) => updateForm({ cronExpression: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>时区</Label>
              <Input value={form.timezone} onChange={(event) => updateForm({ timezone: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>描述</Label>
              <Textarea value={form.description} onChange={(event) => updateForm({ description: event.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label>模型检查器</Label>
                <div className="text-xs text-muted-foreground">运行完成后追加 LLM 质量检查。</div>
              </div>
              <Switch
                checked={form.modelCheckerEnabled}
                onCheckedChange={(checked) => updateForm({ modelCheckerEnabled: checked })}
              />
            </div>
            {form.modelCheckerEnabled ? (
              <div className="grid gap-2">
                <Label>最大输入字符</Label>
                <Input
                  value={form.modelCheckerMaxInputChars}
                  onChange={(event) => updateForm({ modelCheckerMaxInputChars: event.target.value })}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={!form.templateId || creating} onClick={createLoop}>
              {creating ? <Spinner /> : <RemixIcon name="add" size="size-4" />}
              创建循环
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
