"use client";

import { RemixIcon } from "@/components/remix-icon";
import { Spinner } from "@/components/spinner";
import { toast } from "@/components/toast";
import { cn, fetcher } from "@/lib/utils";
import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Label,
	PageSectionHeader,
	Switch,
	Textarea,
} from "@openzhiyu/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

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
	executionTrace: {
		events: Array<{
			type: string;
			title: string;
			detail: string | null;
			toolName: string | null;
			status: string | null;
			timestamp: string | null;
		}>;
		toolCallCount: number;
		failedToolCallCount: number;
		permissionDecisionCount: number;
		durationMs: number | null;
	};
}

interface LoopSpaceSummary {
	triggerLabel: string;
	contextLabel: string;
	deliveryLabel: string | null;
	plannerAgent: string;
	executorAgent: string;
	verifierAgent: string;
	harness: string;
	externalWriteMode: "auto" | "manual_approval" | "none";
	permissionLabel: string;
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
	spaceSummary: LoopSpaceSummary;
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

interface LoopsPageStateResponse {
	generatedAt: string;
	dashboard: LoopDashboardResponse;
	approvals: LoopApprovalInboxResponse;
	runtime: {
		scheduler: {
			allowed: boolean;
			isRunning: boolean;
			checkInterval: number | null;
		};
		connectors: {
			totalAccounts: number;
			activeAccounts: number;
			accountsByPlatform: Record<string, number>;
			activeByPlatform: Record<string, number>;
		};
	};
}

interface NaturalLanguageLoopDraft {
	name: string;
	description: string;
	spec: Record<string, unknown>;
	planner?: {
		agent: "natural-language-planner";
		model: string;
		parser: "local_llm_api" | "local_rules";
	};
	extracted: {
		scheduleLabel: string;
		timezone: string;
		recipientName?: string;
		city?: string;
		deliveryPlatform?: "wechat_desktop";
		externalWriteMode: "manual_approval" | "loop_approved";
		missingFields: string[];
	};
}

const STATUS_COPY: Record<
	LoopDashboardStatus,
	{ label: string; className: string }
> = {
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
		label: "待确认",
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
	approved: "已通过",
	rejected: "已拒绝",
	superseded: "已替换",
	consumed: "已消费",
	denied: "已拒绝",
};

const RUN_STATUS_LABELS: Record<string, string> = {
	completed: "已完成",
	success: "已完成",
	failed: "失败",
	error: "错误",
	blocked: "已阻塞",
	running: "运行中",
	pending: "待处理",
	needs_approval: "待确认",
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

function formatDuration(value: number | null | undefined): string {
	if (!value || value < 0) return "未知耗时";
	if (value < 1000) return `${value}ms`;
	return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function labelFromMap(
	map: Record<string, string>,
	value: string | null | undefined,
) {
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

function readError(data: unknown, fallback: string): string {
	if (data && typeof data === "object" && "error" in data) {
		const error = (data as { error?: unknown }).error;
		if (typeof error === "string" && error.length > 0) return error;
	}
	return fallback;
}

export default function LoopsPage() {
	const router = useRouter();
	const {
		data: pageState,
		error: dashboardError,
		mutate: refreshDashboard,
	} = useSWR<LoopsPageStateResponse>("/api/page-state/loops", fetcher, {
		dedupingInterval: 5000,
		revalidateOnFocus: false,
	});
	const dashboard = pageState?.dashboard;
	const approvalsData = pageState?.approvals;
	const refreshApprovals = refreshDashboard;
	const loops = dashboard?.loops ?? [];
	const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [naturalIntent, setNaturalIntent] = useState(
		"每天早上 9 点给文件传输助手发送北京当日天气预报。",
	);
	const [naturalDraft, setNaturalDraft] =
		useState<NaturalLanguageLoopDraft | null>(null);
	const [naturalExternalWriteMode, setNaturalExternalWriteMode] = useState<
		"manual_approval" | "loop_approved"
	>("loop_approved");
	const [draftingNaturalLoop, setDraftingNaturalLoop] = useState(false);
	const [creatingNaturalLoop, setCreatingNaturalLoop] = useState(false);
	const [deletingLoopId, setDeletingLoopId] = useState<string | null>(null);
	const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(
		null,
	);

	const selectedLoopExists = selectedLoopId
		? loops.some((loop) => loop.id === selectedLoopId)
		: false;
	const selectedLoopKey =
		selectedLoopId && selectedLoopExists
			? `/api/loops/${selectedLoopId}`
			: null;
	const { data: detailData, mutate: refreshDetail } = useSWR<{
		loop: LoopDetail;
	}>(selectedLoopKey, fetcher, {
		dedupingInterval: 5000,
		revalidateOnFocus: false,
	});
	const selectedLoop = selectedLoopExists
		? (detailData?.loop ??
			loops.find((loop) => loop.id === selectedLoopId) ??
			null)
		: null;

	const pendingApprovals = useMemo(
		() =>
			(approvalsData?.items ?? []).filter((item) => item.status === "pending"),
		[approvalsData],
	);

	useEffect(() => {
		if (loops.length === 0) {
			if (selectedLoopId) setSelectedLoopId(null);
			return;
		}

		if (!selectedLoopId || !loops.some((loop) => loop.id === selectedLoopId)) {
			setSelectedLoopId(loops[0].id);
		}
	}, [loops, selectedLoopId]);

	function openGuardedChat(loop: LoopSummary) {
		const params = new URLSearchParams({
			loopIdForGuard: loop.id,
			loopName: loop.name,
		});
		router.push(`/chat?${params.toString()}`);
	}

	async function draftNaturalLoop() {
		if (!naturalIntent.trim()) return;
		setDraftingNaturalLoop(true);
		try {
			const response = await fetch("/api/loops/natural-language", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					intent: naturalIntent,
					timezone: defaultTimezone(),
					externalWriteMode: naturalExternalWriteMode,
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(readError(data, "生成任务草稿失败"));
			const draft = (data as { draft?: NaturalLanguageLoopDraft }).draft;
			if (!draft) throw new Error("生成任务草稿失败");
			setNaturalDraft(draft);
		} catch (error) {
			toast({
				type: "error",
				description:
					error instanceof Error ? error.message : "生成任务草稿失败",
			});
		} finally {
			setDraftingNaturalLoop(false);
		}
	}

	async function createNaturalLoop() {
		if (!naturalIntent.trim()) return;
		setCreatingNaturalLoop(true);
		try {
			const response = await fetch("/api/loops/natural-language", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					intent: naturalIntent,
					timezone: defaultTimezone(),
					externalWriteMode: naturalExternalWriteMode,
					create: true,
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(readError(data, "创建自动任务失败"));
			const loop = (data as { loop?: LoopSummary }).loop;
			toast({ type: "success", description: "自动任务已创建" });
			setCreateOpen(false);
			setNaturalDraft(null);
			await refreshDashboard();
			if (loop?.id) setSelectedLoopId(loop.id);
		} catch (error) {
			toast({
				type: "error",
				description:
					error instanceof Error ? error.message : "创建自动任务失败",
			});
		} finally {
			setCreatingNaturalLoop(false);
		}
	}

	async function deleteSelectedLoop(loop: LoopSummary) {
		const confirmed = window.confirm(
			`删除自动任务 "${loop.name}"？这会同时删除它的运行记录和审批记录。`,
		);
		if (!confirmed) return;

		setDeletingLoopId(loop.id);
		try {
			const response = await fetch(`/api/loops/${loop.id}`, {
				method: "DELETE",
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(readError(data, "删除自动任务失败"));
			toast({ type: "success", description: "自动任务已删除" });
			const nextLoop = loops.find((item) => item.id !== loop.id) ?? null;
			setSelectedLoopId(nextLoop?.id ?? null);
			await Promise.all([refreshDashboard(), refreshApprovals()]);
		} catch (error) {
			toast({
				type: "error",
				description:
					error instanceof Error ? error.message : "删除自动任务失败",
			});
		} finally {
			setDeletingLoopId(null);
		}
	}

	async function resolveApproval(
		approvalId: string,
		status: "approved" | "rejected",
	) {
		setResolvingApprovalId(approvalId);
		try {
			const response = await fetch(`/api/loops/approvals/${approvalId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(readError(data, "更新确认状态失败"));
			toast({
				type: "success",
				description: status === "approved" ? "已通过" : "已拒绝",
			});
			await Promise.all([
				refreshDashboard(),
				refreshDetail(),
				refreshApprovals(),
			]);
		} catch (error) {
			toast({
				type: "error",
				description:
					error instanceof Error ? error.message : "更新确认状态失败",
			});
		} finally {
			setResolvingApprovalId(null);
		}
	}

	const loading = !dashboard && !dashboardError;

	return (
		<main className="flex min-h-screen flex-col bg-background">
			<PageSectionHeader
				title="自动任务"
				description="用自然语言创建可在后台持续运行的任务。OpenZhiyu 会按计划执行、记录过程，并在需要时请求你确认。"
			>
				<Button variant="outline" onClick={() => refreshDashboard()}>
					<RemixIcon name="refresh" size="size-4" />
					刷新
				</Button>
				<Button onClick={() => setCreateOpen(true)}>
					<RemixIcon name="add" size="size-4" />
					创建自动任务
				</Button>
			</PageSectionHeader>

			<section className="grid gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-6">
				{(Object.keys(STATUS_COPY) as LoopDashboardStatus[]).map((status) => (
					<div key={status} className="rounded-md border border-border p-3">
						<div className="text-xs text-muted-foreground">
							{STATUS_COPY[status].label}
						</div>
						<div className="mt-1 text-2xl font-semibold">
							{dashboard?.counts?.[status] ?? 0}
						</div>
					</div>
				))}
			</section>

			{loading ? (
				<div className="flex min-h-[360px] items-center justify-center">
					<Spinner />
				</div>
			) : dashboardError ? (
				<div className="border-y border-border px-6 py-16 text-center">
					<h2 className="text-base font-medium">自动任务暂时不可用</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{String(dashboardError)}
					</p>
				</div>
			) : loops.length === 0 ? (
				<div className="border-y border-border px-6 py-16 text-center">
					<h2 className="text-base font-medium">还没有自动任务</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						直接描述你想让 OpenZhiyu
						定期或持续完成的事，它会生成可后台运行的任务。
					</p>
					<Button className="mt-4" onClick={() => setCreateOpen(true)}>
						<RemixIcon name="add" size="size-4" />
						创建自动任务
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
										selectedLoopId === loop.id
											? "border-primary bg-muted"
											: "border-border",
									)}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="truncate text-sm font-medium">
												{loop.name}
											</div>
											<div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
												{loop.description ?? loop.goal}
											</div>
										</div>
										<StatusBadge status={loop.dashboardStatus} />
									</div>
									<div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
										<span>触发：{loop.spaceSummary.triggerLabel}</span>
										<span>下次：{formatDate(loop.nextScheduledRunAt)}</span>
										<span>发送：{loop.spaceSummary.deliveryLabel ?? "无"}</span>
										<span>权限：{loop.spaceSummary.permissionLabel}</span>
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
											<h2 className="text-xl font-semibold">
												{selectedLoop.name}
											</h2>
											<StatusBadge status={selectedLoop.dashboardStatus} />
										</div>
										<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
											{selectedLoop.description ?? selectedLoop.goal}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<Button
											variant="outline"
											onClick={() => openGuardedChat(selectedLoop)}
										>
											<RemixIcon name="message-3" size="size-4" />
											和这个任务对话
										</Button>
										<Button
											variant="outline"
											disabled={deletingLoopId === selectedLoop.id}
											onClick={() => deleteSelectedLoop(selectedLoop)}
										>
											{deletingLoopId === selectedLoop.id ? (
												<Spinner />
											) : (
												<RemixIcon name="delete-bin" size="size-4" />
											)}
											删除
										</Button>
									</div>
								</div>

								<div className="grid gap-3 md:grid-cols-3">
									<div className="rounded-md border border-border p-3">
										<div className="text-xs text-muted-foreground">
											上次运行
										</div>
										<div className="mt-1 text-sm font-medium">
											{formatDate(selectedLoop.latestRun?.startedAt)}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{labelFromMap(
												RUN_STATUS_LABELS,
												selectedLoop.latestRun?.status,
											)}
										</div>
									</div>
									<div className="rounded-md border border-border p-3">
										<div className="text-xs text-muted-foreground">
											下次调度
										</div>
										<div className="mt-1 text-sm font-medium">
											{formatDate(selectedLoop.nextScheduledRunAt)}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{selectedLoop.spaceSummary.triggerLabel}
										</div>
									</div>
									<div className="rounded-md border border-border p-3">
										<div className="text-xs text-muted-foreground">下一步</div>
										<div className="mt-1 text-sm font-medium">
											{selectedLoop.nextAction ?? "等待触发"}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{selectedLoop.blockedReason ??
												selectedLoop.lastObservation ??
												"无阻塞"}
										</div>
									</div>
								</div>

								<div>
									<h3 className="text-sm font-medium">最近运行</h3>
									<div className="mt-2 overflow-hidden rounded-md border border-border">
										{(detailData?.loop.runs ?? []).length === 0 ? (
											<div className="p-4 text-sm text-muted-foreground">
												暂无运行记录
											</div>
										) : (
											<div className="divide-y divide-border">
												{(detailData?.loop.runs ?? [])
													.slice(0, 8)
													.map((run) => (
														<div key={run.id} className="p-3 text-sm">
															<div className="grid gap-2 md:grid-cols-[140px_1fr_220px]">
																<Badge
																	variant="outline"
																	className="w-fit rounded-md"
																>
																	{labelFromMap(RUN_STATUS_LABELS, run.status)}
																</Badge>
																<div className="min-w-0 text-muted-foreground">
																	<div className="truncate">
																		{run.outputSummary ?? run.error ?? "无摘要"}
																	</div>
																	{run.modelCheckerReason ? (
																		<div className="mt-1 truncate text-xs">
																			模型检查：{run.modelCheckerReason}
																		</div>
																	) : null}
																</div>
																<div className="text-xs text-muted-foreground md:text-right">
																	<div>{formatDate(run.startedAt)}</div>
																	<div>
																		{formatDuration(
																			run.executionTrace.durationMs,
																		)}{" "}
																		· 工具 {run.executionTrace.toolCallCount}
																		{run.executionTrace.failedToolCallCount > 0
																			? ` · 失败 ${run.executionTrace.failedToolCallCount}`
																			: ""}
																		{run.executionTrace
																			.permissionDecisionCount > 0
																			? ` · 权限 ${run.executionTrace.permissionDecisionCount}`
																			: ""}
																	</div>
																</div>
															</div>
														</div>
													))}
											</div>
										)}
									</div>
								</div>

								<div>
									<h3 className="text-sm font-medium">待确认动作</h3>
									<div className="mt-2 overflow-hidden rounded-md border border-border">
										{pendingApprovals.filter(
											(item) => item.loopId === selectedLoop.id,
										).length === 0 ? (
											<div className="p-4 text-sm text-muted-foreground">
												当前任务没有待确认动作
											</div>
										) : (
											<div className="divide-y divide-border">
												{pendingApprovals
													.filter((item) => item.loopId === selectedLoop.id)
													.map((item) => (
														<div
															key={item.id}
															className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
														>
															<div>
																<div className="text-sm font-medium">
																	{item.actionName}
																</div>
																<div className="mt-1 text-xs text-muted-foreground">
																	{item.reason ??
																		item.message ??
																		"等待人工确认"}
																</div>
															</div>
															<div className="flex items-center gap-2">
																<Badge variant="outline">
																	{APPROVAL_STATUS_LABELS[item.status]}
																</Badge>
																<Button
																	size="sm"
																	variant="outline"
																	disabled={resolvingApprovalId === item.id}
																	onClick={() =>
																		resolveApproval(item.id, "rejected")
																	}
																>
																	拒绝
																</Button>
																<Button
																	size="sm"
																	disabled={resolvingApprovalId === item.id}
																	onClick={() =>
																		resolveApproval(item.id, "approved")
																	}
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
							<div className="py-16 text-center text-sm text-muted-foreground">
								选择一个自动任务查看详情
							</div>
						)}
					</section>
				</section>
			)}

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>创建自动任务</DialogTitle>
						<DialogDescription>
							用一句自然语言描述你希望 OpenZhiyu 在后台持续完成的事。
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-2">
						<div className="grid gap-2">
							<Label>任务描述</Label>
							<Textarea
								value={naturalIntent}
								onChange={(event) => {
									setNaturalIntent(event.target.value);
									setNaturalDraft(null);
								}}
								className="min-h-28"
								placeholder="例如：每天早上 9 点给文件传输助手发送北京当日天气预报。"
							/>
							<p className="text-xs text-muted-foreground">
								OpenZhiyu
								会识别时间、目标、上下文来源、执行动作和验收条件，生成可后台运行的任务。
							</p>
						</div>

						<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
							<div>
								<Label>允许任务自动对外执行</Label>
								<div className="text-xs text-muted-foreground">
									开启后，这个任务可按任务策略自动发送微信等外部动作；对话页仍需要按钮确认。
								</div>
							</div>
							<Switch
								checked={naturalExternalWriteMode === "loop_approved"}
								onCheckedChange={(checked) =>
									setNaturalExternalWriteMode(
										checked ? "loop_approved" : "manual_approval",
									)
								}
							/>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								disabled={!naturalIntent.trim() || draftingNaturalLoop}
								onClick={draftNaturalLoop}
							>
								{draftingNaturalLoop ? (
									<Spinner />
								) : (
									<RemixIcon name="sparkling" size="size-4" />
								)}
								生成任务草稿
							</Button>
							<Button
								disabled={
									!naturalDraft ||
									naturalDraft.extracted.missingFields.length > 0 ||
									creatingNaturalLoop
								}
								onClick={createNaturalLoop}
							>
								{creatingNaturalLoop ? (
									<Spinner />
								) : (
									<RemixIcon name="add" size="size-4" />
								)}
								创建并后台运行
							</Button>
						</div>

						{naturalDraft ? (
							<div className="rounded-md border border-border bg-background p-3 text-sm">
								<div className="flex items-start justify-between gap-3">
									<div>
										<div className="font-medium">{naturalDraft.name}</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{naturalDraft.description}
										</div>
									</div>
									<Badge variant="outline" className="rounded-md">
										{naturalDraft.extracted.externalWriteMode ===
										"loop_approved"
											? "自动执行"
											: "执行前确认"}
									</Badge>
								</div>
								<div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
									<div>时间：{naturalDraft.extracted.scheduleLabel}</div>
									<div>时区：{naturalDraft.extracted.timezone}</div>
									<div>
										收件人：{naturalDraft.extracted.recipientName ?? "未识别"}
									</div>
									<div>城市：{naturalDraft.extracted.city ?? "未识别"}</div>
									<div>
										执行策略：
										{naturalDraft.extracted.externalWriteMode ===
										"loop_approved"
											? "任务内自动执行"
											: "执行前人工确认"}
									</div>
									<div>
										识别模型：{naturalDraft.planner?.model ?? "本地大模型"}
									</div>
								</div>
								{naturalDraft.extracted.missingFields.length > 0 ? (
									<div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
										还缺少参数：
										{naturalDraft.extracted.missingFields.join(", ")}
									</div>
								) : null}
							</div>
						) : null}
					</div>
				</DialogContent>
			</Dialog>
		</main>
	);
}
