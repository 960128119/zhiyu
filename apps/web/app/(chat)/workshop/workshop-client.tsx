"use client";

import { RemixIcon } from "@/components/remix-icon";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { WorkshopLoadingShell } from "./workshop-loading-shell";
import { HarnessEvolutionPanel } from "./harness-evolution-panel";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@openzhiyu/ui";
import {
  getWorkshopBoundaryPolicy,
  parseRecipientList,
  serializeWorkshopBoundaryPolicy,
  type WorkshopBoundaryMode,
  type WorkshopBoundaryPolicy,
  type WorkshopExternalMessagePolicy,
} from "@/lib/workshops/boundary-policy";
import { workDisplayLabel } from "@/lib/workshops/display-labels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Workshop = {
  id: string;
  name: string;
  mission: string;
  status: string;
  autonomyLevel: WorkshopBoundaryMode;
  boundaryPolicy: Record<string, unknown>;
  modelConfig?: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
};

type WorkshopEvent = {
  id: string;
  workshopId: string;
  runId: string | null;
  loopId?: string | null;
  loopRunId?: string | null;
  seq: number;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type WorkshopAgentChangeAction = "apply" | "reject" | "recreate";

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

type WorkshopLoop = {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  status: string;
  updatedAt: string;
  createdAt: string;
};

type WorkshopDashboardLoop = {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  dashboardStatus: string;
  status: string;
  triggerConfig: Record<string, unknown>;
  currentPhase: string | null;
  nextAction: string | null;
  blockedReason: string | null;
  lastObservation: string | null;
  stateJson: Record<string, unknown>;
  nextScheduledRunAt: string | null;
  schedulerStatus: string | null;
  spaceSummary?: {
    triggerLabel: string;
    contextLabel?: string;
    permissionLabel: string;
    deliveryLabel: string | null;
    externalWriteMode?: string;
  };
  latestRun: {
    id?: string;
    status: string;
    startedAt?: string;
    completedAt?: string | null;
    outputSummary: string | null;
    error: string | null;
    verificationPassed?: boolean | null;
    checkerAction?: string | null;
    checkerType?: string | null;
    requiresApproval: boolean;
    denied?: boolean;
    actionGuardMode?: string | null;
    actionGuardBlocked: boolean;
    modelCheckerEnabled?: boolean;
    modelCheckerReason?: string | null;
    executionTrace?: {
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
  } | null;
};

type WorkshopLoopRun = NonNullable<WorkshopDashboardLoop["latestRun"]>;

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

type DouyinDraftSummary = {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  topics?: string[];
  video_path: string;
  cover_path?: string | null;
  scheduled_at?: string | null;
  ai_generated?: boolean;
  account_label?: string | null;
  source?: Record<string, unknown>;
  updated_at: string;
};

type DouyinDraftListResponse = {
  ok: boolean;
  drafts: DouyinDraftSummary[];
  error?: string;
};

type InteractionEvent = {
  id: string;
  platform: string;
  source: string;
  conversationId: string | null;
  conversationName: string;
  conversationType: string;
  senderName: string | null;
  senderDisplayName: string | null;
  direction: string;
  contentType: string;
  contentPreview: string;
  messageTime: string;
  collectedAt: string;
  processedStatus: string;
  importance: string;
};

type InteractionNote = {
  id: string;
  noteType: string;
  title: string;
  body: string;
  confidence: number;
  sourceEventIds: string[];
  createdAt: string;
};

type InteractionTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  confidence: number;
  sourceEventIds: string[];
  createdAt: string;
};

type InteractionMemory = {
  id: string;
  memoryType: string;
  subject: string;
  content: string;
  status: string;
  confidence: number;
  tags: string[];
  sourceEventIds: string[];
  createdAt: string;
};

type InteractionWiki = {
  notes: InteractionNote[];
  tasks: InteractionTask[];
  memories: InteractionMemory[];
};

type WorkshopLoopApprovalRequest = {
  id: string;
  loopId: string;
  loopRunId: string | null;
  status: string;
  source: string;
  actionName: string;
  capability: string | null;
  reason: string | null;
  message: string | null;
  actionPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
};

type WorkshopLoopDetail = {
  loop: WorkshopDashboardLoop & {
    contextConfig?: Record<string, unknown>;
    actionPolicy?: Record<string, unknown>;
    verificationConfig?: Record<string, unknown>;
    approvalPolicy?: Record<string, unknown>;
    retryPolicy?: Record<string, unknown>;
    escalationPolicy?: Record<string, unknown>;
    runs: WorkshopLoopRun[];
  };
  events: WorkshopEvent[];
  approvalRequests: WorkshopLoopApprovalRequest[];
  outbox: WorkshopOutbox[];
};

type WorkshopHeartbeat = {
  workshopId: string;
  enabled: boolean;
  mode: string;
  nextWakeupAt: string | null;
  lastWakeupAt: string | null;
  lastHeartbeatAt: string | null;
  schedulerStatus: string;
  schedulerError: string | null;
  consecutiveFailures: number;
  leaseUntil: string | null;
  heartbeatPolicy: Record<string, unknown>;
};

type WorkshopDashboard = {
  status: string;
  counts: {
    loops: number;
    activeLoops: number;
    pendingLoopProposals: number;
    pendingOutbox: number;
    pendingApprovals: number;
    blockedLoops: number;
    errorLoops: number;
    sources: number;
    memories: number;
    directives: number;
  };
  nextWork: {
    source: "heartbeat" | "loop" | null;
    at: string | null;
    label: string;
  };
  recentFinding: WorkshopEvent | null;
  latestEvent: WorkshopEvent | null;
  pendingOutbox: WorkshopOutbox[];
  pendingLoopProposals: WorkshopDashboardLoop[];
  blockedLoops: WorkshopDashboardLoop[];
  loops: WorkshopDashboardLoop[];
};

type HeartbeatPolicyForm = {
  enabled: boolean;
  allowAgentSuggestedWakeup: boolean;
  minIntervalMinutes: number;
  defaultDelayMinutes: number;
  maxIntervalMinutes: number;
  missedRunGraceMinutes: number;
  leaseMinutes: number;
  maxConsecutiveFailures: number;
};

type WorkshopDetail = {
  workshop: Workshop;
  heartbeat: WorkshopHeartbeat | null;
  loops: WorkshopLoop[];
  events: WorkshopEvent[];
  sources: WorkshopSource[];
  memories: WorkshopMemory[];
  outbox: WorkshopOutbox[];
  dashboard: WorkshopDashboard | null;
};

type AgentToolAvailability =
  | "allow"
  | "require_approval"
  | "deny"
  | "chat_only"
  | "workshop_only"
  | "loop_only"
  | "disabled"
  | "unknown";

type AgentToolSource =
  | "claude_builtin"
  | "business_tools"
  | "workshop_tools"
  | "skill"
  | "user_mcp";

type AgentToolRisk = "low" | "medium" | "high" | "critical";

type AgentToolConfirmation = {
  surface:
    | "chat_confirm"
    | "workshop_task_tab"
    | "workshop_outbox_tab"
    | "workshop_review_tab"
    | "loop_approval"
    | "boundary_policy";
  label: string;
  description: string;
};

type AgentToolMatrixItem = {
  id: string;
  name: string;
  displayName: string;
  source: AgentToolSource;
  serverName?: string;
  description: string;
  capabilities: string[];
  risk: AgentToolRisk;
  runtimeScopes: string[];
  availability: AgentToolAvailability;
  decisionReason: string;
  confirmation?: AgentToolConfirmation;
  effectivePolicy?: Record<string, unknown>;
};

type AgentToolMatrixResponse = {
  runtime: string;
  workshopId?: string;
  generatedAt: string;
  tools: AgentToolMatrixItem[];
  counts: {
    total: number;
    allow: number;
    requireApproval: number;
    deny: number;
    disabled: number;
    unknown: number;
    bySource: Record<AgentToolSource, number>;
    byRisk: Record<AgentToolRisk, number>;
  };
};

type WorkshopWorkModel = {
  manifest: {
    id: string;
    name: string;
    role: string;
    mission: string;
    status: string;
    autonomyLevel: string;
    version: string;
    updatedAt: string;
  };
  controlContract: {
    controlledObjects: string[];
    observations: string[];
    allowedActions: string[];
    approvalRequiredActions: string[];
    deniedActions: string[];
    boundaryMode: string;
    externalMessagePolicy: string;
    feedbackSignals: string[];
    conflicts: Array<{ kind: string; tool: string }>;
  };
  skillBindings: {
    primarySkills: string[];
    loopSkillMap: Record<string, string>;
    availableSkills: string[];
    missingSkills: string[];
  };
  loopBindings: Array<{
    id: string;
    name: string;
    status: string;
    triggerType: string;
    nextScheduledRunAt: string | null;
    requiredFields: string[];
    skillName: string | null;
    skillStatus: "bound" | "missing" | "unmapped";
    hasActionPolicy: boolean;
    hasVerification: boolean;
  }>;
  memoryPolicy: {
    defaultReadableKinds: string[];
    evidenceRequiredForHighImpact: boolean;
    writeReusableFindingsToMemory: boolean;
  };
  artifactPolicy: {
    eventTypes: string[];
    proposalTypes: string[];
    outboxEnabled: boolean;
  };
  feedback: {
    nextWakeupAt: string | null;
    heartbeatStatus: string | null;
    pendingReviewSurfaces: string[];
    feedbackSignals: string[];
  };
  observability: {
    missing: string[];
    warnings: string[];
  };
  changeControl: {
    proposalSurface: "workshop_review_tab";
    highRiskChanges: string[];
    mediumRiskChanges: string[];
    lowRiskChanges: string[];
  };
};

type WorkshopWorkVersion = {
  id: string;
  workshopId: string;
  version: string;
  source: string;
  changeEventId: string | null;
  snapshot: Record<string, unknown>;
  patch: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

type WorkshopWorkResponse = {
  work: WorkshopWorkModel;
  versions?: WorkshopWorkVersion[];
};

type LoadedWorkshopPanels = {
  dashboard: boolean;
  work: boolean;
  sources: boolean;
  memories: boolean;
  outbox: boolean;
};

type WorkshopManifestReview = {
  ok: boolean;
  manifestName: string | null;
  title: string | null;
  summary: {
    loops: number;
    sources: number;
    requestedTools: number;
    requestedSkills: number;
    deniedTools: number;
  };
  issues: Array<{
    severity: "error" | "warning";
    path: string;
    message: string;
  }>;
  requestedTools: string[];
  deniedTools: string[];
  requestedSkills: string[];
  creationReport: {
    title: string;
    body: string;
  } | null;
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

const WORKSHOP_TEMPLATES = [
  {
    id: "a-share-research",
    label: "A 股研",
    name: "每日 A 股复",
    mission:
      "你是我的 A 股研究分析师。每个交易日复盘市场结构、情绪和主线，整理有可靠来源的公司变化，并给出明日观察清单触发条件失效条件和风险。不得执行交易",
  },
  {
    id: "daily-brief",
    label: "每日箢",
    name: "每日信息箢",
    mission:
      "每天汇我关心的信息源，去重并按重要排序，给出事实、影响待办和原始来源。没有重要变化时明确说明，不为凑数生成内容",
  },
  {
    id: "customer-follow-up",
    label: "客户跟进",
    name: "客户跟进车间",
    mission:
      "持续整理客户沟中的明确需求承诺负责人和截止时间，生成跟进建议与回复草稿任何外发都必须先进入待确认",
  },
  {
    id: "competitor-radar",
    label: "竞品雷达",
    name: "竞品雷达车间",
    mission:
      "持续跟踪指定竞品的产品价格渠道和团队变化，保留来源与时间，区分事实和判断，只在出现实质变化时提醒",
  },
] as const;

const DEFAULT_WORKSHOP_MANIFEST_YAML = `apiVersion: openzhiyu.ai/v1alpha1
kind: Workshop
metadata:
  name: watchlist-hunter
  title: 自选股猎手
spec:
  mission: >
    发现候选、维护自选股池，输出可审计调整提案。
  role: watchlist_selector
  autonomyLevel: auto
  control:
    object: paper_trading_watchlist
    objective: maintain_a_small_explainable_auditable_candidate_set
    mode: internal_watchlist_control
    feedback:
      - market_candidate_discovery
      - current_watchlist_review
      - watchlist_change_proposals
      - proposal_application_results
      - data_quality_warnings
      - workshop_memory
    invariants:
      - 只维护内部模拟盘使用的自选股池和候选池。
      - 不做任何模拟盘或真实盘交易。
      - 候选发现是观测，不等于加入交易池。
      - 自选股调整必须通过 quantPaperProposeWatchlistChange 形成可审计提案。
      - 数据源降级必须显式暴露 provider、detail、warning。
  modelConfig:
    role: watchlist_selector
    primarySkills:
      - watchlist-selection-control
    allowedTools:
      - quantMarketDiscoverCandidates
      - quantPaperGetWatchlist
      - quantPaperGetAccount
      - quantPaperProposeWatchlistChange
      - aStockTrendSystem
      - aStockSignals
      - aStockMarketMood
      - workshopReadMemory
      - workshopSearchMemory
      - workshopGetMemoryEvidence
      - workshopLogEvent
      - workshopWriteMemory
    disallowedTools:
      - quantPaperPlaceOrder
      - quantPaperCancelOrder
      - realBrokerOrder
      - externalPayment
      - wechatSendMessage
      - outboxSend
    observationTools:
      - quantPaperGetWatchlist
      - quantPaperGetAccount
      - quantMarketDiscoverCandidates
      - aStockTrendSystem
      - aStockSignals
      - aStockMarketMood
    loopSkillMap:
      交易日收盘后自选股筛选: watchlist-selection-control
    explorationPolicy:
      minThemesPerRun: 2
      requireConcreteProposalWhenBetterReplacementFound: true
      noProposalRequiresBlocker: true
  boundaryPolicy:
    mode: auto
    externalMessages: blocked
    deniedPrecedence: true
    hardDeniedActions:
      - bash
      - shell
      - exec
      - Bash
      - Edit
      - Write
      - rm
      - delete
      - remove
      - drop
      - truncate
      - placeOrder
      - executeOrder
      - submitOrder
      - buy
      - sell
      - trade
      - makePayment
      - payInvoice
      - transferMoney
      - wireTransfer
      - wechatDesktopSendMessage
      - douyinPublishApprovedDraft
      - quantPaperPlaceOrder
      - quantPaperCancelOrder
      - deleteLoopTask
    customInstructions: |
      这是自选股猎手车间。它维护候选池和核心/交易自选股池，为操盘交易员提供可交易学习样本。
      允许读取当前自选股、扫描市场候选、读取趋势/信号/市场情绪，并在证据足够时调用 quantPaperProposeWatchlistChange 生成可审计的自选股调整提案。
      禁止任何模拟盘下单、撤单、真实交易、真实资金划转、真实券商连接或对外发送交易指令。
      不得调用 quantPaperPlaceOrder 或 quantPaperCancelOrder。
      每次不提案时必须写清楚具体 blocker，不能只写“维持现状”。
      对外消息默认禁止。
  sources:
    - name: quantPaperGetWatchlist
      type: connector
      purpose: 读取当前模拟盘自选股和最新报价快照。
    - name: quantMarketDiscoverCandidates
      type: connector
      purpose: 按主题或风格方向扫描市场候选，形成候选池观测。
    - name: quantPaperProposeWatchlistChange
      type: connector
      purpose: 创建可审计的自选股调整提案，校验通过后应用。
    - name: aStockTrendSystem
      type: connector
      purpose: 读取自选股和候选股趋势结构、相对强弱和风控状态。
    - name: aStockSignals
      type: connector
      purpose: 读取资金、信号和候选辅助证据。
    - name: aStockMarketMood
      type: connector
      purpose: 读取市场情绪、行业热度、涨跌停和风险背景。
    - name: watchlistMemory
      type: memory
      query: 自选股 猎手 候选 提案 blocker 学习
  loops:
    - name: post-close-watchlist-selection
      title: 交易日收盘后自选股筛选
      description: 交易日 16:20 扫描候选、复核自选股，并在证据足够时自动应用自选股调整。
      skill: watchlist-selection-control
      status: active
      trigger:
        type: cron
        expression: "20 16 * * 1-5"
        timezone: Asia/Shanghai
        tradingCalendar: a-share
        tradingDayOnly: true
      goal: |
        维护候选池和核心/交易自选股池，为操盘交易员提供可交易学习样本。
        每次至少扫描两个主题或风格方向，调用 quantMarketDiscoverCandidates。
        发现明显优于现有弱标的的候选时，必须调用 quantPaperProposeWatchlistChange。
        如果连续维持现状，必须写清楚阻止提案的具体原因：估值、趋势、流动性、数据质量、持仓保护或证据不足。
      context:
        sources:
          - type: connector
            name: quantPaperGetWatchlist
          - type: connector
            name: quantMarketDiscoverCandidates
          - type: connector
            name: aStockTrendSystem
          - type: connector
            name: aStockSignals
          - type: connector
            name: aStockMarketMood
          - type: memory
            name: watchlistMemory
            query: 自选股 猎手 候选 提案 blocker 学习
        instructions: |
          不要只复述当前自选股；每次必须做候选发现。
          候选不是立刻交易，但高质量候选要通过 quantPaperProposeWatchlistChange 晋升到 active core/trading watchlist。
          保持持仓和未成交委托标的受保护，不从行情跟踪宇宙移除。
      actionPolicy:
        allowed:
          - quantMarketDiscoverCandidates
          - quantPaperGetWatchlist
          - quantPaperGetAccount
          - quantPaperProposeWatchlistChange
          - aStockTrendSystem
          - aStockSignals
          - aStockMarketMood
          - workshopReadMemory
          - workshopSearchMemory
          - workshopGetMemoryEvidence
          - workshopLogEvent
          - workshopWriteMemory
        requiresApproval: []
        denied:
          - quantPaperPlaceOrder
          - quantPaperCancelOrder
          - realBrokerOrder
          - externalPayment
          - wechatSendMessage
          - outboxSend
      verification:
        type: structured_check
        requiredFields:
          - marketScanSummary
          - currentWatchlistReview
          - candidatePool
          - watchlistDecision
          - proposalOrBlocker
        requiredSources:
          - quantPaperGetWatchlist
          - quantPaperGetAccount
          - quantMarketDiscoverCandidates
        successCriteria:
          - 每次至少调用 quantMarketDiscoverCandidates 做候选发现
          - 有明确 add/remove/replace 时调用 quantPaperProposeWatchlistChange
          - 无提案时记录具体 blocker，不允许只写维持现状
          - 不调用任何模拟盘下单、撤单或真实交易工具
      approvalPolicy:
        defaultMode: allow
        externalWrites: deny
      retryPolicy:
        maxAttempts: 2
        onFailure: summarize_and_block
      escalationPolicy:
        onBlocked: notify_user
        onNeedsApproval: notify_user
  creationReport:
    title: 自选股猎手车间声明
    body: |
      创建一个内部自选股猎手车间。
      被控对象是内部模拟盘使用的候选池和核心/交易自选股池。
      控制动作包括读取自选股、扫描候选、写入车间事件、写入车间记忆、生成可审计自选股调整提案。
      禁止模拟盘下单、撤单、真实交易、真实资金划转、真实券商连接和对外发送交易指令。
      已配置交易日收盘后自选股筛选 Loop。
    requiredEvents:
      - 车间已创建
      - 自选股猎手候选发现与提案闭环已配置
    requiredFields:
      - marketScanSummary
      - currentWatchlistReview
      - candidatePool
      - watchlistDecision
      - proposalOrBlocker
  applyPolicy:
    idempotency:
      key: metadata.name
      loopKey: loops.name
      behavior: upsert
    dryRunSupported: true
    diffSupported: true
    versionSnapshot: true
    auditEvent: true
`;

const SIDE_PANEL_TAB_VALUES = [
  "work",
  "sources",
  "interactions",
  "memory",
  "loops",
  "outbox",
  "tools",
  "review",
  "evolution",
  "boundary",
] as const;

type SidePanelTab = (typeof SIDE_PANEL_TAB_VALUES)[number];
type SidePanelDirection = "previous" | "next";

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

function formatDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "暂无安排";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无安排";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dashboardStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "运行",
    draft: "草60",
    paused: "已暂",
    archived: "已归",
    blocked: "已阻",
    needs_approval: "待确",
    error: "异常",
  };
  return labels[status] ?? status;
}

function dashboardStatusTone(status: string) {
  if (status === "needs_approval") return "text-amber-600 dark:text-amber-300";
  if (status === "blocked" || status === "error") {
    return "text-destructive";
  }
  if (status === "paused" || status === "archived") {
    return "text-muted-foreground";
  }
  return "text-emerald-600 dark:text-emerald-300";
}

function toolAvailabilityLabel(value: AgentToolAvailability) {
  const labels: Record<AgentToolAvailability, string> = {
    allow: "可用",
    require_approval: "霢确认",
    deny: "禁止",
    chat_only: "仅对",
    workshop_only: "仅车",
    loop_only: "仅任",
    disabled: "未开",
    unknown: "待探",
  };
  return labels[value] ?? value;
}

function toolAvailabilityClass(value: AgentToolAvailability) {
  if (value === "allow") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (value === "require_approval") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (value === "deny") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted text-muted-foreground";
}

function toolSourceLabel(value: AgentToolSource) {
  const labels: Record<AgentToolSource, string> = {
    claude_builtin: "Claude",
    business_tools: "业务 MCP",
    workshop_tools: "车间 MCP",
    skill: "Skill",
    user_mcp: "自定义 MCP",
  };
  return labels[value] ?? value;
}

function toolRiskLabel(value: AgentToolRisk) {
  const labels: Record<AgentToolRisk, string> = {
    low: "低风",
    medium: "中风",
    high: "高风",
    critical: "关键风险",
  };
  return labels[value] ?? value;
}

function toolCapabilityLabel(value: string) {
  const labels: Record<string, string> = {
    file_read: "读文",
    file_write: "写文",
    code_exec: "命令",
    web_read: "联网",
    memory_read: "读记",
    memory_write: "写记",
    knowledge_read: "知识",
    message_read: "读消",
    external_draft: "草60",
    external_send: "外发",
    task_create: "建任",
    task_manage: "管任",
    market_data: "行情",
    browser: "浏览",
    document: "文档",
    spreadsheet: "表格",
    presentation: "幻灯",
    time: "时间",
    unknown: "复合",
  };
  return labels[value] ?? value;
}

function interactionStatusLabel(value: string) {
  const labels: Record<string, string> = {
    candidate: "候",
    confirmed: "已确",
    done: "已完",
    dismissed: "已忽",
    archived: "已归",
  };
  return labels[value] ?? value;
}

function canConfirmInteractionItem(status: string) {
  return status === "candidate";
}

function isPendingLoopProposal(loop: { stateJson?: Record<string, unknown> }) {
  const activationStatus = loop.stateJson?.ownerActivationStatus;
  return (
    loop.stateJson?.requiresOwnerActivation === true &&
    (activationStatus === undefined || activationStatus === "pending")
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringListValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function metadataStringList(value: unknown): string[] {
  return stringListValue(value);
}

function sourceNamesFromSpec(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => objectValue(item).name ?? objectValue(item).id)
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function truncateList(values: string[], fallback: string, max = 3) {
  if (values.length === 0) return fallback;
  const visible = values.slice(0, max).join("、");
  return values.length > max
    ? `${visible} +${values.length - max} 项`
    : visible;
}

function booleanLabel(value: boolean | null | undefined) {
  if (value === true) return "通过";
  if (value === false) return "未通过";
  return "暂无";
}

function durationLabel(value: number | null | undefined) {
  if (!value || value < 0) return "暂无";
  if (value < 1000) return `${value}ms`;
  return `${Math.round(value / 100) / 10}s`;
}

function approvalContinuationStatus(request: WorkshopLoopApprovalRequest) {
  const continuation = objectValue(request.actionPayload?.continuation);
  return stringValue(continuation.status);
}

function canResumeApproval(request: WorkshopLoopApprovalRequest) {
  return (
    request.status === "approved" &&
    approvalContinuationStatus(request) === "ready"
  );
}

function isOwnerInputOutbox(item: WorkshopOutbox) {
  return stringValue(item.boundaryResult?.status) === "needs_owner_input";
}

function canPreviewOutbox(item: WorkshopOutbox) {
  return !isOwnerInputOutbox(item) && item.status !== "sent";
}

function canSendOutbox(item: WorkshopOutbox) {
  return (
    !isOwnerInputOutbox(item) &&
    (item.status === "pending_approval" || item.status === "approved")
  );
}

function isWatchlistProposalEvent(event: WorkshopEvent) {
  return (
    event.type === "watchlist_proposal" &&
    event.metadata?.kind === "watchlist_change_proposal"
  );
}

function watchlistProposalResolution(
  events: WorkshopEvent[],
  proposal: WorkshopEvent,
) {
  const proposalId =
    typeof proposal.metadata?.proposalId === "string"
      ? proposal.metadata.proposalId
      : null;
  return events.find((event) => {
    if (
      event.type !== "watchlist_proposal_applied" &&
      event.type !== "watchlist_proposal_rejected"
    ) {
      return false;
    }
    return (
      event.metadata?.sourceProposalEventId === proposal.id ||
      (proposalId && event.metadata?.proposalId === proposalId)
    );
  });
}

function pendingWatchlistProposalEvents(events: WorkshopEvent[]) {
  return events
    .filter(
      (event) =>
        isWatchlistProposalEvent(event) &&
        event.metadata?.status === "pending_approval" &&
        event.metadata?.approvalRequired !== false &&
        !watchlistProposalResolution(events, event),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        b.seq - a.seq,
    );
}

function isVideoReviewEvent(event: WorkshopEvent) {
  return (
    event.type === "video_review_approved" ||
    event.type === "video_review_rejected" ||
    event.type === "video_review_regenerate_requested"
  );
}

function isAgentChangeProposalEvent(event: WorkshopEvent) {
  return event.type === "workshop_agent_change_proposed";
}

function isAgentChangeResolutionEvent(event: WorkshopEvent) {
  return (
    event.type === "workshop_agent_change_applied" ||
    event.type === "workshop_agent_change_rejected" ||
    event.type === "workshop_agent_change_superseded"
  );
}

function agentChangeProposalResolution(
  events: WorkshopEvent[],
  proposal: WorkshopEvent,
) {
  return events.find(
    (event) =>
      isAgentChangeResolutionEvent(event) &&
      event.metadata?.proposalEventId === proposal.id,
  );
}

function pendingAgentChangeProposalEvents(events: WorkshopEvent[]) {
  return events
    .filter(
      (event) =>
        isAgentChangeProposalEvent(event) &&
        !agentChangeProposalResolution(events, event),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        b.seq - a.seq,
    );
}

function videoDraftBelongsToWorkshop(
  draft: DouyinDraftSummary,
  workshopId: string,
) {
  const source = objectValue(draft.source);
  if (source.workshopId === workshopId) return true;
  return draft.video_path.includes(workshopId);
}

function videoDraftReviewResolution(
  events: WorkshopEvent[],
  draft: DouyinDraftSummary,
) {
  return events.find(
    (event) =>
      isVideoReviewEvent(event) &&
      stringValue(event.metadata?.draftId) === draft.id,
  );
}

function pendingVideoDrafts(
  drafts: DouyinDraftSummary[],
  events: WorkshopEvent[],
  workshopId: string | null,
) {
  if (!workshopId) return [];
  return drafts
    .filter(
      (draft) =>
        draft.status === "draft" &&
        videoDraftBelongsToWorkshop(draft, workshopId) &&
        !videoDraftReviewResolution(events, draft),
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
}

function workRoleLabel(value: string) {
  const labels: Record<string, string> = {
    paper_trader: "操盘交易员",
    watchlist_selector: "自选股猎手",
    owner_context_steward: "知识库管家",
    investment_publisher: "投研发布官",
    general_workshop: "通用车间",
  };
  return labels[value] ?? value;
}

function compactWorkshopMission(mission: string, maxLength = 42) {
  const text = mission.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function workshopDisplayDescription(workshop: Workshop) {
  const modelConfig =
    workshop.modelConfig && typeof workshop.modelConfig === "object"
      ? workshop.modelConfig
      : {};
  const role =
    typeof modelConfig.role === "string" ? modelConfig.role : undefined;
  const manifestName =
    typeof modelConfig.manifestName === "string"
      ? modelConfig.manifestName
      : undefined;

  const summaries: Record<string, string> = {
    watchlist_selector: "发现候选、维护自选股池，输出可审计调整提案。",
    paper_trader: "消费自选股，执行模拟盘计划、交易和复盘。",
    owner_context_steward: "沉淀主人上下文，维护可引用的长期记忆。",
    investment_publisher: "整理投研内容，生成可审核的发布草稿。",
    general_workshop: "持续观测、沉淀记忆，并按边界推进任务。",
  };

  if (role && summaries[role]) return summaries[role];
  if (manifestName === "watchlist-hunter") return summaries.watchlist_selector;
  if (manifestName === "paper-trader") return summaries.paper_trader;

  return compactWorkshopMission(workshop.mission);
}

function skillStatusLabel(value: "bound" | "missing" | "unmapped") {
  const labels = {
    bound: "已绑定",
    missing: "缺失",
    unmapped: "未映射",
  };
  return labels[value];
}

function skillStatusClass(value: "bound" | "missing" | "unmapped") {
  if (value === "bound") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (value === "missing") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function isSystemGovernanceLoopBinding(
  loop: WorkshopWorkModel["loopBindings"][number],
) {
  return (
    loop.name === "Work 自检升级" ||
    loop.requiredFields.includes("workHealthSummary")
  );
}

function loopSkillStatusLabel(loop: WorkshopWorkModel["loopBindings"][number]) {
  return isSystemGovernanceLoopBinding(loop)
    ? "内置治理"
    : skillStatusLabel(loop.skillStatus);
}

function loopSkillStatusClass(loop: WorkshopWorkModel["loopBindings"][number]) {
  if (isSystemGovernanceLoopBinding(loop)) {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  return skillStatusClass(loop.skillStatus);
}

function loopSkillDescription(loop: WorkshopWorkModel["loopBindings"][number]) {
  if (isSystemGovernanceLoopBinding(loop)) {
    return "使用工作自检模板内置治理规则，不需要绑定业务方法论";
  }
  return loop.skillName ? workDisplayLabel(loop.skillName) : "未映射方法论";
}

function CompactTagList({
  values,
  empty,
  max = 8,
  label = workDisplayLabel,
}: {
  values: string[];
  empty: string;
  max?: number;
  label?: (value: string) => string;
}) {
  const visible = values.slice(0, max);
  return values.length === 0 ? (
    <p className="text-sm text-muted-foreground">{empty}</p>
  ) : (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((value) => (
        <span
          key={value}
          className="max-w-full break-all rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
        >
          {label(value)}
        </span>
      ))}
      {values.length > max ? (
        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          +{values.length - max}
        </span>
      ) : null}
    </div>
  );
}

function WorkMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function formatWorkVersion(value: string | null | undefined) {
  if (!value) return "暂无版本";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return formatDateTime(value);
  return value;
}

function recentAgentChangeProposalEvents(events: WorkshopEvent[], limit = 5) {
  return events
    .filter(isAgentChangeProposalEvent)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        b.seq - a.seq,
    )
    .slice(0, limit);
}

function agentChangeStatusLabel(
  proposal: WorkshopEvent,
  resolution: WorkshopEvent | undefined,
  currentWorkVersion: string,
) {
  if (resolution?.type === "workshop_agent_change_applied") return "已应用";
  if (resolution?.type === "workshop_agent_change_rejected") return "已驳回";
  if (resolution?.type === "workshop_agent_change_superseded") return "已重建";
  const proposalVersion = stringValue(proposal.metadata?.workModelVersion);
  if (proposalVersion && proposalVersion !== currentWorkVersion)
    return "已过期";
  return "待审核";
}

function agentChangeStatusClass(status: string) {
  if (status === "已应用") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "已过期") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (status === "待审核") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "已重建") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function WorkChangeHistory({
  work,
  events,
}: {
  work: WorkshopWorkModel;
  events: WorkshopEvent[];
}) {
  const proposals = recentAgentChangeProposalEvents(events);
  const staleCount = proposals.filter((proposal) => {
    const resolution = agentChangeProposalResolution(events, proposal);
    const proposalVersion = stringValue(proposal.metadata?.workModelVersion);
    return (
      !resolution &&
      proposalVersion !== null &&
      proposalVersion !== work.manifest.version
    );
  }).length;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">最近配置变更</h4>
        <Badge variant={staleCount > 0 ? "destructive" : "outline"}>
          {proposals.length}
        </Badge>
      </div>
      {staleCount > 0 ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
          有 {staleCount} 个提案基于旧版本创建，需要重新生成提案后再提交。
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无配置变更记录。</p>
        ) : (
          proposals.map((proposal) => {
            const resolution = agentChangeProposalResolution(events, proposal);
            const status = agentChangeStatusLabel(
              proposal,
              resolution,
              work.manifest.version,
            );
            const diff = Array.isArray(proposal.metadata?.diff)
              ? proposal.metadata.diff.filter(
                  (item): item is Record<string, unknown> =>
                    Boolean(item) &&
                    typeof item === "object" &&
                    !Array.isArray(item),
                )
              : [];
            const changedFields = diff
              .map((item) => stringValue(item.field))
              .filter((item): item is string => Boolean(item));
            const proposalVersion = stringValue(
              proposal.metadata?.workModelVersion,
            );
            const appliedVersion = stringValue(
              resolution?.metadata?.workVersionAfter,
            );

            return (
              <div
                key={proposal.id}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium text-foreground">
                      {proposal.title}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(proposal.createdAt)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-2 py-1 text-xs",
                      agentChangeStatusClass(status),
                    )}
                  >
                    {status}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">基于版本</span>
                    <p className="mt-1 break-all text-foreground">
                      {formatWorkVersion(proposalVersion)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">应用后版本</span>
                    <p className="mt-1 break-all text-foreground">
                      {formatWorkVersion(appliedVersion)}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <CompactTagList
                    values={changedFields}
                    empty="暂无字段差异"
                    max={6}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function workVersionSourceLabel(source: string) {
  const labels: Record<string, string> = {
    created: "创建",
    manual_update: "手动修改",
    agent_change_apply: "提案应用",
    restore: "版本恢复",
  };
  return labels[source] ?? source;
}

function WorkVersionHistory({
  currentVersion,
  versions,
  restoringVersionId,
  onRestore,
}: {
  currentVersion: string;
  versions: WorkshopWorkVersion[];
  restoringVersionId: string | null;
  onRestore: (version: WorkshopWorkVersion) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">工作版本历史</h4>
        <Badge variant="outline">{versions.length}</Badge>
      </div>
      {versions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          暂无结构化版本快照，下一次创建、修改或应用提案后会自动记录。
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {versions.map((version) => {
            const isCurrent = version.version === currentVersion;
            return (
              <div
                key={version.id}
                className="rounded-md border border-border bg-background p-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-all font-medium text-foreground">
                      {formatWorkVersion(version.version)}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {workVersionSourceLabel(version.source)} /{" "}
                      {formatDateTime(version.createdAt)}
                    </div>
                  </div>
                  {isCurrent ? (
                    <Badge variant="secondary">当前</Badge>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{version.createdBy}</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        disabled={restoringVersionId === version.id}
                        onClick={() => onRestore(version)}
                      >
                        <RemixIcon name="restart" size="size-3.5" />
                        {restoringVersionId === version.id ? "恢复中" : "恢复"}
                      </Button>
                    </div>
                  )}
                </div>
                {Object.keys(version.patch ?? {}).length > 0 ? (
                  <div className="mt-2 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                    变更字段：{Object.keys(version.patch).join(" / ")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkPanel({
  work,
  events,
  versions,
  restoringVersionId,
  onRestoreVersion,
}: {
  work: WorkshopWorkModel | null;
  events: WorkshopEvent[];
  versions: WorkshopWorkVersion[];
  restoringVersionId: string | null;
  onRestoreVersion: (version: WorkshopWorkVersion) => void;
}) {
  if (!work) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        正在读取工作模型...
      </div>
    );
  }

  const problems = [
    ...work.observability.missing.map((item) => `缺失：${item}`),
    ...work.observability.warnings,
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {workRoleLabel(work.manifest.role)}
              </Badge>
              <Badge variant="outline">
                {dashboardStatusLabel(work.manifest.status)}
              </Badge>
              <Badge variant="outline">
                边界 {workDisplayLabel(work.controlContract.boundaryMode)}
              </Badge>
            </div>
            <h4 className="mt-2 break-words text-sm font-medium text-foreground">
              {work.manifest.name}
            </h4>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {work.manifest.mission}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <WorkMetric
            label="版本"
            value={formatWorkVersion(work.manifest.version)}
          />
          <WorkMetric
            label="下次工作"
            value={formatDateTime(work.feedback.nextWakeupAt)}
          />
          <WorkMetric
            label="可用动作"
            value={work.controlContract.allowedActions.length}
          />
          <WorkMetric
            label="需审核"
            value={work.controlContract.approvalRequiredActions.length}
          />
        </div>
      </div>

      {problems.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <RemixIcon name="alert" size="size-4" />
            工作区需要处理
          </div>
          <div className="mt-2 space-y-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
            {problems.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          控制契约、方法论和任务映射当前完整。
        </div>
      )}

      <div className="rounded-lg border border-border p-3">
        <h4 className="text-sm font-medium text-foreground">控制契约</h4>
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              被控对象
            </div>
            <CompactTagList
              values={work.controlContract.controlledObjects}
              empty="未声明被控对象"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              观测输入
            </div>
            <CompactTagList
              values={work.controlContract.observations}
              empty="未声明观测输入"
              max={10}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              禁止动作
            </div>
            <CompactTagList
              values={work.controlContract.deniedActions}
              empty="暂无显式禁止动作"
              max={10}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground">方法论</h4>
          <Badge variant="outline">
            {work.skillBindings.primarySkills.length}
          </Badge>
        </div>
        <div className="mt-3">
          <CompactTagList
            values={work.skillBindings.primarySkills}
            empty="未绑定主要方法论"
            max={12}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground">任务映射</h4>
          <Badge variant="outline">{work.loopBindings.length}</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {work.loopBindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无任务</p>
          ) : (
            work.loopBindings.map((loop) => (
              <div
                key={loop.id}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {loop.name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {workDisplayLabel(loop.triggerType)} /{" "}
                      {loop.requiredFields.length} 个校验字段
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-2 py-1 text-xs",
                      loopSkillStatusClass(loop),
                    )}
                  >
                    {loopSkillStatusLabel(loop)}
                  </span>
                </div>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {loopSkillDescription(loop)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <h4 className="text-sm font-medium text-foreground">变更边界</h4>
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              高风险，必须审核
            </div>
            <CompactTagList
              values={work.changeControl.highRiskChanges}
              empty="暂无"
              max={8}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              中风险，进入提案
            </div>
            <CompactTagList
              values={work.changeControl.mediumRiskChanges}
              empty="暂无"
              max={8}
            />
          </div>
        </div>
      </div>

      <WorkChangeHistory work={work} events={events} />
      <WorkVersionHistory
        currentVersion={work.manifest.version}
        versions={versions}
        restoringVersionId={restoringVersionId}
        onRestore={onRestoreVersion}
      />
    </div>
  );
}

function workLogEvents(events: WorkshopEvent[]) {
  return events.filter(
    (event) =>
      !(
        event.type === "agent_text" &&
        event.title.toLowerCase().includes("partial")
      ) &&
      (!isWatchlistProposalEvent(event) ||
        Boolean(watchlistProposalResolution(events, event)) ||
        event.metadata?.status !== "pending_approval" ||
        event.metadata?.approvalRequired === false) &&
      (!isAgentChangeProposalEvent(event) ||
        Boolean(agentChangeProposalResolution(events, event))),
  );
}

function proposalStatusText(
  proposal: WorkshopEvent,
  resolution: WorkshopEvent | undefined,
) {
  if (resolution?.type === "watchlist_proposal_applied") return "已应用";
  if (resolution?.type === "watchlist_proposal_rejected") return "已拒绝";
  const status =
    typeof proposal.metadata?.status === "string"
      ? proposal.metadata.status
      : "pending_approval";
  if (status === "invalid") return "校验未过";
  if (status === "pending_approval") return "待确认";
  return status;
}

function WatchlistProposalEventCard({
  event,
  resolution,
  actionId,
  onResolve,
}: {
  event: WorkshopEvent;
  resolution?: WorkshopEvent;
  actionId: string | null;
  onResolve: (eventId: string, action: "apply" | "reject") => void;
}) {
  const metadata = event.metadata ?? {};
  const validation = objectValue(metadata.validation);
  const before = metadataStringList(metadata.before);
  const current = metadataStringList(metadata.current);
  const after = metadataStringList(metadata.after);
  const add = metadataStringList(metadata.add);
  const adds = metadataStringList(metadata.adds);
  const remove = metadataStringList(metadata.remove);
  const removes = metadataStringList(metadata.removes);
  const issues = metadataStringList(validation.issues);
  const warnings = metadataStringList(validation.warnings);
  const reason = stringValue(metadata.reason);
  const risk = stringValue(metadata.risk);
  const canApply =
    !resolution &&
    metadata.status === "pending_approval" &&
    validation.ok === true &&
    after.length > 0;
  const isApplying = actionId === `apply:${event.id}`;
  const isRejecting = actionId === `reject:${event.id}`;

  return (
    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">{proposalStatusText(event, resolution)}</Badge>
        {resolution ? (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(resolution.createdAt)}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <div className="text-muted-foreground">当前列表</div>
          <p className="mt-1 break-words text-foreground">
            {(before.length > 0 ? before : current).join(", ") || "-"}
          </p>
        </div>
        <div>
          <div className="text-muted-foreground">应用后列表</div>
          <p className="mt-1 break-words text-foreground">
            {after.join(", ") || "-"}
          </p>
        </div>
        <div>
          <div className="text-muted-foreground">加入</div>
          <p className="mt-1 break-words text-foreground">
            {(add.length > 0 ? add : adds).join(", ") || "-"}
          </p>
        </div>
        <div>
          <div className="text-muted-foreground">移除</div>
          <p className="mt-1 break-words text-foreground">
            {(remove.length > 0 ? remove : removes).join(", ") || "-"}
          </p>
        </div>
      </div>
      {reason || risk ? (
        <div className="mt-3 space-y-1 text-xs leading-5">
          {reason ? (
            <p>
              <span className="text-muted-foreground">理由</span>
              {reason}
            </p>
          ) : null}
          {risk ? (
            <p>
              <span className="text-muted-foreground">风险</span>
              {risk}
            </p>
          ) : null}
        </div>
      ) : null}
      {issues.length > 0 ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
          {issues.join(" / ")}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-background/60 p-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {warnings.join(" / ")}
        </div>
      ) : null}
      {!resolution ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => onResolve(event.id, "apply")}
            disabled={!canApply || Boolean(actionId)}
            className="gap-2"
          >
            <RemixIcon
              name={isApplying ? "loader" : "checkbox_circle"}
              size="size-4"
            />
            确认应用
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResolve(event.id, "reject")}
            disabled={Boolean(actionId)}
            className="gap-2"
          >
            <RemixIcon name={isRejecting ? "loader" : "close"} size="size-4" />
            拒绝
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VideoReviewCard({
  draft,
  actionId,
  onResolve,
}: {
  draft: DouyinDraftSummary;
  actionId: string | null;
  onResolve: (
    draftId: string,
    action: "approve" | "reject" | "regenerate",
  ) => void;
}) {
  const source = objectValue(draft.source);
  const sourceEventIds = stringListValue(source.sourceEventIds);
  const isApproving = actionId === `approve:${draft.id}`;
  const isRejecting = actionId === `reject:${draft.id}`;
  const isRegenerating = actionId === `regenerate:${draft.id}`;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">视频发布审核</Badge>
            <Badge variant="outline">{draft.status}</Badge>
            {draft.ai_generated ? (
              <Badge variant="outline">模型生成</Badge>
            ) : null}
          </div>
          <h4 className="mt-2 break-words text-sm font-medium text-foreground">
            {draft.title}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            更新时间 {formatDateTime(draft.updated_at)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,360px),1fr]">
        <div className="overflow-hidden rounded-md border border-border bg-black">
          <video
            controls
            preload="metadata"
            className="aspect-video w-full bg-black"
            src={`/api/douyin/drafts/${encodeURIComponent(draft.id)}/video`}
          />
        </div>
        <div className="space-y-3 text-xs leading-5">
          <div>
            <div className="font-medium text-muted-foreground">发布文案</div>
            <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 text-foreground">
              {draft.description || "暂无文案"}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground">话题</div>
              <p className="mt-1 break-words text-foreground">
                {(draft.topics ?? []).join(" / ") || "-"}
              </p>
            </div>
            <div>
              <div className="text-muted-foreground">发布账号</div>
              <p className="mt-1 break-words text-foreground">
                {draft.account_label || "默认账号"}
              </p>
            </div>
            <div>
              <div className="text-muted-foreground">来源运行</div>
              <p className="mt-1 break-words text-foreground">
                {stringValue(source.runId) ?? "-"}
              </p>
            </div>
            <div>
              <div className="text-muted-foreground">引用事件</div>
              <p className="mt-1 break-words text-foreground">
                {sourceEventIds.length ? `${sourceEventIds.length} 条` : "-"}
              </p>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">本地文件</div>
            <p className="mt-1 break-all text-foreground">{draft.video_path}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => onResolve(draft.id, "approve")}
          disabled={Boolean(actionId)}
          className="gap-2"
        >
          <RemixIcon
            name={isApproving ? "loader" : "checkbox_circle"}
            size="size-4"
          />
          通过并生成上传计划
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(draft.id, "regenerate")}
          disabled={Boolean(actionId)}
          className="gap-2"
        >
          <RemixIcon
            name={isRegenerating ? "loader" : "refresh"}
            size="size-4"
          />
          要求重生成
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(draft.id, "reject")}
          disabled={Boolean(actionId)}
          className="gap-2"
        >
          <RemixIcon name={isRejecting ? "loader" : "close"} size="size-4" />
          驳回
        </Button>
      </div>
    </div>
  );
}

function formatDiffValue(value: unknown) {
  if (value === undefined) return "未设置";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function AgentChangeProposalCard({
  event,
  actionId,
  currentWorkVersion,
  onResolve,
  onRefresh,
}: {
  event: WorkshopEvent;
  actionId: string | null;
  currentWorkVersion: string | null;
  onResolve: (eventId: string, action: WorkshopAgentChangeAction) => void;
  onRefresh: () => void;
}) {
  const metadata = event.metadata ?? {};
  const diff = Array.isArray(metadata.diff)
    ? metadata.diff.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
  const riskLevel = stringValue(metadata.riskLevel) ?? "medium";
  const proposedBy = stringValue(metadata.proposedBy) ?? "chat_agent";
  const proposalVersion = stringValue(metadata.workModelVersion);
  const isStale =
    proposalVersion !== null &&
    currentWorkVersion !== null &&
    proposalVersion !== currentWorkVersion;
  const isApplying = actionId === `apply:${event.id}`;
  const isRejecting = actionId === `reject:${event.id}`;
  const isRecreating = actionId === `recreate:${event.id}`;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">智能体配置变更</Badge>
            <Badge variant="outline">风险 {riskLevel}</Badge>
            <Badge variant="outline">{proposedBy}</Badge>
            {isStale ? <Badge variant="destructive">已过期</Badge> : null}
          </div>
          <h4 className="mt-2 break-words text-sm font-medium text-foreground">
            {event.title}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(event.createdAt)}
          </p>
        </div>
      </div>

      {event.body ? (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 text-xs leading-5 text-foreground">
          {eventDisplayBody(event)}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">提案基于版本</span>
          <p className="mt-1 break-all text-foreground">
            {formatWorkVersion(proposalVersion)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">当前 Work 版本</span>
          <p className="mt-1 break-all text-foreground">
            {formatWorkVersion(currentWorkVersion)}
          </p>
        </div>
      </div>

      {isStale ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
          这个提案创建后，Work
          配置已经变化。为避免覆盖新配置，不能直接应用。可以基于当前 Work
          版本重新生成一份新提案，再进入审核。
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {diff.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
            暂无可展示的字段差异。
          </div>
        ) : (
          diff.map((item, index) => (
            <div
              key={`${String(item.field ?? index)}:${index}`}
              className="rounded-md border border-border bg-muted/20 p-2 text-xs"
            >
              <div className="font-medium text-foreground">
                字段：{String(item.field ?? "-")}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">修改前</div>
                  <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-foreground">
                    {formatDiffValue(item.before)}
                  </pre>
                </div>
                <div>
                  <div className="text-muted-foreground">修改后</div>
                  <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-foreground">
                    {formatDiffValue(item.after)}
                  </pre>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => onResolve(event.id, "apply")}
          disabled={isStale || Boolean(actionId)}
          className="gap-2"
        >
          <RemixIcon
            name={isApplying ? "loader" : "checkbox_circle"}
            size="size-4"
          />
          应用修改
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(event.id, "reject")}
          disabled={Boolean(actionId)}
          className="gap-2"
        >
          <RemixIcon name={isRejecting ? "loader" : "close"} size="size-4" />
          驳回
        </Button>
        {isStale ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResolve(event.id, "recreate")}
            disabled={Boolean(actionId)}
            className="gap-2"
          >
            <RemixIcon
              name={isRecreating ? "loader" : "refresh"}
              size="size-4"
            />
            重新生成提案
          </Button>
        ) : null}
        {isStale ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={Boolean(actionId)}
            className="gap-2"
          >
            <RemixIcon name="refresh" size="size-4" />
            重新读取 Work
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function proposalDetails(loop: WorkshopDashboardLoop) {
  const loopSpec = objectValue(loop.stateJson.loopSpec);
  const context = objectValue(loopSpec.context);
  const actions = objectValue(loopSpec.actions);
  const verification = objectValue(loopSpec.verification);
  const proposalReason =
    stringValue(loop.stateJson.proposalReason) ??
    stringValue(loop.stateJson.proposal_reason);
  const sources = sourceNamesFromSpec(context.sources);
  const successCriteria = stringListValue(verification.successCriteria).slice(
    0,
    3,
  );
  const requiresApproval = stringListValue(actions.requiresApproval);
  const denied = stringListValue(actions.denied);
  const allowed = stringListValue(actions.allowed);
  const actionBoundary = denied.length
    ? `禁止：${denied.slice(0, 3).join("、")}`
    : requiresApproval.length
      ? `需确认：${requiresApproval.slice(0, 3).join("、")}`
      : allowed.length
        ? `允许：${allowed.slice(0, 3).join("、")}`
        : loop.spaceSummary?.permissionLabel;

  return {
    proposalReason,
    triggerLabel: loop.spaceSummary?.triggerLabel ?? loop.status,
    contextLabel:
      sources.length > 0
        ? sources.slice(0, 3).join("")
        : loop.spaceSummary?.contextLabel,
    actionBoundary,
    successCriteria,
  };
}

function LoopProposalDetails({
  loop,
  compact = false,
}: {
  loop: WorkshopDashboardLoop;
  compact?: boolean;
}) {
  const details = proposalDetails(loop);
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div
        className={cn(
          "grid gap-2 text-xs",
          compact ? "grid-cols-1" : "sm:grid-cols-2",
        )}
      >
        <div>
          <span className="text-muted-foreground">触发</span>
          <p className="mt-1 line-clamp-2 text-foreground">
            {details.triggerLabel}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">边界</span>
          <p className="mt-1 line-clamp-2 text-foreground">
            {details.actionBoundary ?? "按车间边界执行"}
          </p>
        </div>
        {details.contextLabel ? (
          <div>
            <span className="text-muted-foreground">资料</span>
            <p className="mt-1 line-clamp-2 text-foreground">
              {details.contextLabel}
            </p>
          </div>
        ) : null}
        {details.proposalReason ? (
          <div>
            <span className="text-muted-foreground">原因</span>
            <p className="mt-1 line-clamp-2 text-foreground">
              {details.proposalReason}
            </p>
          </div>
        ) : null}
      </div>
      {details.successCriteria.length > 0 ? (
        <div className="space-y-1 text-xs">
          <span className="text-muted-foreground">成功标准</span>
          <ul className="space-y-1 text-foreground">
            {details.successCriteria.map((criterion) => (
              <li key={criterion} className="line-clamp-2">
                {criterion}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LoopDetailMetric({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">
        {value ?? "暂无"}
      </p>
    </div>
  );
}

function LoopTaskDetailDialog({
  loop: summaryLoop,
  detail,
  loading,
  events,
  open,
  onOpenChange,
  onRun,
  onActivate,
  onReject,
  onPause,
  onResume,
  onDelete,
  onResolveApproval,
  onResumeApproval,
  onPreviewOutbox,
  onSendOutbox,
  running,
  updatingActivation,
  updatingStatus,
  resolvingApprovalId,
  resumingApprovalId,
  outboxActionId,
}: {
  loop: WorkshopDashboardLoop | null;
  detail?: WorkshopLoopDetail | null;
  loading?: boolean;
  events: WorkshopEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (loopId: string) => void;
  onActivate: (loopId: string) => void;
  onReject: (loopId: string) => void;
  onPause: (loop: WorkshopDashboardLoop) => void;
  onResume: (loop: WorkshopDashboardLoop) => void;
  onDelete: (loop: WorkshopDashboardLoop) => void;
  onResolveApproval: (
    approvalId: string,
    status: "approved" | "rejected",
  ) => void;
  onResumeApproval: (approvalId: string) => void;
  onPreviewOutbox: (outbox: WorkshopOutbox) => void;
  onSendOutbox: (outboxId: string) => void;
  running: boolean;
  updatingActivation: boolean;
  updatingStatus: boolean;
  resolvingApprovalId: string | null;
  resumingApprovalId: string | null;
  outboxActionId: string | null;
}) {
  const loop = detail?.loop ?? summaryLoop;
  if (!loop) return null;

  const isPendingProposal = isPendingLoopProposal(loop);
  const loopSpec = objectValue(loop.stateJson.loopSpec);
  const context = objectValue(loopSpec.context);
  const actions = objectValue(loopSpec.actions);
  const verification = objectValue(loopSpec.verification);
  const sources = sourceNamesFromSpec(context.sources);
  const allowed = stringListValue(actions.allowed);
  const requiresApproval = stringListValue(actions.requiresApproval);
  const denied = stringListValue(actions.denied);
  const successCriteria = stringListValue(verification.successCriteria);
  const trace = loop.latestRun?.executionTrace;
  const detailEvents = detail?.events ?? events;
  const approvals = detail?.approvalRequests ?? [];
  const outbox = detail?.outbox ?? [];
  const runs = detail?.loop.runs ?? (loop.latestRun ? [loop.latestRun] : []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[131] max-h-[85vh] w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-3xl"
        overlayClassName="z-[130] bg-black/20 backdrop-blur-0"
      >
        <DialogHeader>
          <DialogTitle className="break-words pr-8 leading-6">
            {loop.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            查看任务的运行状态、动作边界、最近运行、审批请求、产物和关联车间事件。
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5 break-words pb-2">
          {loading ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <RemixIcon name="loader" size="size-4" />
              正在加载任务详情...
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {isPendingProposal
                ? "待激活"
                : dashboardStatusLabel(loop.dashboardStatus)}
            </Badge>
            <Badge variant="outline">{loop.status}</Badge>
            {loop.schedulerStatus ? (
              <Badge variant="outline">{loop.schedulerStatus}</Badge>
            ) : null}
          </div>

          <p className="break-words text-sm leading-6 text-muted-foreground">
            {loop.description ?? loop.goal}
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            {isPendingProposal ? (
              <>
                <Button
                  size="sm"
                  onClick={() => onActivate(loop.id)}
                  disabled={updatingActivation}
                  className="gap-2"
                >
                  <RemixIcon
                    name={updatingActivation ? "loader" : "play"}
                    size="size-4"
                  />
                  激活
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReject(loop.id)}
                  disabled={updatingActivation}
                  className="gap-2"
                >
                  <RemixIcon name="close" size="size-4" />
                  拒绝
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    loop.status === "paused" ? onResume(loop) : onPause(loop)
                  }
                  disabled={updatingStatus || loop.status === "archived"}
                  className="gap-2"
                >
                  <RemixIcon
                    name={
                      updatingStatus
                        ? "loader"
                        : loop.status === "paused"
                          ? "play"
                          : "pause"
                    }
                    size="size-4"
                  />
                  {loop.status === "paused" ? "恢复" : "暂停"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRun(loop.id)}
                  disabled={
                    running ||
                    updatingStatus ||
                    loop.status !== "active"
                  }
                  className="gap-2"
                >
                  <RemixIcon name={running ? "loader" : "play"} size="size-4" />
                  {running ? "运行中" : "运行一次"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDelete(loop)}
                  disabled={updatingStatus}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <RemixIcon
                    name={updatingStatus ? "loader" : "delete_bin"}
                    size="size-4"
                  />
                  删除
                </Button>
              </>
            )}
          </div>

          {isPendingProposal ? <LoopProposalDetails loop={loop} /> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <LoopDetailMetric
              label="触发"
              value={loop.spaceSummary?.triggerLabel ?? loop.status}
            />
            <LoopDetailMetric
              label="下次运行"
              value={formatDateTime(loop.nextScheduledRunAt)}
            />
            <LoopDetailMetric
              label="外部动作"
              value={loop.spaceSummary?.permissionLabel}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <RemixIcon name="shield_check" size="size-4" />
                动作边界
              </div>
              <div className="space-y-1 break-words text-sm leading-6 text-foreground">
                <p>允许：{truncateList(allowed, "未单独声明")}</p>
                <p>需确认：{truncateList(requiresApproval, "未单独声明")}</p>
                <p>禁止：{truncateList(denied, "未单独声明")}</p>
              </div>
            </div>

            <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <RemixIcon name="link" size="size-4" />
                上下文
              </div>
              <div className="space-y-1 break-words text-sm leading-6 text-foreground">
                <p>资料：{truncateList(sources, "按任务说明收集")}</p>
                <p>
                  说明：
                  {stringValue(context.instructions) ??
                    loop.spaceSummary?.contextLabel ??
                    "暂无"}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <RemixIcon name="checkbox_circle" size="size-4" />
              成功标准
            </div>
            {successCriteria.length > 0 ? (
              <ul className="space-y-1 break-words text-sm leading-6 text-foreground">
                {[...new Set(successCriteria)].map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">暂无明确标准</p>
            )}
          </div>

          <div className="min-w-0 space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <RemixIcon name="pulse" size="size-4" />
              最新运行
            </div>
            {loop.latestRun ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <LoopDetailMetric
                    label="状态"
                    value={loop.latestRun.status}
                  />
                  <LoopDetailMetric
                    label="校验"
                    value={booleanLabel(loop.latestRun.verificationPassed)}
                  />
                  <LoopDetailMetric
                    label="工具调用"
                    value={trace?.toolCallCount ?? 0}
                  />
                  <LoopDetailMetric
                    label="耗时"
                    value={durationLabel(trace?.durationMs)}
                  />
                </div>
                {loop.latestRun.error || loop.latestRun.outputSummary ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {loop.latestRun.error ?? loop.latestRun.outputSummary}
                  </p>
                ) : null}
                {trace?.events?.length ? (
                  <div className="space-y-2">
                    {trace.events.map((step, index) => (
                      <div
                        key={`${step.type}-${step.timestamp ?? "no-time"}-${index}`}
                        className="min-w-0 rounded-md bg-muted/40 px-3 py-2 text-xs leading-5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {executionTraceStepTitle(step)}
                          </span>
                          {step.status ? (
                            <span className="text-muted-foreground">
                              {step.status}
                            </span>
                          ) : null}
                        </div>
                        {step.detail ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                            {executionTraceStepDetail(step)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">暂无运行记录</p>
            )}
          </div>

          {runs.length > 1 ? (
            <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <RemixIcon name="list_check" size="size-4" />
                最近运行
              </div>
              <div className="space-y-2">
                {runs.slice(0, 6).map((run) => (
                  <div
                    key={run.id ?? `${run.status}-${run.startedAt}`}
                    className="min-w-0 rounded-md bg-muted/40 px-3 py-2 text-xs leading-5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {run.status}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDateTime(run.startedAt ?? null)}
                      </span>
                    </div>
                    {run.outputSummary || run.error ? (
                      <p className="mt-1 line-clamp-2 break-words text-muted-foreground">
                        {run.error ?? run.outputSummary}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <RemixIcon name="user_follow" size="size-4" />
              审批请求
            </div>
            {approvals.length > 0 ? (
              <div className="space-y-2">
                {approvals.slice(0, 5).map((request) => {
                  const isResolving = resolvingApprovalId === request.id;
                  const isResuming = resumingApprovalId === request.id;
                  const resumable = canResumeApproval(request);
                  return (
                    <div
                      key={request.id}
                      className="min-w-0 rounded-md bg-muted/40 px-3 py-2 text-xs leading-5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {request.actionName}
                        </span>
                        <Badge variant="outline">{request.status}</Badge>
                      </div>
                      {request.reason || request.message ? (
                        <p className="mt-1 line-clamp-2 break-words text-muted-foreground">
                          {request.reason ?? request.message}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {request.status === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isResolving}
                              onClick={() =>
                                onResolveApproval(request.id, "rejected")
                              }
                            >
                              拒绝
                            </Button>
                            <Button
                              size="sm"
                              disabled={isResolving}
                              onClick={() =>
                                onResolveApproval(request.id, "approved")
                              }
                            >
                              通过
                            </Button>
                          </>
                        ) : null}
                        {resumable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isResuming}
                            onClick={() => onResumeApproval(request.id)}
                          >
                            继续执行
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无审批请求</p>
            )}
          </div>

          <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <RemixIcon name="mail_send" size="size-4" />
              任务产物
            </div>
            {outbox.length > 0 ? (
              <div className="space-y-2">
                {outbox.slice(0, 5).map((item) => {
                  const previewing = outboxActionId === `preview:${item.id}`;
                  const sending = outboxActionId === `send:${item.id}`;
                  return (
                    <div
                      key={item.id}
                      className="min-w-0 rounded-md bg-muted/40 px-3 py-2 text-xs leading-5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {item.recipientName ?? item.channel}
                        </span>
                        <span className="text-muted-foreground">
                          {item.status} / {item.riskLevel}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-muted-foreground">
                        {item.message}
                      </p>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {canPreviewOutbox(item) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(outboxActionId)}
                            onClick={() => onPreviewOutbox(item)}
                          >
                            {previewing ? "生成中" : "预览"}
                          </Button>
                        ) : null}
                        {canSendOutbox(item) ? (
                          <Button
                            size="sm"
                            disabled={Boolean(outboxActionId)}
                            onClick={() => onSendOutbox(item.id)}
                          >
                            {sending ? "发中" : "发"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无关联产物</p>
            )}
          </div>

          <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <RemixIcon name="history" size="size-4" />
              车间事件
            </div>
            {detailEvents.length > 0 ? (
              <div className="space-y-2">
                {detailEvents.map((event) => (
                  <div key={event.id} className="text-sm leading-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {eventDisplayTitle(event)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        #{event.seq}
                      </span>
                    </div>
                    {event.body ? (
                      <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {eventDisplayBody(event)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                暂无关联车间事件。
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            {isPendingProposal ? (
              <>
                <Button
                  onClick={() => onActivate(loop.id)}
                  disabled={updatingActivation}
                  className="gap-2"
                >
                  <RemixIcon
                    name={updatingActivation ? "loader" : "play"}
                    size="size-4"
                  />
                  激活任务
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onReject(loop.id)}
                  disabled={updatingActivation}
                  className="gap-2"
                >
                  <RemixIcon name="close" size="size-4" />
                  拒绝提案
                </Button>
              </>
            ) : (
              <Button
                onClick={() => onRun(loop.id)}
                disabled={running || loop.status !== "active"}
                className="gap-2"
              >
                <RemixIcon name={running ? "loader" : "play"} size="size-4" />
                {running ? "运行中" : "运行一次"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function eventIcon(type: string) {
  if (type.includes("source")) return "link";
  if (type.includes("watchlist")) return "line_chart";
  if (type.includes("video_review")) return "video";
  if (type.includes("memory")) return "brain";
  if (type.includes("outbox_suppressed")) return "forbid";
  if (type.includes("outbox")) return "chat";
  if (type.includes("directive")) return "arrow_right_s";
  if (type.includes("run")) return "play";
  return "pulse";
}

function eventTypeLabel(type: string) {
  if (type.includes("tool_error")) return "工具异常";
  if (type.includes("tool_result")) return "工具结果";
  if (type.includes("tool_call")) return "调用工具";
  if (type.includes("source")) return "读取资料";
  if (type.includes("watchlist")) return "自选股提案";
  if (type.includes("memory")) return "更新记忆";
  if (type.includes("outbox_suppressed")) return "跳过发信";
  if (type.includes("outbox")) return "生成待发送草稿";
  if (type.includes("directive")) return "收到新方向";
  if (type.includes("run_started")) return "开始运行";
  if (type.includes("run_completed")) return "运行完成";
  if (type.includes("run_failed") || type === "error") return "运行异常";
  if (type.includes("loop")) return "任务更新";
  if (type.includes("wechat")) return "同步微信";
  return "工作事件";
}

const WORK_EVENT_TITLE_LABELS: Record<string, string> = {
  "CC SDK executor configured": "执行器已配置",
  "Agent final output": "智能体最终输出",
  "Agent runtime error": "智能体运行异常",
  "CC SDK execution error": "执行器运行异常",
  "Tool call": "调用工具",
  "Tool completed": "工具调用完成",
  "Tool returned error": "工具调用失败",
  "Loop started": "任务开始运行",
  "Loop completed": "任务运行完成",
  "Loop failed": "任务运行失败",
  "Missed workshop heartbeat skipped": "已跳过错过的车间心跳",
  "Workshop heartbeat reserved": "车间心跳已占用",
  "Scheduled next workshop heartbeat": "已安排下次车间心跳",
  "Heartbeat suggestion ignored": "已忽略心跳建议",
  "WeChat messages recorded": "微信消息已记录",
  "WeChat message status updated": "微信消息状态已更新",
  "WeChat local new messages checked": "微信本地新消息已检查",
  "Interaction processor completed": "社交消息处理完成",
  "Owner Context processor completed": "主人上下文处理完成",
};

function localizedEventTitle(title: string) {
  const mapped = WORK_EVENT_TITLE_LABELS[title];
  if (mapped) return mapped;
  if (title.startsWith("Task created: ")) {
    return `任务已创建：${title.slice("Task created: ".length)}`;
  }
  if (title.startsWith("Task proposed: ")) {
    return `任务已提议：${title.slice("Task proposed: ".length)}`;
  }
  if (title.startsWith("Task activated: ")) {
    return `任务已激活：${title.slice("Task activated: ".length)}`;
  }
  if (title.startsWith("Task rejected: ")) {
    return `任务已拒绝：${title.slice("Task rejected: ".length)}`;
  }
  if (title.startsWith("Fallback source: Eastmoney research API via Bash")) {
    return "备用数据源：通过命令读取东财研报接口";
  }
  if (title.startsWith("Fallback source: Eastmoney via Bash")) {
    return "备用数据源：通过命令读取东财";
  }
  if (title.startsWith("Fallback source: Bash result")) {
    return "备用数据源：命令执行结果";
  }
  if (title.startsWith("Fallback source: ")) {
    return `备用数据源：${workDisplayLabel(
      title.slice("Fallback source: ".length),
    )}`;
  }
  return title;
}

function eventDisplayTitle(event: WorkshopEvent) {
  const toolName = stringValue(event.metadata?.toolName);
  if (event.type === "tool_call") {
    return event.title.startsWith("调用工具：")
      ? event.title
      : `调用工具：${workDisplayLabel(toolName ?? event.title)}`;
  }
  if (event.type === "tool_result") {
    if (event.title.startsWith("工具完成：")) return event.title;
    return `工具完成：${workDisplayLabel(toolName ?? event.title)}`;
  }
  if (event.type === "tool_error") {
    if (event.title.startsWith("工具失败：")) return event.title;
    return `工具失败：${workDisplayLabel(toolName ?? event.title)}`;
  }
  return localizedEventTitle(event.title);
}

function localizedEventBody(body: string) {
  const jsonRcMatch = body.match(
    /^Tool completed with JSON: rc=([^,]+), data=(empty|returned)\.$/,
  );
  if (jsonRcMatch) {
    return `工具已返回 JSON：rc=${jsonRcMatch[1]}，data=${
      jsonRcMatch[2] === "empty" ? "为空" : "已返回"
    }。`;
  }
  const jsonLengthMatch = body.match(
    /^Tool completed with JSON output \((\d+) characters\)\.$/,
  );
  if (jsonLengthMatch) {
    return `工具已返回 JSON 输出（${jsonLengthMatch[1]} 个字符）。`;
  }
  if (
    body ===
    "Generic tool returned data and was captured as a traceable source."
  ) {
    return "通用工具已返回数据，并作为可追溯资料源记录。";
  }
  if (body === "No new WeChat messages were recorded.") {
    return "没有记录到新的微信消息。";
  }
  return body;
}

function eventDisplayBody(event: WorkshopEvent) {
  return event.body ? localizedEventBody(event.body) : null;
}

function findBalancedJsonEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function parseStructuredReport(text: string) {
  const tag = text.match(/<structured-output\b[^>]*>/i);
  if (!tag || tag.index === undefined) return null;
  const jsonStart = text.indexOf("{", tag.index + tag[0].length);
  if (jsonStart < 0) return null;
  const jsonEnd = findBalancedJsonEnd(text, jsonStart);
  if (jsonEnd < 0) return null;
  try {
    const data = JSON.parse(text.slice(jsonStart, jsonEnd)) as Record<
      string,
      unknown
    >;
    const before = text.slice(0, tag.index).trim();
    const afterTagEnd = text.indexOf("</structured-output>", jsonEnd);
    const after =
      afterTagEnd >= 0
        ? text.slice(afterTagEnd + "</structured-output>".length).trim()
        : "";
    return { data, cleanText: [before, after].filter(Boolean).join("\n\n") };
  } catch {
    return null;
  }
}

function reportText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function reportStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            return (
              reportText(record.label) ??
              reportText(record.summary) ??
              reportText(record.content) ??
              reportText(record.description)
            );
          }
          return null;
        })
        .filter((item): item is string => Boolean(item))
    : [];
}

function structuredReportMarkdown(data: Record<string, unknown>) {
  const sections: string[] = [];
  const summary = reportText(data.summary);
  const actionTaken = reportText(data.actionTaken);
  const riskAssessment = reportText(data.riskAssessment);
  const accountState = reportText(data.accountState);
  const tradePlanLedger = reportText(data.tradePlanLedger);
  const tradeTriggers = reportText(data.tradeTriggers);
  const nextControlAction = reportText(data.nextControlAction);
  const riskBlockers = reportStringList(data.riskBlockers);
  const suggestedActions = reportStringList(data.suggestedActions);

  if (summary) sections.push(`### 汇报摘要\n${summary}`);
  if (actionTaken) sections.push(`### 已完成动作\n${actionTaken}`);
  if (accountState) sections.push(`### 当前状态\n${accountState}`);
  if (tradePlanLedger || tradeTriggers) {
    sections.push(
      [
        "### 计划与触发条件",
        tradePlanLedger,
        tradeTriggers,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  if (riskAssessment || riskBlockers.length > 0) {
    sections.push(
      [
        "### 风险与限制",
        riskAssessment,
        ...riskBlockers.map((item) => `- ${item}`),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (nextControlAction || suggestedActions.length > 0) {
    sections.push(
      [
        "### 下一步",
        nextControlAction,
        ...suggestedActions.map((item) => `- ${item}`),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return sections.join("\n\n");
}

function humanReadableWorkLogBody(event: WorkshopEvent) {
  const body = eventDisplayBody(event);
  if (!body) return null;
  const parsed = parseStructuredReport(body);
  if (!parsed) {
    return body
      .replace(/<structured-output\b[^>]*>[\s\S]*?<\/structured-output>/gi, "")
      .trim();
  }
  const report = structuredReportMarkdown(parsed.data);
  return report || parsed.cleanText || null;
}

function markdownEscape(value: string) {
  return value.replace(/([\\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function workLogEventMarkdown(event: WorkshopEvent) {
  const title = eventDisplayTitle(event);
  const body = humanReadableWorkLogBody(event);
  const lines = [
    `## ${markdownEscape(title)}`,
    "",
    `- Time: ${markdownEscape(formatDateTime(event.createdAt))}`,
    `- Type: ${markdownEscape(eventTypeLabel(event.type))}`,
    `- Seq: ${event.seq}`,
  ];
  if (event.runId) lines.push(`- Run: \`${event.runId}\``);
  if (event.loopId) lines.push(`- Loop: \`${event.loopId}\``);
  if (event.loopRunId) lines.push(`- Loop Run: \`${event.loopRunId}\``);
  lines.push("");
  lines.push(body?.trim() ? body.trim() : "_No body._");
  return lines.join("\n");
}

function WorkLogExpandedDialog({
  workshopId,
  events,
  open,
  onOpenChange,
}: {
  workshopId: string | null;
  events: WorkshopEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [historyEvents, setHistoryEvents] = useState<WorkshopEvent[] | null>(
    null,
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const allEvents = useMemo(() => {
    const merged = new Map<string, WorkshopEvent>();
    for (const event of [...(historyEvents ?? []), ...events]) {
      merged.set(event.id, event);
    }
    return workLogEvents(sortWorkshopEvents([...merged.values()]));
  }, [events, historyEvents]);
  const groupedEvents = useMemo(() => {
    const groups: Array<{ date: string; events: WorkshopEvent[] }> = [];
    for (const event of allEvents) {
      const date = formatDateKey(event.createdAt);
      const current = groups.at(-1);
      if (current?.date === date) {
        current.events.push(event);
      } else {
        groups.push({ date, events: [event] });
      }
    }
    return groups.reverse().map((group) => ({
      ...group,
      events: [...group.events].reverse(),
    }));
  }, [allEvents]);
  const newestEvent = allEvents.at(-1);

  useEffect(() => {
    if (!open || !workshopId) return;
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);
    jsonFetch<{ events: WorkshopEvent[] }>(
      `/api/workshops/${workshopId}/events?limit=2000`,
    )
      .then((data) => {
        if (cancelled) return;
        setHistoryEvents(data.events);
      })
      .catch((error) => {
        if (cancelled) return;
        setHistoryError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workshopId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] !w-[92vw] !max-w-[92vw] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="text-base">Work log</DialogTitle>
              <DialogDescription className="mt-1">
                Markdown reading mode for long-running work logs.
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {allEvents.length} events
            </Badge>
          </div>
          {loadingHistory || historyError ? (
            <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {loadingHistory
                ? "Loading full work log history..."
                : `Failed to load full history: ${historyError}`}
            </div>
          ) : null}
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,70vw)_minmax(180px,1fr)]">
          <div className="min-h-0 overflow-y-auto px-4 py-4 lg:px-5">
            {allEvents.length === 0 ? (
              <div className="w-full rounded-lg border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
                No work log yet.
              </div>
            ) : (
              <div className="w-full space-y-7">
                {groupedEvents.map((group) => (
                  <section key={group.date} className="scroll-mt-6">
                    <div
                      id={`work-log-date-${group.date}`}
                      className="sticky top-0 z-10 mb-3 flex items-center gap-3 border-b border-border bg-background/95 py-2 backdrop-blur"
                    >
                      <h3 className="text-sm font-semibold text-foreground">
                        {group.date}
                      </h3>
                      <Badge variant="outline">{group.events.length}</Badge>
                    </div>
                    <div className="space-y-4">
                      {group.events.map((event) => (
                        <article
                          key={event.id}
                          id={`work-log-${event.id}`}
                          className="scroll-mt-14 rounded-lg border border-border bg-background px-5 py-5 shadow-sm lg:px-6"
                        >
                          <Markdown>{workLogEventMarkdown(event)}</Markdown>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <aside className="hidden min-h-0 border-l border-border bg-muted/30 lg:flex lg:flex-col">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="text-xs font-medium text-muted-foreground">
                Event index
              </div>
              {newestEvent ? (
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  Latest: {formatDateTime(newestEvent.createdAt)}
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {groupedEvents.map((group) => (
                <a
                  key={group.date}
                  href={`#work-log-date-${group.date}`}
                  className="block rounded-md px-3 py-2 text-xs hover:bg-background"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {group.events.length}
                    </Badge>
                  </div>
                  <div className="mt-1 text-foreground">
                    {group.date}
                  </div>
                </a>
              ))}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function executionTraceStepTitle(
  step: NonNullable<WorkshopLoopRun["executionTrace"]>["events"][number],
) {
  const toolName = stringValue(step.toolName);
  if (step.type === "tool_call") {
    if (step.title.startsWith("调用工具：")) return step.title;
    return `调用工具：${workDisplayLabel(toolName ?? step.title)}`;
  }
  if (step.type === "tool_result") {
    if (step.title.startsWith("工具完成：")) return step.title;
    return `工具完成：${workDisplayLabel(toolName ?? step.title)}`;
  }
  if (step.type === "tool_error") {
    if (step.title.startsWith("工具失败：")) return step.title;
    return `工具失败：${workDisplayLabel(toolName ?? step.title)}`;
  }
  return localizedEventTitle(step.title);
}

function executionTraceStepDetail(
  step: NonNullable<WorkshopLoopRun["executionTrace"]>["events"][number],
) {
  return step.detail ? localizedEventBody(step.detail) : null;
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

function policyForMode(mode: WorkshopBoundaryMode) {
  return serializeWorkshopBoundaryPolicy({
    mode,
    externalMessages:
      mode === "observe" ? "blocked" : mode === "auto" ? "auto" : "draft",
    allowWechatPreview: mode !== "observe",
    requireSourcesForOutbox: true,
  });
}

function recipientText(policy: WorkshopBoundaryPolicy) {
  return policy.allowedRecipients.join("\n");
}

function numberFromPolicy(
  policy: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = policy[key];
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function heartbeatFormFromRow(
  heartbeat: WorkshopHeartbeat | null,
): HeartbeatPolicyForm {
  const policy = heartbeat?.heartbeatPolicy ?? {};
  return {
    enabled: heartbeat?.enabled ?? true,
    allowAgentSuggestedWakeup:
      typeof policy.allowAgentSuggestedWakeup === "boolean"
        ? policy.allowAgentSuggestedWakeup
        : true,
    minIntervalMinutes: numberFromPolicy(policy, "minIntervalMinutes", 15),
    defaultDelayMinutes: numberFromPolicy(policy, "defaultDelayMinutes", 60),
    maxIntervalMinutes: numberFromPolicy(policy, "maxIntervalMinutes", 1440),
    missedRunGraceMinutes: numberFromPolicy(
      policy,
      "missedRunGraceMinutes",
      10,
    ),
    leaseMinutes: numberFromPolicy(policy, "leaseMinutes", 30),
    maxConsecutiveFailures: numberFromPolicy(
      policy,
      "maxConsecutiveFailures",
      3,
    ),
  };
}

function pendingDashboardSummary(dashboard: WorkshopDashboard | null) {
  if (!dashboard) return "没有待处理动";
  const pendingTaskApprovals = Math.max(
    0,
    dashboard.counts.pendingApprovals - dashboard.counts.pendingLoopProposals,
  );
  const parts = [
    `${dashboard.counts.pendingOutbox} 个草稿`,
    `${pendingTaskApprovals} 个任务审批`,
  ];
  if (dashboard.counts.pendingLoopProposals > 0) {
    parts.push(`${dashboard.counts.pendingLoopProposals} 个待激活`);
  }
  return parts.join("");
}

function fallbackDashboardLoop(loop: WorkshopLoop): WorkshopDashboardLoop {
  return {
    ...loop,
    dashboardStatus: loop.status,
    triggerConfig: {},
    currentPhase: null,
    nextAction: null,
    blockedReason: null,
    lastObservation: null,
    stateJson: {},
    nextScheduledRunAt: null,
    schedulerStatus: null,
    latestRun: null,
  };
}

function yamlScalar(value: unknown, fallback = "") {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return JSON.stringify(text);
}

function yamlBlock(value: unknown, indent = "    ") {
  const text = typeof value === "string" && value.trim() ? value.trim() : "";
  if (!text) return `${indent}>-\n${indent}  `;
  return `${indent}>-\n${text
    .split(/\r?\n/)
    .map((line) => `${indent}  ${line}`)
    .join("\n")}`;
}

function workshopToEditableManifestYaml(input: {
  workshop: Workshop;
  loops: WorkshopDashboardLoop[];
}) {
  const modelConfig = input.workshop.modelConfig ?? {};
  const manifestName =
    typeof modelConfig.manifestName === "string" && modelConfig.manifestName
      ? modelConfig.manifestName
      : input.workshop.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
          .replace(/^-+|-+$/g, "") || "workshop";

  const role =
    typeof modelConfig.role === "string" && modelConfig.role
      ? modelConfig.role
      : "general";
  const primarySkills = Array.isArray(modelConfig.primarySkills)
    ? modelConfig.primarySkills.filter((item): item is string => typeof item === "string")
    : [];
  const allowedTools = Array.isArray(modelConfig.allowedTools)
    ? modelConfig.allowedTools.filter((item): item is string => typeof item === "string")
    : [];
  const deniedTools = Array.isArray(modelConfig.disallowedTools)
    ? modelConfig.disallowedTools.filter((item): item is string => typeof item === "string")
    : [];
  const boundaryPolicy = getWorkshopBoundaryPolicy(input.workshop);
  const loops = input.loops.filter((loop) => loop.status !== "archived");

  return [
    "apiVersion: openzhiyu.ai/v1alpha1",
    "kind: Workshop",
    "metadata:",
    `  name: ${yamlScalar(manifestName)}`,
    `  title: ${yamlScalar(input.workshop.name)}`,
    "spec:",
    yamlBlock(input.workshop.mission),
    `  role: ${yamlScalar(role)}`,
    `  autonomyLevel: ${yamlScalar(input.workshop.autonomyLevel)}`,
    "  modelConfig:",
    `    role: ${yamlScalar(role)}`,
    "    primarySkills:",
    ...(primarySkills.length
      ? primarySkills.map((skill) => `      - ${yamlScalar(skill)}`)
      : ["      []"]),
    "    allowedTools:",
    ...(allowedTools.length
      ? allowedTools.map((tool) => `      - ${yamlScalar(tool)}`)
      : ["      []"]),
    "    disallowedTools:",
    ...(deniedTools.length
      ? deniedTools.map((tool) => `      - ${yamlScalar(tool)}`)
      : ["      []"]),
    "  boundaryPolicy:",
    `    mode: ${yamlScalar(boundaryPolicy.mode)}`,
    `    externalMessages: ${yamlScalar(boundaryPolicy.externalMessages)}`,
    "    deniedPrecedence: true",
    "  loops:",
    ...(loops.length
      ? loops.map((loop) =>
          [
            `    - name: ${yamlScalar(loop.name)}`,
            `      title: ${yamlScalar(loop.name)}`,
            `      description: ${yamlScalar(loop.description ?? "")}`,
            `      status: ${yamlScalar(loop.status === "paused" ? "paused" : "active")}`,
            "      trigger:",
            ...JSON.stringify(loop.triggerConfig ?? {}, null, 2)
              .split("\n")
              .map((line) => `        ${line}`),
            yamlBlock(loop.goal, "      ").replace(/^ {6}>-/, "      goal: >-"),
            "      context:",
            "        instructions: >-",
            "          ",
            "      actionPolicy:",
            "        allowed: []",
            "        requiresApproval: []",
            "        denied: []",
            "      verification:",
            "        successCriteria: []",
          ].join("\n"),
        )
      : ["    []"]),
    "",
  ].join("\n");
}

const LIVE_DETAIL_REFRESH_IGNORED_EVENT_TYPES = new Set([
  "agent_text",
  "agent_configured",
  "error",
  "source_checked",
  "tool_call",
  "tool_result",
  "tool_error",
]);

const LIVE_DETAIL_REFRESH_EVENT_TYPES = new Set([
  "run_started",
  "run_completed",
  "run_failed",
  "loop_run_started",
  "loop_run_completed",
  "loop_run_failed",
  "memory_written",
  "memory_reviewed",
  "source_added",
  "directive_added",
  "outbox_draft",
  "outbox_suppressed",
  "outbox_blocked",
  "outbox_preview_ready",
  "outbox_sent",
  "outbox_auto_send_blocked",
  "outbox_auto_send_failed",
  "work_outbox_send_requested",
  "work_outbox_send_failed",
  "work_command_applied",
  "next_wakeup_suggested",
  "watchlist_proposal_applied",
  "watchlist_proposal_rejected",
  "watchlist_proposal_repaired",
  "workshop_agent_change_proposed",
  "workshop_agent_change_applied",
  "workshop_agent_change_rejected",
  "workshop_agent_change_superseded",
  "publish_draft",
]);

function shouldRefreshLiveWorkshopDetail(event: WorkshopEvent) {
  if (LIVE_DETAIL_REFRESH_IGNORED_EVENT_TYPES.has(event.type)) return false;
  return LIVE_DETAIL_REFRESH_EVENT_TYPES.has(event.type);
}

export function WorkshopClient() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<SidePanelTab>("loops");
  const [sidePanelDirection, setSidePanelDirection] =
    useState<SidePanelDirection>("next");
  const [detail, setDetail] = useState<WorkshopDetail | null>(null);
  const [toolMatrix, setToolMatrix] = useState<AgentToolMatrixResponse | null>(
    null,
  );
  const [toolMatrixLoading, setToolMatrixLoading] = useState(false);
  const [workModel, setWorkModel] = useState<WorkshopWorkModel | null>(null);
  const [workVersions, setWorkVersions] = useState<WorkshopWorkVersion[]>([]);
  const [loadedPanels, setLoadedPanels] = useState<LoadedWorkshopPanels>({
    dashboard: false,
    work: false,
    sources: false,
    memories: false,
    outbox: false,
  });
  const [panelLoading, setPanelLoading] = useState<
    Partial<Record<keyof LoadedWorkshopPanels, boolean>>
  >({});
  const [restoringWorkVersionId, setRestoringWorkVersionId] = useState<
    string | null
  >(null);
  const [interactionEvents, setInteractionEvents] = useState<
    InteractionEvent[]
  >([]);
  const [interactionWiki, setInteractionWiki] = useState<InteractionWiki>({
    notes: [],
    tasks: [],
    memories: [],
  });
  const [interactionsLoading, setInteractionsLoading] = useState(false);
  const [recordingWechatMessages, setRecordingWechatMessages] = useState(false);
  const [wikiActionId, setWikiActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningLoopId, setRunningLoopId] = useState<string | null>(null);
  const [updatingLoopActivationId, setUpdatingLoopActivationId] = useState<
    string | null
  >(null);
  const [updatingLoopStatusId, setUpdatingLoopStatusId] = useState<
    string | null
  >(null);
  const [selectedLoopDetailId, setSelectedLoopDetailId] = useState<
    string | null
  >(null);
  const [loopDetail, setLoopDetail] = useState<WorkshopLoopDetail | null>(null);
  const [loadingLoopDetailId, setLoadingLoopDetailId] = useState<string | null>(
    null,
  );
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(
    null,
  );
  const [resumingApprovalId, setResumingApprovalId] = useState<string | null>(
    null,
  );
  const [outboxActionId, setOutboxActionId] = useState<string | null>(null);
  const [watchlistProposalActionId, setWatchlistProposalActionId] = useState<
    string | null
  >(null);
  const [agentChangeActionId, setAgentChangeActionId] = useState<string | null>(
    null,
  );
  const [douyinDrafts, setDouyinDrafts] = useState<DouyinDraftSummary[]>([]);
  const [douyinDraftsLoading, setDouyinDraftsLoading] = useState(false);
  const [videoReviewActionId, setVideoReviewActionId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTemplateId, setNewTemplateId] = useState<string>(
    WORKSHOP_TEMPLATES[0].id,
  );
  const [newName, setNewName] = useState<string>(WORKSHOP_TEMPLATES[0].name);
  const [newMission, setNewMission] = useState<string>(
    WORKSHOP_TEMPLATES[0].mission,
  );
  const [manifestYaml, setManifestYaml] = useState(
    DEFAULT_WORKSHOP_MANIFEST_YAML,
  );
  const [manifestReview, setManifestReview] =
    useState<WorkshopManifestReview | null>(null);
  const [manifestReviewing, setManifestReviewing] = useState(false);
  const [isWorkLogExpanded, setIsWorkLogExpanded] = useState(false);
  const [directive, setDirective] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [loopIntent, setLoopIntent] = useState("");
  const [creatingLoop, setCreatingLoop] = useState(false);
  const [outboxRecipients, setOutboxRecipients] = useState<
    Record<string, string>
  >({});
  const [boundaryForm, setBoundaryForm] =
    useState<WorkshopBoundaryPolicy | null>(null);
  const [heartbeatForm, setHeartbeatForm] =
    useState<HeartbeatPolicyForm | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const liveDetailRefreshTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const selectedLoopDetailIdRef = useRef<string | null>(null);

  const selectedWorkshop = useMemo(
    () => detail?.workshop ?? workshops.find((item) => item.id === selectedId),
    [detail?.workshop, selectedId, workshops],
  );

  const handleSideTabChange = useCallback(
    (value: string) => {
      if (!SIDE_PANEL_TAB_VALUES.includes(value as SidePanelTab)) return;
      const nextTab = value as SidePanelTab;
      const currentIndex = SIDE_PANEL_TAB_VALUES.indexOf(activeSideTab);
      const nextIndex = SIDE_PANEL_TAB_VALUES.indexOf(nextTab);
      setSidePanelDirection(nextIndex >= currentIndex ? "next" : "previous");
      setActiveSideTab(nextTab);
    },
    [activeSideTab],
  );

  const sidePanelContentClass = useMemo(
    () =>
      cn(
        "m-0 will-change-transform data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200 data-[state=active]:ease-out",
        "min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain",
        sidePanelDirection === "next"
          ? "data-[state=active]:slide-in-from-right-4"
          : "data-[state=active]:slide-in-from-left-4",
      ),
    [sidePanelDirection],
  );

  const sidePanelTriggerClass = "shrink-0 snap-start whitespace-nowrap";

  const updateBoundaryForm = useCallback(
    (patch: Partial<WorkshopBoundaryPolicy>) => {
      setBoundaryForm((current) =>
        serializeWorkshopBoundaryPolicy({
          ...(current ?? policyForMode("draft")),
          ...patch,
        }),
      );
    },
    [],
  );

  const updateHeartbeatForm = useCallback(
    (patch: Partial<HeartbeatPolicyForm>) => {
      setHeartbeatForm((current) => ({
        ...(current ?? heartbeatFormFromRow(null)),
        ...patch,
      }));
    },
    [],
  );

  const refreshWorkshops = useCallback(async () => {
    const data = await jsonFetch<{ workshops: Workshop[] }>("/api/workshops");
    setWorkshops(data.workshops);
    setSelectedId((current) => current ?? data.workshops[0]?.id ?? null);
  }, []);

  const markPanelLoaded = useCallback((panel: keyof LoadedWorkshopPanels) => {
    setLoadedPanels((current) => ({ ...current, [panel]: true }));
  }, []);

  const setPanelBusy = useCallback(
    (panel: keyof LoadedWorkshopPanels, value: boolean) => {
      setPanelLoading((current) => ({ ...current, [panel]: value }));
    },
    [],
  );

  const refreshDetail = useCallback(async (id: string) => {
    const data = await jsonFetch<
      WorkshopDetail & {
        interfaceVersion?: string;
        generatedAt?: string;
      }
    >(`/api/workshops/${id}/summary`);
    if (selectedIdRef.current !== id) return;
    setDetail((current) => ({
      ...data,
      sources: current?.workshop.id === id ? current.sources : data.sources,
      memories: current?.workshop.id === id ? current.memories : data.memories,
      outbox: current?.workshop.id === id ? current.outbox : data.outbox,
      dashboard:
        current?.workshop.id === id ? current.dashboard : data.dashboard,
      events: sortWorkshopEvents(data.events),
    }));
  }, []);

  const refreshDashboard = useCallback(
    async (id: string) => {
      setPanelBusy("dashboard", true);
      try {
        const dashboard = await jsonFetch<WorkshopDashboard>(
          `/api/workshops/${id}/dashboard`,
        );
        if (selectedIdRef.current !== id) return;
        setDetail((current) =>
          current?.workshop.id === id ? { ...current, dashboard } : current,
        );
        markPanelLoaded("dashboard");
      } finally {
        if (selectedIdRef.current === id) setPanelBusy("dashboard", false);
      }
    },
    [markPanelLoaded, setPanelBusy],
  );

  const refreshWorkModel = useCallback(
    async (id: string) => {
      setPanelBusy("work", true);
      try {
        const work = await jsonFetch<WorkshopWorkResponse>(
          `/api/workshops/${id}/work`,
        );
        if (selectedIdRef.current !== id) return;
        setWorkModel(work.work);
        setWorkVersions(work.versions ?? []);
        markPanelLoaded("work");
      } finally {
        if (selectedIdRef.current === id) setPanelBusy("work", false);
      }
    },
    [markPanelLoaded, setPanelBusy],
  );

  const refreshSources = useCallback(
    async (id: string) => {
      setPanelBusy("sources", true);
      try {
        const data = await jsonFetch<{ sources: WorkshopSource[] }>(
          `/api/workshops/${id}/sources`,
        );
        if (selectedIdRef.current !== id) return;
        setDetail((current) =>
          current?.workshop.id === id
            ? { ...current, sources: data.sources }
            : current,
        );
        markPanelLoaded("sources");
      } finally {
        if (selectedIdRef.current === id) setPanelBusy("sources", false);
      }
    },
    [markPanelLoaded, setPanelBusy],
  );

  const refreshMemories = useCallback(
    async (id: string) => {
      setPanelBusy("memories", true);
      try {
        const data = await jsonFetch<{ memories: WorkshopMemory[] }>(
          `/api/workshops/${id}/memories`,
        );
        if (selectedIdRef.current !== id) return;
        setDetail((current) =>
          current?.workshop.id === id
            ? { ...current, memories: data.memories }
            : current,
        );
        markPanelLoaded("memories");
      } finally {
        if (selectedIdRef.current === id) setPanelBusy("memories", false);
      }
    },
    [markPanelLoaded, setPanelBusy],
  );

  const refreshOutbox = useCallback(
    async (id: string) => {
      setPanelBusy("outbox", true);
      try {
        const data = await jsonFetch<{ outbox: WorkshopOutbox[] }>(
          `/api/workshops/${id}/outbox`,
        );
        if (selectedIdRef.current !== id) return;
        setDetail((current) =>
          current?.workshop.id === id
            ? { ...current, outbox: data.outbox }
            : current,
        );
        markPanelLoaded("outbox");
      } finally {
        if (selectedIdRef.current === id) setPanelBusy("outbox", false);
      }
    },
    [markPanelLoaded, setPanelBusy],
  );

  const refreshToolMatrix = useCallback(async (id: string) => {
    setToolMatrixLoading(true);
    try {
      const tools = await jsonFetch<AgentToolMatrixResponse>(
        `/api/workshops/${id}/tools`,
      );
      if (selectedIdRef.current !== id) return;
      setToolMatrix(tools);
    } finally {
      if (selectedIdRef.current === id) setToolMatrixLoading(false);
    }
  }, []);

  const refreshDouyinDrafts = useCallback(async () => {
    setDouyinDraftsLoading(true);
    try {
      const data =
        await jsonFetch<DouyinDraftListResponse>("/api/douyin/drafts");
      setDouyinDrafts(data.ok ? data.drafts : []);
    } finally {
      setDouyinDraftsLoading(false);
    }
  }, []);

  const refreshLiveDetail = useCallback(
    async (id: string) => {
      const refreshes: Array<Promise<unknown>> = [refreshDetail(id)];
      if (loadedPanels.dashboard) refreshes.push(refreshDashboard(id));
      if (loadedPanels.work) refreshes.push(refreshWorkModel(id));
      if (loadedPanels.sources) refreshes.push(refreshSources(id));
      if (loadedPanels.memories) refreshes.push(refreshMemories(id));
      if (loadedPanels.outbox) refreshes.push(refreshOutbox(id));
      await Promise.all(refreshes);
    },
    [
      loadedPanels.dashboard,
      loadedPanels.memories,
      loadedPanels.outbox,
      loadedPanels.sources,
      loadedPanels.work,
      refreshDashboard,
      refreshDetail,
      refreshMemories,
      refreshOutbox,
      refreshSources,
      refreshWorkModel,
    ],
  );

  const refreshInteractions = useCallback(async () => {
    setInteractionsLoading(true);
    try {
      const [data, wiki] = await Promise.all([
        jsonFetch<{ events: InteractionEvent[] }>(
          "/api/interactions/events?platform=wechat&limit=50",
        ),
        jsonFetch<InteractionWiki>("/api/interactions/wiki?limit=20"),
      ]);
      setInteractionEvents(data.events);
      setInteractionWiki(wiki);
    } finally {
      setInteractionsLoading(false);
    }
  }, []);

  const loadLoopDetail = useCallback((workshopId: string, loopId: string) => {
    return jsonFetch<WorkshopLoopDetail>(
      `/api/workshops/${workshopId}/loops/${loopId}/detail`,
    );
  }, []);

  const scheduleLiveDetailRefresh = useCallback(
    (workshopId: string) => {
      if (liveDetailRefreshTimerRef.current) return;
      liveDetailRefreshTimerRef.current = setTimeout(() => {
        liveDetailRefreshTimerRef.current = null;
        refreshLiveDetail(workshopId)
          .then(async () => {
            const loopId = selectedLoopDetailIdRef.current;
            if (!loopId || selectedIdRef.current !== workshopId) return;
            const data = await loadLoopDetail(workshopId, loopId);
            if (
              selectedIdRef.current === workshopId &&
              selectedLoopDetailIdRef.current === loopId
            ) {
              setLoopDetail(data);
            }
          })
          .catch((err) => {
            if (selectedIdRef.current === workshopId) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
      }, 800);
    },
    [loadLoopDetail, refreshLiveDetail],
  );

  const refreshSelectedLoopDetail = useCallback(async () => {
    if (!selectedId || !selectedLoopDetailId) return;
    setLoopDetail(await loadLoopDetail(selectedId, selectedLoopDetailId));
  }, [loadLoopDetail, selectedId, selectedLoopDetailId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedLoopDetailIdRef.current = selectedLoopDetailId;
  }, [selectedLoopDetailId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshWorkshops()
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshWorkshops]);

  useEffect(() => {
    if (liveDetailRefreshTimerRef.current) {
      clearTimeout(liveDetailRefreshTimerRef.current);
      liveDetailRefreshTimerRef.current = null;
    }
    if (!selectedId) {
      setDetail(null);
      setToolMatrix(null);
      setToolMatrixLoading(false);
      setWorkModel(null);
      setWorkVersions([]);
      setLoadedPanels({
        dashboard: false,
        work: false,
        sources: false,
        memories: false,
        outbox: false,
      });
      setPanelLoading({});
      setRestoringWorkVersionId(null);
      setInteractionEvents([]);
      setInteractionWiki({ notes: [], tasks: [], memories: [] });
      setInteractionsLoading(false);
      setLoopDetail(null);
      setLoadingLoopDetailId(null);
      setResolvingApprovalId(null);
      setResumingApprovalId(null);
      setOutboxActionId(null);
      setWatchlistProposalActionId(null);
      setDouyinDrafts([]);
      setDouyinDraftsLoading(false);
      setVideoReviewActionId(null);
      return;
    }
    setSelectedLoopDetailId(null);
    setToolMatrix(null);
    setToolMatrixLoading(false);
    setWorkModel(null);
    setWorkVersions([]);
    setLoadedPanels({
      dashboard: false,
      work: false,
      sources: false,
      memories: false,
      outbox: false,
    });
    setPanelLoading({});
    setRestoringWorkVersionId(null);
    setInteractionEvents([]);
    setInteractionWiki({ notes: [], tasks: [], memories: [] });
    setInteractionsLoading(false);
    setLoopDetail(null);
    setLoadingLoopDetailId(null);
    setResolvingApprovalId(null);
    setResumingApprovalId(null);
    setOutboxActionId(null);
    setWatchlistProposalActionId(null);
    setVideoReviewActionId(null);
    setDouyinDrafts([]);
    setDouyinDraftsLoading(false);
    refreshDetail(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshDetail, selectedId]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "loops" || loadedPanels.dashboard) {
      return;
    }
    refreshDashboard(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, loadedPanels.dashboard, refreshDashboard, selectedId]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "work" || loadedPanels.work) return;
    refreshWorkModel(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, loadedPanels.work, refreshWorkModel, selectedId]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "sources" || loadedPanels.sources) {
      return;
    }
    refreshSources(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, loadedPanels.sources, refreshSources, selectedId]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "memory" || loadedPanels.memories) {
      return;
    }
    refreshMemories(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, loadedPanels.memories, refreshMemories, selectedId]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "outbox" || loadedPanels.outbox) {
      return;
    }
    refreshOutbox(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, loadedPanels.outbox, refreshOutbox, selectedId]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "tools" || toolMatrix) return;
    refreshToolMatrix(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, refreshToolMatrix, selectedId, toolMatrix]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "interactions") return;
    refreshInteractions().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, refreshInteractions, selectedId]);

  useEffect(() => {
    if (!selectedId || activeSideTab !== "review") return;
    refreshDouyinDrafts().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [activeSideTab, refreshDouyinDrafts, selectedId]);

  useEffect(() => {
    if (!selectedId || !selectedLoopDetailId) {
      setLoopDetail(null);
      setLoadingLoopDetailId(null);
      return;
    }

    let cancelled = false;
    setLoopDetail(null);
    setLoadingLoopDetailId(selectedLoopDetailId);
    loadLoopDetail(selectedId, selectedLoopDetailId)
      .then((data) => {
        if (!cancelled) setLoopDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLoopDetailId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [loadLoopDetail, selectedId, selectedLoopDetailId]);

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
      if (shouldRefreshLiveWorkshopDetail(event)) {
        scheduleLiveDetailRefresh(selectedId);
      }
      if (
        [
          "wechat_messages_recorded",
          "interaction_note_created",
          "interaction_task_detected",
          "interaction_memory_candidate",
          "interaction_processor_completed",
        ].includes(event.type) &&
        activeSideTab === "interactions"
      ) {
        refreshInteractions().catch(() => {});
      }
      if (event.type === "publish_draft" && activeSideTab === "review") {
        refreshDouyinDrafts().catch(() => {});
      }
    };

    source.onerror = () => {
      // Let EventSource use its built-in reconnect. Duplicate history from a
      // reconnect is filtered by event id in the state updater.
    };

    return () => {
      source.close();
    };
  }, [
    detail?.workshop.id,
    activeSideTab,
    refreshDouyinDrafts,
    refreshInteractions,
    scheduleLiveDetailRefresh,
    selectedId,
  ]);

  useEffect(() => {
    return () => {
      if (liveDetailRefreshTimerRef.current) {
        clearTimeout(liveDetailRefreshTimerRef.current);
        liveDetailRefreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.events.length]);

  useEffect(() => {
    if (!selectedWorkshop) {
      setBoundaryForm(null);
      setHeartbeatForm(null);
      return;
    }
    setBoundaryForm(getWorkshopBoundaryPolicy(selectedWorkshop));
    setHeartbeatForm(heartbeatFormFromRow(detail?.heartbeat ?? null));
  }, [
    selectedWorkshop?.id,
    selectedWorkshop?.autonomyLevel,
    selectedWorkshop?.boundaryPolicy,
    detail?.heartbeat,
  ]);

  async function applyWorkshopYaml() {
    setBusy(true);
    setError(null);
    try {
      if (!manifestReview?.ok) {
        throw new Error("Manifest must pass review before applying.");
      }
      const data = await jsonFetch<{
        workshop: Workshop;
        review: WorkshopManifestReview;
      }>(selectedId ? `/api/workshops/${selectedId}` : "/api/workshops", {
        method: selectedId ? "PATCH" : "POST",
        body: JSON.stringify({
          manifestYaml,
          apply: true,
        }),
      });
      await refreshWorkshops();
      setSelectedId(data.workshop.id);
      setIsCreateDialogOpen(false);
      setManifestReview(null);
      if (!selectedId) {
        setManifestYaml(DEFAULT_WORKSHOP_MANIFEST_YAML);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reviewManifestYaml() {
    setManifestReviewing(true);
    setError(null);
    try {
      const data = await jsonFetch<{ review: WorkshopManifestReview }>(
        selectedId ? `/api/workshops/${selectedId}` : "/api/workshops",
        {
          method: selectedId ? "PATCH" : "POST",
          body: JSON.stringify({
            manifestYaml,
            dryRun: true,
          }),
        },
      );
      setManifestReview(data.review);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
      setManifestReview(null);
    } finally {
      setManifestReviewing(false);
    }
  }

  async function deleteWorkshop(workshopId: string) {
    const workshop = workshops.find((item) => item.id === workshopId);
    if (!workshop) return;
    const confirmed = window.confirm(
      `删除车间「${workshop.name}」？这会同时删除它的工作记录、记忆、资料源、待发草稿和唤醒设置。`,
    );
    if (!confirmed) return;

    setDeletingId(workshopId);
    setError(null);
    try {
      await jsonFetch<{ workshop: Workshop }>(`/api/workshops/${workshopId}`, {
        method: "DELETE",
      });
      const remaining = workshops.filter((item) => item.id !== workshopId);
      setWorkshops(remaining);
      setSelectedId((current) =>
        current === workshopId ? (remaining[0]?.id ?? null) : current,
      );
      setDetail((current) =>
        current?.workshop.id === workshopId ? null : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
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

  async function runWorkshopLoop(loopId: string) {
    if (!selectedId) return;
    setRunningLoopId(loopId);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/loops/${loopId}/execute`, {
        method: "POST",
        body: JSON.stringify({ mode: "native_agent" }),
      });
      scheduleLiveDetailRefresh(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      window.setTimeout(() => {
        setRunningLoopId((current) => (current === loopId ? null : current));
      }, 1200);
    }
  }

  async function updateLoopActivation(
    loopId: string,
    action: "activate" | "reject",
  ) {
    if (!selectedId) return;
    setUpdatingLoopActivationId(loopId);
    setError(null);
    try {
      await jsonFetch(
        `/api/workshops/${selectedId}/loops/${loopId}/activation`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      );
      await Promise.all([
        refreshDetail(selectedId),
        refreshDashboard(selectedId),
      ]);
      if (selectedLoopDetailId === loopId) {
        setLoopDetail(await loadLoopDetail(selectedId, loopId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setUpdatingLoopActivationId(null);
    }
  }

  async function updateLoopStatus(
    loop: WorkshopDashboardLoop,
    action: "pause" | "resume",
  ) {
    if (!selectedId) return;
    setUpdatingLoopStatusId(loop.id);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/loops/${loop.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          reason:
            action === "pause"
              ? "Owner paused loop from workshop UI"
              : "Owner resumed loop from workshop UI",
        }),
      });
      await Promise.all([
        refreshDetail(selectedId),
        refreshDashboard(selectedId),
      ]);
      if (selectedLoopDetailId === loop.id) {
        setLoopDetail(await loadLoopDetail(selectedId, loop.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setUpdatingLoopStatusId(null);
    }
  }

  async function deleteWorkshopLoop(loop: WorkshopDashboardLoop) {
    if (!selectedId) return;
    const confirmed = window.confirm(
      `删除任务「${loop.name}」？这会从任务列表隐藏，但保留历史运行记录和审计事件。`,
    );
    if (!confirmed) return;

    setUpdatingLoopStatusId(loop.id);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/loops/${loop.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          reason: "Owner archived loop from workshop UI",
        }),
      });
      await Promise.all([
        refreshDetail(selectedId),
        refreshDashboard(selectedId),
      ]);
      if (selectedLoopDetailId === loop.id) {
        setSelectedLoopDetailId(null);
        setLoopDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setUpdatingLoopStatusId(null);
    }
  }

  async function resolveLoopApproval(
    approvalId: string,
    status: "approved" | "rejected",
  ) {
    if (!selectedId) return;
    setResolvingApprovalId(approvalId);
    setError(null);
    try {
      await jsonFetch(`/api/loops/approvals/${approvalId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await Promise.all([
        refreshDetail(selectedId),
        refreshDashboard(selectedId),
      ]);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshSelectedLoopDetail().catch(() => {});
    } finally {
      setResolvingApprovalId(null);
    }
  }

  async function resumeLoopApproval(approvalId: string) {
    if (!selectedId) return;
    setResumingApprovalId(approvalId);
    setError(null);
    try {
      await jsonFetch(`/api/loops/approvals/${approvalId}/resume`, {
        method: "POST",
        body: JSON.stringify({
          note: "Resumed from workshop loop detail",
        }),
      });
      await Promise.all([
        refreshDetail(selectedId),
        refreshDashboard(selectedId),
      ]);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshSelectedLoopDetail().catch(() => {});
    } finally {
      setResumingApprovalId(null);
    }
  }

  async function createWorkshopLoopFromIntent() {
    if (!selectedId || !loopIntent.trim()) return;
    setCreatingLoop(true);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/loops`, {
        method: "POST",
        body: JSON.stringify({
          type: "natural_language",
          intent: loopIntent,
          create: true,
          externalWriteMode: "manual_approval",
        }),
      });
      setLoopIntent("");
      await Promise.all([
        refreshDetail(selectedId),
        refreshDashboard(selectedId),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setCreatingLoop(false);
    }
  }

  async function createDailyBriefLoop() {
    if (!selectedId) return;
    setCreatingLoop(true);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/loops`, {
        method: "POST",
        body: JSON.stringify({
          type: "template",
          templateId: "daily-brief",
          input: { timezone: "Asia/Shanghai" },
        }),
      });
      await Promise.all([
        refreshDetail(selectedId),
        refreshDashboard(selectedId),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setCreatingLoop(false);
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
      await Promise.all([
        refreshDetail(selectedId),
        refreshSources(selectedId),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function recordWechatMessages() {
    if (!selectedId) return;
    setRecordingWechatMessages(true);
    setError(null);
    try {
      await jsonFetch("/api/interactions/wechat/record-new", {
        method: "POST",
        body: JSON.stringify({
          workshopId: selectedId,
          limit: 50,
        }),
      });
      await Promise.all([refreshDetail(selectedId), refreshInteractions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshInteractions().catch(() => {});
    } finally {
      setRecordingWechatMessages(false);
    }
  }

  async function updateInteractionWikiStatus(
    kind: "task" | "memory",
    id: string,
    status: string,
  ) {
    setWikiActionId(`${kind}:${id}:${status}`);
    setError(null);
    try {
      await jsonFetch("/api/interactions/wiki", {
        method: "PATCH",
        body: JSON.stringify({ kind, id, status }),
      });
      await refreshInteractions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWikiActionId(null);
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
      await Promise.all([refreshDetail(selectedId), refreshOutbox(selectedId)]);
    }
  }

  async function previewOutbox(outbox: WorkshopOutbox) {
    if (!selectedId) return;
    setBusy(true);
    setOutboxActionId(`preview:${outbox.id}`);
    setError(null);
    try {
      const recipientName =
        outboxRecipients[outbox.id] ?? outbox.recipientName ?? "";
      if (recipientName.trim() !== (outbox.recipientName ?? "")) {
        await updateOutboxRecipient(outbox.id, recipientName, false);
      }
      await jsonFetch(
        `/api/workshops/${selectedId}/outbox/${outbox.id}/preview`,
        {
          method: "POST",
        },
      );
      await Promise.all([refreshDetail(selectedId), refreshOutbox(selectedId)]);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
      await refreshSelectedLoopDetail().catch(() => {});
    } finally {
      setBusy(false);
      setOutboxActionId(null);
    }
  }

  async function sendOutbox(outboxId: string) {
    if (!selectedId) return;
    setBusy(true);
    setOutboxActionId(`send:${outboxId}`);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/outbox/${outboxId}/send`, {
        method: "POST",
      });
      await Promise.all([refreshDetail(selectedId), refreshOutbox(selectedId)]);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
      await refreshSelectedLoopDetail().catch(() => {});
    } finally {
      setBusy(false);
      setOutboxActionId(null);
    }
  }

  async function resolveWatchlistProposal(
    eventId: string,
    action: "apply" | "reject",
  ) {
    if (!selectedId) return;
    setWatchlistProposalActionId(`${action}:${eventId}`);
    setError(null);
    try {
      await jsonFetch(
        `/api/workshops/${selectedId}/watchlist-proposals/${eventId}`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      );
      await refreshDetail(selectedId);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setWatchlistProposalActionId(null);
    }
  }

  async function resolveVideoReview(
    draftId: string,
    action: "approve" | "reject" | "regenerate",
  ) {
    if (!selectedId) return;
    setVideoReviewActionId(`${action}:${draftId}`);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/video-reviews/${draftId}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await Promise.all([
        refreshDetail(selectedId),
        refreshDouyinDrafts().catch(() => undefined),
      ]);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setVideoReviewActionId(null);
    }
  }

  async function resolveAgentChangeProposal(
    eventId: string,
    action: WorkshopAgentChangeAction,
  ) {
    if (!selectedId) return;
    setAgentChangeActionId(`${action}:${eventId}`);
    setError(null);
    try {
      await jsonFetch(
        `/api/workshops/${selectedId}/agent-change-proposals/${eventId}`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      );
      await refreshDetail(selectedId);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setAgentChangeActionId(null);
    }
  }

  async function restoreWorkVersion(version: WorkshopWorkVersion) {
    if (!selectedId) return;
    const ok = window.confirm(
      `恢复到 Work 版本 ${formatWorkVersion(
        version.version,
      )}？这会记录一条恢复事件，并生成新的当前版本。`,
    );
    if (!ok) return;

    setRestoringWorkVersionId(version.id);
    setError(null);
    try {
      await jsonFetch(`/api/workshops/${selectedId}/work/versions`, {
        method: "POST",
        body: JSON.stringify({
          action: "restore",
          versionId: version.id,
          reason: "Owner restored Work version from Work panel",
        }),
      });
      await refreshDetail(selectedId);
      await refreshSelectedLoopDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refreshDetail(selectedId).catch(() => {});
    } finally {
      setRestoringWorkVersionId(null);
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

  async function saveBoundaryPolicy() {
    if (!selectedId || !boundaryForm) return;
    const boundaryPolicy = serializeWorkshopBoundaryPolicy(boundaryForm);
    setBusy(true);
    setError(null);
    try {
      await jsonFetch<{ workshop: Workshop }>(`/api/workshops/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          autonomyLevel: boundaryPolicy.mode,
          boundaryPolicy,
        }),
      });
      await Promise.all([refreshWorkshops(), refreshDetail(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveHeartbeatPolicy() {
    if (!selectedId || !heartbeatForm) return;
    setBusy(true);
    setError(null);
    try {
      await jsonFetch<{ workshop: Workshop; heartbeat: WorkshopHeartbeat }>(
        `/api/workshops/${selectedId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            heartbeat: {
              enabled: heartbeatForm.enabled,
              mode: "suggested",
              heartbeatPolicy: {
                allowAgentSuggestedWakeup:
                  heartbeatForm.allowAgentSuggestedWakeup,
                minIntervalMinutes: heartbeatForm.minIntervalMinutes,
                defaultDelayMinutes: heartbeatForm.defaultDelayMinutes,
                maxIntervalMinutes: heartbeatForm.maxIntervalMinutes,
                missedRunGraceMinutes: heartbeatForm.missedRunGraceMinutes,
                leaseMinutes: heartbeatForm.leaseMinutes,
                maxConsecutiveFailures: heartbeatForm.maxConsecutiveFailures,
              },
            },
          }),
        },
      );
      await refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function openWorkshopYamlDialog() {
    if (selectedWorkshop) {
      const loops =
        dashboard?.loops ??
        (detail?.loops ?? []).map((loop) => fallbackDashboardLoop(loop));
      setManifestYaml(
        workshopToEditableManifestYaml({
          workshop: selectedWorkshop,
          loops,
        }),
      );
    } else {
      setManifestYaml(DEFAULT_WORKSHOP_MANIFEST_YAML);
    }
    setManifestReview(null);
    setIsCreateDialogOpen(true);
  }

  const dashboard = detail?.dashboard ?? null;
  const loopItems = useMemo(
    () => {
      const items =
        dashboard?.loops ??
        (detail?.loops ?? []).map((loop) => fallbackDashboardLoop(loop));
      return items.filter((loop) => loop.status !== "archived");
    },
    [dashboard?.loops, detail?.loops],
  );
  const selectedLoopDetail = useMemo(
    () => loopItems.find((loop) => loop.id === selectedLoopDetailId) ?? null,
    [loopItems, selectedLoopDetailId],
  );
  const selectedLoopEvents = useMemo(() => {
    if (!selectedLoopDetail) return [];
    return [...(detail?.events ?? [])]
      .filter((event) => event.loopId === selectedLoopDetail.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.seq - a.seq,
      );
  }, [detail?.events, selectedLoopDetail]);
  const selectedLoopApiDetail =
    loopDetail?.loop.id === selectedLoopDetailId ? loopDetail : null;
  const reviewWatchlistProposals = useMemo(
    () => pendingWatchlistProposalEvents(detail?.events ?? []),
    [detail?.events],
  );
  const reviewAgentChangeProposals = useMemo(
    () => pendingAgentChangeProposalEvents(detail?.events ?? []),
    [detail?.events],
  );
  const reviewVideoDrafts = useMemo(
    () => pendingVideoDrafts(douyinDrafts, detail?.events ?? [], selectedId),
    [detail?.events, douyinDrafts, selectedId],
  );
  const reviewItemCount =
    reviewWatchlistProposals.length +
    reviewVideoDrafts.length +
    reviewAgentChangeProposals.length;
  const visibleWorkLogEvents = useMemo(
    () => workLogEvents(detail?.events ?? []),
    [detail?.events],
  );

  if (loading && workshops.length === 0 && !selectedWorkshop) {
    return <WorkshopLoadingShell />;
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[#F8FAF9]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--product-amber)]">
              <span
                className="h-px w-6 bg-[var(--product-amber)]"
                aria-hidden="true"
              />
              智能体车间{" "}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
                {selectedWorkshop?.name ?? "让智能体持续工作"}
              </h1>
              {dashboard ? (
                <Badge
                  variant="secondary"
                  className={dashboardStatusTone(dashboard.status)}
                >
                  {dashboardStatusLabel(dashboard.status)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {selectedWorkshop
                ? workshopDisplayDescription(selectedWorkshop)
                : "用 YAML 创建长期运行的智能体车间。"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={openWorkshopYamlDialog}
              className="gap-2"
            >
              <RemixIcon name="edit" size="size-4" />
              修改车间
            </Button>
            <Button
              onClick={startRun}
              disabled={!selectedId || busy}
              className="gap-2"
            >
              <RemixIcon name="play" size="size-4" />
              运行一次{" "}
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <LoopTaskDetailDialog
          loop={selectedLoopDetail}
          detail={selectedLoopApiDetail}
          loading={
            Boolean(selectedLoopDetailId) &&
            loadingLoopDetailId === selectedLoopDetailId
          }
          events={selectedLoopEvents}
          open={Boolean(selectedLoopDetail)}
          onOpenChange={(open) => {
            if (!open) setSelectedLoopDetailId(null);
          }}
          onRun={runWorkshopLoop}
          onActivate={(loopId) => updateLoopActivation(loopId, "activate")}
          onReject={(loopId) => updateLoopActivation(loopId, "reject")}
          onPause={(loop) => updateLoopStatus(loop, "pause")}
          onResume={(loop) => updateLoopStatus(loop, "resume")}
          onDelete={deleteWorkshopLoop}
          onResolveApproval={resolveLoopApproval}
          onResumeApproval={resumeLoopApproval}
          onPreviewOutbox={previewOutbox}
          onSendOutbox={sendOutbox}
          running={Boolean(
            selectedLoopDetail && runningLoopId === selectedLoopDetail.id,
          )}
          updatingActivation={Boolean(
            selectedLoopDetail &&
            updatingLoopActivationId === selectedLoopDetail.id,
          )}
          updatingStatus={Boolean(
            selectedLoopDetail &&
            updatingLoopStatusId === selectedLoopDetail.id,
          )}
          resolvingApprovalId={resolvingApprovalId}
          resumingApprovalId={resumingApprovalId}
          outboxActionId={outboxActionId}
        />

        <WorkLogExpandedDialog
          workshopId={selectedId}
          events={visibleWorkLogEvents}
          open={isWorkLogExpanded}
          onOpenChange={setIsWorkLogExpanded}
        />

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {selectedId ? "修改智能体车间" : "新建智能体车间"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                使用标准化 Workshop YAML
                创建车间。系统会先审核字段、工具权限、Skill、Loop
                和验证规则，审核通过后才能创建。
              </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="workshop-manifest-yaml"
                      className="text-sm font-medium text-foreground"
                    >
                      Workshop YAML
                    </label>
                    <Textarea
                      id="workshop-manifest-yaml"
                      name="workshop-manifest-yaml"
                      value={manifestYaml}
                      onChange={(event) => {
                        setManifestYaml(event.target.value);
                        setManifestReview(null);
                      }}
                      className="min-h-72 resize-y font-mono text-xs"
                      placeholder={
                        "apiVersion: openzhiyu.ai/v1alpha1\nkind: Workshop\nmetadata:\n  name: watchlist-hunter\n  title: 自选股猎手\nspec: ..."
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={reviewManifestYaml}
                      disabled={manifestReviewing || !manifestYaml.trim()}
                      className="gap-2"
                    >
                      <RemixIcon name="shield-check" size="size-4" />
                      {manifestReviewing ? "审核中..." : "审核 YAML"}
                    </Button>
                    {manifestReview ? (
                      <Badge
                        variant={manifestReview.ok ? "default" : "destructive"}
                      >
                        {manifestReview.ok ? "审核通过" : "审核失败"}
                      </Badge>
                    ) : null}
                  </div>

                  {manifestReview ? (
                    <div
                      className={cn(
                        "space-y-3 rounded-lg border p-3 text-xs leading-5",
                        manifestReview.ok
                          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                          : "border-destructive/30 bg-destructive/5 text-destructive",
                      )}
                    >
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <div>
                          <div className="text-muted-foreground">Loop</div>
                          <div className="font-medium">
                            {manifestReview.summary.loops}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Source</div>
                          <div className="font-medium">
                            {manifestReview.summary.sources}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Tool</div>
                          <div className="font-medium">
                            {manifestReview.summary.requestedTools}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Skill</div>
                          <div className="font-medium">
                            {manifestReview.summary.requestedSkills}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Denied</div>
                          <div className="font-medium">
                            {manifestReview.summary.deniedTools}
                          </div>
                        </div>
                      </div>

                      {manifestReview.creationReport ? (
                        <div className="rounded-md border border-current/20 p-2">
                          <div className="font-medium">
                            {manifestReview.creationReport.title}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            {manifestReview.creationReport.body}
                          </p>
                        </div>
                      ) : null}

                      {manifestReview.issues.length > 0 ? (
                        <div className="space-y-1">
                          {manifestReview.issues.slice(0, 8).map((issue) => (
                            <div key={`${issue.path}-${issue.message}`}>
                              <span className="font-medium">
                                {issue.severity.toUpperCase()} {issue.path}
                              </span>
                              : {issue.message}
                            </div>
                          ))}
                          {manifestReview.issues.length > 8 ? (
                            <div>
                              +{manifestReview.issues.length - 8} more issue(s)
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-800">
                新车间默认只生成草稿。外部发送、交易、付款和删除等动作仍需经过边界检查。
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  onClick={applyWorkshopYaml}
                  disabled={busy || !manifestReview?.ok}
                  className="gap-2"
                >
                  <RemixIcon name="checkbox_circle" size="size-4" />
                  应用 YAML
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="flex h-[min(720px,calc(100vh-2rem))] min-h-0 flex-col rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-foreground">
                  我的车间
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {workshops.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                一个车间对应一个长期工作的智能体空间。
              </p>
            </div>
            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {loading ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  正在加载车间...
                </div>
              ) : workshops.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  还没有车间，先创建一个。
                </div>
              ) : (
                workshops.map((workshop) => (
                  <div
                    key={workshop.id}
                    className={cn(
                      "group flex items-stretch gap-1 transition-colors hover:bg-muted/60",
                      selectedId === workshop.id &&
                        "bg-[#FAF6EF] shadow-[inset_3px_0_0_var(--product-amber)]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-4 py-3 text-left"
                      onClick={() => setSelectedId(workshop.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {workshop.name}
                        </span>
                        <Badge variant="secondary">
                          {dashboardStatusLabel(workshop.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {workshopDisplayDescription(workshop)}
                      </p>
                    </button>
                    <div className="flex items-center pr-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`删除车间 ${workshop.name}`}
                        title="删除车间"
                        disabled={busy || deletingId === workshop.id}
                        className="size-8 text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        onClick={() => deleteWorkshop(workshop.id)}
                      >
                        <RemixIcon
                          name={
                            deletingId === workshop.id
                              ? "loader_icon"
                              : "delete_bin"
                          }
                          size="size-4"
                          className={
                            deletingId === workshop.id
                              ? "animate-spin"
                              : undefined
                          }
                        />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border p-3">
              <Button
                variant="outline"
                onClick={openWorkshopYamlDialog}
                className="w-full gap-2"
              >
                <RemixIcon name={selectedId ? "edit" : "add"} size="size-4" />
                {selectedId ? "修改车间" : "新建车间"}
              </Button>
            </div>
          </aside>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="flex h-[min(720px,calc(100vh-2rem))] min-h-0 min-w-0 flex-col gap-4">
              <div className="space-y-3">
                <div className="px-1 py-1">
                  <h2 className="text-sm font-medium text-foreground">
                    运营概览
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    先处理待确认和异常，再决定是否运行下一轮。{" "}
                  </p>
                </div>

                <div className="grid divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RemixIcon name="pulse" size="size-4" />
                      当前状态{" "}
                    </div>
                    <p
                      className={cn(
                        "mt-3 text-xl font-semibold tracking-normal",
                        dashboardStatusTone(dashboard?.status ?? "paused"),
                      )}
                    >
                      {dashboard
                        ? dashboardStatusLabel(dashboard.status)
                        : "未启"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dashboard
                        ? `${dashboard.counts.activeLoops}/${dashboard.counts.loops} 个任务活跃`
                        : "暂无车间数据"}
                    </p>
                  </div>

                  <div className="px-4 py-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RemixIcon name="checkbox_circle" size="size-4" />
                      待确认{" "}
                    </div>
                    <p className="mt-3 text-xl font-semibold tracking-normal text-foreground">
                      {dashboard
                        ? dashboard.counts.pendingOutbox +
                          dashboard.counts.pendingApprovals
                        : 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pendingDashboardSummary(dashboard)}
                    </p>
                  </div>

                  <div className="px-4 py-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RemixIcon name="time" size="size-4" />
                      下次工作
                    </div>
                    <p className="mt-3 text-sm font-medium leading-6 text-foreground">
                      {dashboard?.nextWork.label ?? "暂无安排"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(dashboard?.nextWork.at ?? null)}
                    </p>
                  </div>

                  <div className="px-4 py-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RemixIcon name="lightbulb" size="size-4" />
                      最近发现{" "}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-foreground">
                      {dashboard?.recentFinding?.title ??
                        dashboard?.latestEvent?.title ??
                        "暂无发现"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {dashboard?.recentFinding?.body ??
                        dashboard?.latestEvent?.body ??
                        "启动任务或添加资料后，这里会出现最近结果"}
                    </p>
                  </div>
                </div>

                {dashboard &&
                (dashboard.blockedLoops.length > 0 ||
                  dashboard.pendingLoopProposals.length > 0) ? (
                  <div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {dashboard.pendingLoopProposals.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <RemixIcon name="calendar" size="size-4" />
                            待激活任务{" "}
                          </div>
                          {dashboard.pendingLoopProposals
                            .slice(0, 2)
                            .map((loop) => {
                              const isUpdating =
                                updatingLoopActivationId === loop.id;
                              return (
                                <div
                                  key={loop.id}
                                  className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {loop.name}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary">待激</Badge>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setSelectedLoopDetailId(loop.id)
                                        }
                                        className="h-7 gap-1 px-2"
                                      >
                                        <RemixIcon
                                          name="information"
                                          size="size-3"
                                        />
                                        详情
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                    {loop.nextAction ??
                                      loop.description ??
                                      loop.goal}
                                  </p>
                                  <LoopProposalDetails loop={loop} compact />
                                  <div className="mt-3 flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        updateLoopActivation(
                                          loop.id,
                                          "activate",
                                        )
                                      }
                                      disabled={isUpdating}
                                      className="h-8 flex-1 gap-2"
                                    >
                                      <RemixIcon
                                        name={isUpdating ? "loader" : "play"}
                                        size="size-4"
                                      />
                                      激活{" "}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        updateLoopActivation(loop.id, "reject")
                                      }
                                      disabled={isUpdating}
                                      className="h-8 flex-1 gap-2"
                                    >
                                      <RemixIcon name="close" size="size-4" />
                                      拒绝
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : null}

                      {dashboard.blockedLoops.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <RemixIcon name="alarm_warning" size="size-4" />
                            霢要处理的任务
                          </div>
                          {dashboard.blockedLoops.slice(0, 2).map((loop) => (
                            <div
                              key={loop.id}
                              className="rounded-lg border border-border bg-background p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {loop.name}
                                </span>
                                <Badge variant="secondary">
                                  {dashboardStatusLabel(loop.dashboardStatus)}
                                </Badge>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {loop.blockedReason ??
                                  loop.nextAction ??
                                  loop.latestRun?.error ??
                                  loop.latestRun?.outputSummary ??
                                  "等待进一步处"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
                <div className="shrink-0 border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="mr-auto">
                      <h3 className="text-sm font-medium text-foreground">
                        工作记录
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        这里展示结构化工作事件：读了什么、记住了什么、生成了什么草稿。{" "}
                      </p>
                    </div>
                    <Badge variant="secondary">实时更新</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-full border border-border bg-background/80 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground"
                        onClick={() => setIsWorkLogExpanded(true)}
                        aria-label="Expand work log"
                        title="Expand work log"
                      >
                        <RemixIcon name="fullscreen" size="size-4" />
                      </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {!detail || visibleWorkLogEvents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      暂无工作记录。运行一次或追加方向后，这里会显示过程与结果。{" "}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visibleWorkLogEvents.map((event) => {
                        const resolution = isWatchlistProposalEvent(event)
                          ? watchlistProposalResolution(detail.events, event)
                          : undefined;
                        const readableBody = humanReadableWorkLogBody(event);
                        return (
                          <div
                            key={event.id}
                            className="flex gap-3 [contain-intrinsic-size:0_120px] [content-visibility:auto]"
                          >
                            <div className="flex w-14 shrink-0 justify-end pt-1 text-xs text-muted-foreground">
                              {formatTime(event.createdAt)}
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                                <RemixIcon
                                  name={eventIcon(event.type)}
                                  size="size-4"
                                />
                              </div>
                              <div className="mt-2 h-full w-px bg-border" />
                            </div>
                            <div className="min-w-0 flex-1 rounded-lg border border-border bg-background p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">
                                  {eventTypeLabel(event.type)}
                                </Badge>
                                <h4 className="text-sm font-medium text-foreground">
                                  {eventDisplayTitle(event)}
                                </h4>
                              </div>
                              {readableBody ? (
                                <p className="mt-2 line-clamp-6 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-6 text-foreground">
                                  {readableBody}
                                </p>
                              ) : null}
                              {isWatchlistProposalEvent(event) ? (
                                <WatchlistProposalEventCard
                                  event={event}
                                  resolution={resolution}
                                  actionId={watchlistProposalActionId}
                                  onResolve={resolveWatchlistProposal}
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={logEndRef} />
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-border p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      name="workshop-direction"
                      aria-label="追加车间方向"
                      value={directive}
                      onChange={(event) => setDirective(event.target.value)}
                      placeholder="追加方向，例如：今天只看 NVDA 和台积电，不要看宏观。"
                      className="min-h-11 resize-none"
                    />
                    <Button
                      onClick={sendDirective}
                      disabled={!selectedId || busy || !directive.trim()}
                      className="shrink-0 gap-2"
                    >
                      <RemixIcon name="arrow_right_s" size="size-4" />
                      追加方向
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <aside className="h-[min(720px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] min-w-0 self-start overflow-hidden rounded-lg border border-border bg-card 2xl:sticky 2xl:top-4">
              <Tabs
                value={activeSideTab}
                onValueChange={handleSideTabChange}
                className="flex h-full min-h-0 flex-col"
              >
                <div className="shrink-0 snap-x overflow-x-auto border-b border-border px-3 py-3">
                  <TabsList className="flex w-max min-w-full justify-start gap-1 [&>*]:shrink-0 [&>*]:snap-start [&>*]:whitespace-nowrap">
                    <TabsTrigger className={sidePanelTriggerClass} value="work">
                      Work
                    </TabsTrigger>
                    <TabsTrigger value="sources">资料</TabsTrigger>
                    <TabsTrigger value="interactions">交互</TabsTrigger>
                    <TabsTrigger value="memory">记忆</TabsTrigger>
                    <TabsTrigger value="loops">任务</TabsTrigger>
                    <TabsTrigger value="outbox">待发</TabsTrigger>
                    <TabsTrigger value="tools">工具</TabsTrigger>
                    <TabsTrigger value="review">
                      审核{reviewItemCount > 0 ? ` ${reviewItemCount}` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="evolution">演化</TabsTrigger>
                    <TabsTrigger value="boundary">边界</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent
                  value="work"
                  className={cn(sidePanelContentClass, "space-y-4 p-4")}
                >
                  {activeSideTab === "work" ? (
                    panelLoading.work && !workModel ? (
                      <p className="text-sm text-muted-foreground">
                        加载工作模型...
                      </p>
                    ) : (
                      <WorkPanel
                        work={workModel}
                        events={detail?.events ?? []}
                        versions={workVersions}
                        restoringVersionId={restoringWorkVersionId}
                        onRestoreVersion={restoreWorkVersion}
                      />
                    )
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="sources"
                  className={cn(sidePanelContentClass, "space-y-4 p-4")}
                >
                  {activeSideTab === "sources" ? (
                    <>
                      <div className="space-y-2">
                        <Input
                          value={sourceName}
                          onChange={(event) =>
                            setSourceName(event.target.value)
                          }
                          placeholder="资料名称"
                        />
                        <Input
                          value={sourceUri}
                          onChange={(event) => setSourceUri(event.target.value)}
                          placeholder="网址，可选"
                        />
                        <Textarea
                          value={sourceContent}
                          onChange={(event) =>
                            setSourceContent(event.target.value)
                          }
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
                      {panelLoading.sources && !loadedPanels.sources ? (
                        <p className="text-sm text-muted-foreground">
                          加载资料源...
                        </p>
                      ) : null}
                      <div className="space-y-3">
                        {(detail?.sources ?? []).map((source) => (
                          <div
                            key={source.id}
                            className="rounded-lg border border-border p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {source.name}
                              </span>
                              <Badge variant="secondary">{source.type}</Badge>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                              {source.uri ?? source.content ?? "无额外内"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="interactions"
                  className={cn(sidePanelContentClass, "space-y-3 p-4")}
                >
                  {activeSideTab === "interactions" ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={recordWechatMessages}
                          disabled={!selectedId || recordingWechatMessages}
                          className="flex-1 gap-2"
                        >
                          <RemixIcon name="inbox_unarchive" size="size-4" />
                          {recordingWechatMessages
                            ? "记录中..."
                            : "记录微信新消息"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            refreshInteractions().catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              ),
                            )
                          }
                          disabled={interactionsLoading}
                          aria-label="刷新交互"
                        >
                          <RemixIcon name="refresh" size="size-4" />
                        </Button>
                      </div>

                      {interactionsLoading && interactionEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          加载中...
                        </p>
                      ) : interactionEvents.length === 0 ? (
                        <p className="text-sm leading-6 text-muted-foreground">
                          暂无已记录的微信消息。点击上方按钮后，新消息会沉淀为交互事件。{" "}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {interactionEvents.map((event) => (
                            <div
                              key={event.id}
                              className="rounded-lg border border-border p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-foreground">
                                    {event.conversationName}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {event.senderDisplayName ??
                                      event.senderName ??
                                      "未知发"}{" "}
                                    · {formatDateTime(event.messageTime)}
                                  </div>
                                </div>
                                <Badge variant="secondary">
                                  {event.processedStatus}
                                </Badge>
                              </div>
                              <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground">
                                {event.contentPreview}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="border-t border-border pt-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h4 className="text-sm font-medium text-foreground">
                            交互沉淀
                          </h4>
                          <Badge variant="outline">
                            {interactionWiki.notes.length +
                              interactionWiki.tasks.length +
                              interactionWiki.memories.length}
                          </Badge>
                        </div>

                        {interactionWiki.notes.length === 0 &&
                        interactionWiki.tasks.length === 0 &&
                        interactionWiki.memories.length === 0 ? (
                          <p className="text-sm leading-6 text-muted-foreground">
                            暂无摘要、待办或长期记忆候智能体处理消息后会把有价值的信息写到这里。{" "}
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {interactionWiki.tasks.length > 0 ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                  待办候选{" "}
                                </div>
                                {interactionWiki.tasks
                                  .slice(0, 3)
                                  .map((task) => (
                                    <div
                                      key={task.id}
                                      className="min-w-0 rounded-lg border border-border p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                          {task.title}
                                        </span>
                                        <Badge variant="secondary">
                                          {interactionStatusLabel(task.status)}
                                        </Badge>
                                      </div>
                                      {task.description ? (
                                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                          {task.description}
                                        </p>
                                      ) : null}
                                      {canConfirmInteractionItem(
                                        task.status,
                                      ) ? (
                                        <div className="mt-3 flex gap-2">
                                          <Button
                                            variant="outline"
                                            className="h-7 gap-1 px-2 text-xs"
                                            disabled={
                                              wikiActionId ===
                                              `task:${task.id}:confirmed`
                                            }
                                            onClick={() =>
                                              updateInteractionWikiStatus(
                                                "task",
                                                task.id,
                                                "confirmed",
                                              )
                                            }
                                          >
                                            <RemixIcon
                                              name="checkbox_circle"
                                              size="size-3.5"
                                            />
                                            确认
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                                            disabled={
                                              wikiActionId ===
                                              `task:${task.id}:dismissed`
                                            }
                                            onClick={() =>
                                              updateInteractionWikiStatus(
                                                "task",
                                                task.id,
                                                "dismissed",
                                              )
                                            }
                                          >
                                            <RemixIcon
                                              name="close"
                                              size="size-3.5"
                                            />
                                            忽略
                                          </Button>
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                              </div>
                            ) : null}

                            {interactionWiki.memories.length > 0 ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                  长期记忆候选{" "}
                                </div>
                                {interactionWiki.memories
                                  .slice(0, 3)
                                  .map((memory) => (
                                    <div
                                      key={memory.id}
                                      className="rounded-lg border border-border p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium text-foreground">
                                          {memory.subject}
                                        </span>
                                        <Badge variant="secondary">
                                          {memory.memoryType}
                                        </Badge>
                                      </div>
                                      <div className="mt-2">
                                        <Badge variant="outline">
                                          {interactionStatusLabel(
                                            memory.status,
                                          )}
                                        </Badge>
                                      </div>
                                      <p className="mt-2 line-clamp-2 min-w-0 break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                                        {memory.content}
                                      </p>
                                      {canConfirmInteractionItem(
                                        memory.status,
                                      ) ? (
                                        <div className="mt-3 flex gap-2">
                                          <Button
                                            variant="outline"
                                            className="h-7 gap-1 px-2 text-xs"
                                            disabled={
                                              wikiActionId ===
                                              `memory:${memory.id}:confirmed`
                                            }
                                            onClick={() =>
                                              updateInteractionWikiStatus(
                                                "memory",
                                                memory.id,
                                                "confirmed",
                                              )
                                            }
                                          >
                                            <RemixIcon
                                              name="checkbox_circle"
                                              size="size-3.5"
                                            />
                                            确认
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                                            disabled={
                                              wikiActionId ===
                                              `memory:${memory.id}:dismissed`
                                            }
                                            onClick={() =>
                                              updateInteractionWikiStatus(
                                                "memory",
                                                memory.id,
                                                "dismissed",
                                              )
                                            }
                                          >
                                            <RemixIcon
                                              name="close"
                                              size="size-3.5"
                                            />
                                            忽略
                                          </Button>
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                              </div>
                            ) : null}

                            {interactionWiki.notes.length > 0 ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                  理解摘要
                                </div>
                                {interactionWiki.notes
                                  .slice(0, 3)
                                  .map((note) => (
                                    <div
                                      key={note.id}
                                      className="rounded-lg border border-border p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium text-foreground">
                                          {note.title}
                                        </span>
                                        <Badge variant="secondary">
                                          {note.noteType}
                                        </Badge>
                                      </div>
                                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                        {note.body}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="memory"
                  className={cn(sidePanelContentClass, "space-y-3 p-4")}
                >
                  {activeSideTab === "memory" ? (
                    <>
                      {panelLoading.memories && !loadedPanels.memories ? (
                        <p className="text-sm text-muted-foreground">
                          加载记忆...
                        </p>
                      ) : (detail?.memories ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          暂无长期记忆。后续 CC SDK
                          执行器会在每轮结束后提炼写入。{" "}
                        </p>
                      ) : (
                        detail?.memories.map((memory) => (
                          <div
                            key={memory.id}
                            className="min-w-0 rounded-lg border border-border p-3"
                          >
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <Badge variant="secondary">{memory.kind}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {memory.confidence}%
                              </span>
                            </div>
                            <p className="mt-2 min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
                              {memory.content}
                            </p>
                          </div>
                        ))
                      )}
                    </>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="loops"
                  className={cn(sidePanelContentClass, "space-y-3 p-4")}
                >
                  {activeSideTab === "loops" ? (
                    <>
                      {panelLoading.dashboard && !loadedPanels.dashboard ? (
                        <p className="text-sm text-muted-foreground">
                          加载任务状态...
                        </p>
                      ) : null}
                      <div className="space-y-2 rounded-lg border border-border p-3">
                        <Textarea
                          value={loopIntent}
                          onChange={(event) =>
                            setLoopIntent(event.target.value)
                          }
                          className="min-h-20 resize-none"
                          placeholder="用一句话描述要持续做的任务"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            onClick={createWorkshopLoopFromIntent}
                            disabled={
                              !selectedId || creatingLoop || !loopIntent.trim()
                            }
                            className="flex-1 gap-2"
                          >
                            <RemixIcon name="sparkling" size="size-4" />
                            创建任务
                          </Button>
                          <Button
                            variant="outline"
                            onClick={createDailyBriefLoop}
                            disabled={!selectedId || creatingLoop}
                            className="flex-1 gap-2"
                          >
                            <RemixIcon name="calendar" size="size-4" />
                            每日唤醒{" "}
                          </Button>
                        </div>
                      </div>

                      {loopItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          暂无任务
                        </p>
                      ) : (
                        loopItems.map((loop) => {
                          const isRunning = runningLoopId === loop.id;
                          const isPendingProposal = isPendingLoopProposal(loop);
                          const isUpdatingActivation =
                            updatingLoopActivationId === loop.id;
                          const isUpdatingStatus =
                            updatingLoopStatusId === loop.id;
                          return (
                            <div
                              key={loop.id}
                              className="rounded-md border border-border bg-background/60 p-3 transition-colors hover:bg-muted/20"
                            >
                              <div className="space-y-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="truncate text-sm font-medium text-foreground">
                                      {loop.name}
                                    </h4>
                                    <Badge variant="secondary">
                                      {isPendingProposal
                                        ? "待激活"
                                        : dashboardStatusLabel(
                                            loop.dashboardStatus,
                                          )}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                                    {loop.description ??
                                      loop.nextAction ??
                                      loop.goal}
                                  </p>
                                  <div className="mt-2 hidden flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span>
                                      {loop.spaceSummary?.triggerLabel}
                                    </span>
                                    {loop.nextScheduledRunAt ? (
                                      <span>
                                        下次{" "}
                                        {formatDateTime(
                                          loop.nextScheduledRunAt,
                                        )}
                                      </span>
                                    ) : null}
                                  </div>
                                  {isPendingProposal ? (
                                    <LoopProposalDetails loop={loop} />
                                  ) : null}
                                </div>
                                {isPendingProposal ? (
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                      {loop.nextScheduledRunAt
                                        ? `下次 ${formatDateTime(loop.nextScheduledRunAt)}`
                                        : (loop.spaceSummary?.triggerLabel ??
                                          loop.status)}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setSelectedLoopDetailId(loop.id)
                                      }
                                      className="gap-2"
                                    >
                                      <RemixIcon
                                        name="information"
                                        size="size-4"
                                      />
                                      详情
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        updateLoopActivation(
                                          loop.id,
                                          "activate",
                                        )
                                      }
                                      disabled={isUpdatingActivation}
                                      className="gap-2"
                                    >
                                      <RemixIcon
                                        name={
                                          isUpdatingActivation
                                            ? "loader"
                                            : "play"
                                        }
                                        size="size-4"
                                      />
                                      激活{" "}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        updateLoopActivation(loop.id, "reject")
                                      }
                                      disabled={isUpdatingActivation}
                                      className="gap-2"
                                    >
                                      <RemixIcon name="close" size="size-4" />
                                      拒绝
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                      {loop.nextScheduledRunAt
                                        ? `下次 ${formatDateTime(loop.nextScheduledRunAt)}`
                                        : (loop.spaceSummary?.triggerLabel ??
                                          loop.status)}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setSelectedLoopDetailId(loop.id)
                                      }
                                      className="gap-2"
                                    >
                                      <RemixIcon
                                        name="information"
                                        size="size-4"
                                      />
                                      详情
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        loop.status === "paused"
                                          ? updateLoopStatus(loop, "resume")
                                          : updateLoopStatus(loop, "pause")
                                      }
                                      disabled={isUpdatingStatus}
                                      className="hidden gap-2"
                                    >
                                      <RemixIcon
                                        name={
                                          isUpdatingStatus
                                            ? "loader"
                                            : loop.status === "paused"
                                              ? "play"
                                              : "pause"
                                        }
                                        size="size-4"
                                      />
                                      {loop.status === "paused"
                                        ? "恢复"
                                        : "暂停"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => deleteWorkshopLoop(loop)}
                                      disabled={isUpdatingStatus}
                                      className="hidden gap-2 text-destructive hover:text-destructive"
                                    >
                                      <RemixIcon
                                        name={
                                          isUpdatingStatus
                                            ? "loader"
                                            : "delete_bin"
                                        }
                                        size="size-4"
                                      />
                                      删除
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={isUpdatingStatus}
                                          className="h-8 w-8 p-0"
                                          aria-label="更多任务操作"
                                        >
                                          <RemixIcon
                                            name={
                                              isUpdatingStatus
                                                ? "loader"
                                                : "more_2"
                                            }
                                            size="size-4"
                                          />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="w-36"
                                      >
                                        <DropdownMenuItem
                                          onClick={() =>
                                            loop.status === "paused"
                                              ? updateLoopStatus(loop, "resume")
                                              : updateLoopStatus(loop, "pause")
                                          }
                                          disabled={isUpdatingStatus}
                                          className="gap-2"
                                        >
                                          <RemixIcon
                                            name={
                                              loop.status === "paused"
                                                ? "play"
                                                : "pause"
                                            }
                                            size="size-4"
                                          />
                                          {loop.status === "paused"
                                            ? "恢复"
                                            : "暂停"}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            deleteWorkshopLoop(loop)
                                          }
                                          disabled={isUpdatingStatus}
                                          className="gap-2 text-destructive focus:text-destructive"
                                        >
                                          <RemixIcon
                                            name="delete_bin"
                                            size="size-4"
                                          />
                                          删除
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => runWorkshopLoop(loop.id)}
                                      disabled={
                                        !selectedId ||
                                        isRunning ||
                                        loop.status !== "active" ||
                                        isUpdatingStatus
                                      }
                                      className="gap-2"
                                    >
                                      <RemixIcon
                                        name={isRunning ? "loader" : "play"}
                                        size="size-4"
                                      />
                                      {isRunning ? "运行中" : "运行一次"}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="outbox"
                  className={cn(sidePanelContentClass, "space-y-3 p-4")}
                >
                  {activeSideTab === "outbox" ? (
                    <>
                      {panelLoading.outbox && !loadedPanels.outbox ? (
                        <p className="text-sm text-muted-foreground">
                          加载待发草稿...
                        </p>
                      ) : (detail?.outbox ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          暂无待发送草稿。智能体生成外部消息后，会先放到这里等待边界检查与确认。{" "}
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
                          const recipientInputId = `outbox-recipient-${item.id}`;
                          const needsOwnerInput = isOwnerInputOutbox(item);
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                "rounded-lg border p-3",
                                needsOwnerInput
                                  ? "border-sky-500/30 bg-sky-500/5"
                                  : "border-border",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Badge>
                                  {needsOwnerInput ? "待补充信息" : item.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {needsOwnerInput
                                    ? "车间提问"
                                    : `${item.riskLevel} / ${item.confidence}%`}
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-foreground">
                                {item.message}
                              </p>
                              <div
                                className={cn(
                                  "mt-3 flex flex-col gap-2 sm:flex-row sm:items-center",
                                  needsOwnerInput && "hidden",
                                )}
                              >
                                <div className="min-w-0 flex-1">
                                  <label
                                    htmlFor={recipientInputId}
                                    className="mb-1 block text-xs text-muted-foreground"
                                  >
                                    发送对象{" "}
                                  </label>
                                  <Input
                                    id={recipientInputId}
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
                              {needsOwnerInput ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  请在方向输入框补充信息后重新发送，车间会继续规划。{" "}
                                </p>
                              ) : null}
                              <p className="mt-2 text-xs text-muted-foreground">
                                {needsOwnerInput ? "owner_input" : item.channel}
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
                                  预览有效期至{" "}
                                  {new Date(
                                    preview.expiresAt,
                                  ).toLocaleTimeString("zh-CN")}
                                </p>
                              ) : null}
                              <div
                                className={cn(
                                  "mt-3 flex flex-wrap gap-2",
                                  needsOwnerInput && "hidden",
                                )}
                              >
                                {canPreviewOutbox(item) ? (
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
                                {canSendOutbox(item) ? (
                                  <Button
                                    size="sm"
                                    onClick={() => sendOutbox(item.id)}
                                    disabled={busy}
                                    className="gap-2"
                                  >
                                    <RemixIcon
                                      name="send_plane"
                                      size="size-4"
                                    />
                                    确认发送{" "}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="tools"
                  className={cn(sidePanelContentClass, "space-y-4 p-4")}
                >
                  {activeSideTab === "tools" ? (
                    <>
                      {toolMatrixLoading ? (
                        <p className="text-sm text-muted-foreground">
                          加载中...
                        </p>
                      ) : !toolMatrix ? (
                        <p className="text-sm text-muted-foreground">
                          请选择一个车间后查看工具矩阵。{" "}
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <div className="rounded-md border border-border p-2">
                              <div className="text-muted-foreground">可用</div>
                              <div className="mt-1 text-lg font-semibold text-foreground">
                                {toolMatrix.counts.allow}
                              </div>
                            </div>
                            <div className="rounded-md border border-border p-2">
                              <div className="text-muted-foreground">
                                霢确认
                              </div>
                              <div className="mt-1 text-lg font-semibold text-foreground">
                                {toolMatrix.counts.requireApproval}
                              </div>
                            </div>
                            <div className="rounded-md border border-border p-2">
                              <div className="text-muted-foreground">禁止</div>
                              <div className="mt-1 text-lg font-semibold text-foreground">
                                {toolMatrix.counts.deny}
                              </div>
                            </div>
                            <div className="rounded-md border border-border p-2">
                              <div className="text-muted-foreground">未开</div>
                              <div className="mt-1 text-lg font-semibold text-foreground">
                                {toolMatrix.counts.disabled +
                                  toolMatrix.counts.unknown}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {toolMatrix.tools.map((tool) => (
                              <div
                                key={tool.id}
                                className="rounded-lg border border-border p-3 [contain-intrinsic-size:0_160px] [content-visibility:auto]"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="truncate text-sm font-medium text-foreground">
                                        {tool.displayName}
                                      </h4>
                                      <Badge variant="secondary">
                                        {toolSourceLabel(tool.source)}
                                      </Badge>
                                      <Badge variant="outline">
                                        {toolRiskLabel(tool.risk)}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                      {tool.description}
                                    </p>
                                  </div>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-md border px-2 py-1 text-xs",
                                      toolAvailabilityClass(tool.availability),
                                    )}
                                  >
                                    {toolAvailabilityLabel(tool.availability)}
                                  </span>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {tool.capabilities.map((capability) => (
                                    <span
                                      key={capability}
                                      className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                                    >
                                      {toolCapabilityLabel(capability)}
                                    </span>
                                  ))}
                                </div>

                                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                  {tool.decisionReason}
                                </p>

                                {tool.confirmation ? (
                                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                                    <div className="font-medium">
                                      确认入口：{tool.confirmation.label}
                                    </div>
                                    <div className="mt-1">
                                      {tool.confirmation.description}
                                    </div>
                                  </div>
                                ) : null}

                                {tool.effectivePolicy ? (
                                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                    策略{" "}
                                    {Object.entries(tool.effectivePolicy)
                                      .map(
                                        ([key, value]) =>
                                          `${key}=${String(value)}`,
                                      )
                                      .join(" / ")}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="review"
                  className={cn(sidePanelContentClass, "space-y-3 p-4")}
                >
                  {activeSideTab === "review" ? (
                    <>
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-medium text-foreground">
                              智能体操作审核
                            </h4>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              会改变系统状态的动作先放在这里，例如调整自选股、后续的模拟委托和配置变更。
                            </p>
                          </div>
                          <Badge variant="secondary">{reviewItemCount}</Badge>
                        </div>
                      </div>

                      {douyinDraftsLoading ? (
                        <p className="text-sm text-muted-foreground">
                          视频草稿审核加载中...
                        </p>
                      ) : null}

                      {reviewItemCount === 0 ? (
                        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
                          暂无待审核操作。智能体提出需要人工确认的系统变更后，会出现在这里。
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {reviewAgentChangeProposals.map((event) => (
                            <AgentChangeProposalCard
                              key={event.id}
                              event={event}
                              actionId={agentChangeActionId}
                              currentWorkVersion={
                                workModel?.manifest.version ?? null
                              }
                              onResolve={resolveAgentChangeProposal}
                              onRefresh={() => {
                                if (selectedId) {
                                  refreshDetail(selectedId).catch((err) =>
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : String(err),
                                    ),
                                  );
                                }
                              }}
                            />
                          ))}
                          {reviewVideoDrafts.map((draft) => (
                            <VideoReviewCard
                              key={draft.id}
                              draft={draft}
                              actionId={videoReviewActionId}
                              onResolve={resolveVideoReview}
                            />
                          ))}
                          {reviewWatchlistProposals.map((event) => (
                            <div
                              key={event.id}
                              className="rounded-lg border border-border bg-background p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">
                                      自选股调整
                                    </Badge>
                                    <h4 className="truncate text-sm font-medium text-foreground">
                                      {event.title}
                                    </h4>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatDateTime(event.createdAt)}
                                  </p>
                                </div>
                              </div>
                              <WatchlistProposalEventCard
                                event={event}
                                resolution={undefined}
                                actionId={watchlistProposalActionId}
                                onResolve={resolveWatchlistProposal}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="evolution"
                  className={cn(sidePanelContentClass, "p-4")}
                >
                  {activeSideTab === "evolution" && selectedId ? (
                    <HarnessEvolutionPanel workshopId={selectedId} />
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="boundary"
                  className={cn(sidePanelContentClass, "space-y-3 p-4")}
                >
                  {activeSideTab === "boundary" ? (
                    <>
                      {!boundaryForm ? (
                        <p className="text-sm text-muted-foreground">
                          请选择一个车间后修改边界。
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label
                              htmlFor="workshop-boundary-mode"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              工作模式
                            </label>
                            <Select
                              value={boundaryForm.mode}
                              onValueChange={(value) => {
                                const mode = value as WorkshopBoundaryMode;
                                const defaults = policyForMode(mode);
                                updateBoundaryForm({
                                  mode,
                                  externalMessages: defaults.externalMessages,
                                  allowWechatPreview:
                                    defaults.allowWechatPreview,
                                });
                              }}
                            >
                              <SelectTrigger id="workshop-boundary-mode">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="observe">
                                  只观察，不生成草稿
                                </SelectItem>
                                <SelectItem value="draft">
                                  只生成草稿
                                </SelectItem>
                                <SelectItem value="auto">
                                  白名单内自动执行
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="workshop-boundary-external-messages"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              外部消息
                            </label>
                            <Select
                              value={boundaryForm.externalMessages}
                              onValueChange={(value) => {
                                const externalMessages =
                                  value as WorkshopExternalMessagePolicy;
                                updateBoundaryForm({
                                  externalMessages,
                                  allowWechatPreview:
                                    externalMessages !== "blocked",
                                });
                              }}
                            >
                              <SelectTrigger id="workshop-boundary-external-messages">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="blocked">
                                  禁止外部消息
                                </SelectItem>
                                <SelectItem value="draft">
                                  只生成待发草稿
                                </SelectItem>
                                <SelectItem value="auto">
                                  允许自动外发
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-3 rounded-lg border border-border p-3">
                            <label
                              htmlFor="workshop-boundary-wechat-preview"
                              className="flex items-center justify-between gap-3 text-sm text-foreground"
                            >
                              <span>允许生成微信预览</span>
                              <Switch
                                id="workshop-boundary-wechat-preview"
                                checked={boundaryForm.allowWechatPreview}
                                onCheckedChange={(checked) =>
                                  updateBoundaryForm({
                                    allowWechatPreview: checked,
                                  })
                                }
                              />
                            </label>
                            <label
                              htmlFor="workshop-boundary-require-sources"
                              className="flex items-center justify-between gap-3 text-sm text-foreground"
                            >
                              <span>待发送草稿必须关联来</span>
                              <Switch
                                id="workshop-boundary-require-sources"
                                checked={boundaryForm.requireSourcesForOutbox}
                                onCheckedChange={(checked) =>
                                  updateBoundaryForm({
                                    requireSourcesForOutbox: checked,
                                  })
                                }
                              />
                            </label>
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="workshop-boundary-allowed-recipients"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              微信收件人白名单
                            </label>
                            <Textarea
                              id="workshop-boundary-allowed-recipients"
                              value={recipientText(boundaryForm)}
                              onChange={(event) =>
                                updateBoundaryForm({
                                  allowedRecipients: parseRecipientList(
                                    event.target.value,
                                  ),
                                })
                              }
                              placeholder="每行一个，例如：文件传输助手"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <label
                              htmlFor="workshop-boundary-max-message-length"
                              className="space-y-2"
                            >
                              <span className="text-xs font-medium text-muted-foreground">
                                最大字数{" "}
                              </span>
                              <Input
                                id="workshop-boundary-max-message-length"
                                type="number"
                                min={1}
                                max={10000}
                                value={boundaryForm.maxMessageLength}
                                onChange={(event) =>
                                  updateBoundaryForm({
                                    maxMessageLength: Number(
                                      event.target.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label
                              htmlFor="workshop-boundary-min-confidence-draft"
                              className="space-y-2"
                            >
                              <span className="text-xs font-medium text-muted-foreground">
                                草稿阈值{" "}
                              </span>
                              <Input
                                id="workshop-boundary-min-confidence-draft"
                                type="number"
                                min={0}
                                max={100}
                                value={boundaryForm.minConfidenceToDraft}
                                onChange={(event) =>
                                  updateBoundaryForm({
                                    minConfidenceToDraft: Number(
                                      event.target.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label
                              htmlFor="workshop-boundary-min-confidence-send"
                              className="space-y-2"
                            >
                              <span className="text-xs font-medium text-muted-foreground">
                                发送阈值{" "}
                              </span>
                              <Input
                                id="workshop-boundary-min-confidence-send"
                                type="number"
                                min={0}
                                max={100}
                                value={boundaryForm.minConfidenceToSend}
                                onChange={(event) =>
                                  updateBoundaryForm({
                                    minConfidenceToSend: Number(
                                      event.target.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="workshop-boundary-custom-instructions"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              自定义边界说明{" "}
                            </label>
                            <Textarea
                              id="workshop-boundary-custom-instructions"
                              value={boundaryForm.customInstructions}
                              onChange={(event) =>
                                updateBoundaryForm({
                                  customInstructions: event.target.value,
                                })
                              }
                              placeholder="例如：只在出现重大风险、财报异动或我点名的公司时提醒。"
                            />
                          </div>

                          {heartbeatForm ? (
                            <div className="space-y-3 rounded-lg border border-border p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-medium text-foreground">
                                    心跳唤醒
                                  </h3>
                                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                    {detail?.heartbeat?.nextWakeupAt
                                      ? `下次唤醒：${new Date(
                                          detail.heartbeat.nextWakeupAt,
                                        ).toLocaleString("zh-CN")}`
                                      : "暂无已安排的下次唤醒"}
                                  </p>
                                </div>
                                <Badge variant="secondary">
                                  {detail?.heartbeat?.schedulerStatus ?? "idle"}
                                </Badge>
                              </div>

                              {detail?.heartbeat?.schedulerError ? (
                                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
                                  {detail.heartbeat.schedulerError}
                                </div>
                              ) : null}

                              <div className="grid gap-3">
                                <label
                                  htmlFor="workshop-heartbeat-enabled"
                                  className="flex items-center justify-between gap-3 text-sm text-foreground"
                                >
                                  <span>启用心跳</span>
                                  <Switch
                                    id="workshop-heartbeat-enabled"
                                    checked={heartbeatForm.enabled}
                                    onCheckedChange={(checked) =>
                                      updateHeartbeatForm({ enabled: checked })
                                    }
                                  />
                                </label>
                                <label
                                  htmlFor="workshop-heartbeat-agent-suggested"
                                  className="flex items-center justify-between gap-3 text-sm text-foreground"
                                >
                                  <span>接受智能体建议唤</span>
                                  <Switch
                                    id="workshop-heartbeat-agent-suggested"
                                    checked={
                                      heartbeatForm.allowAgentSuggestedWakeup
                                    }
                                    onCheckedChange={(checked) =>
                                      updateHeartbeatForm({
                                        allowAgentSuggestedWakeup: checked,
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <label
                                  htmlFor="workshop-heartbeat-min-interval"
                                  className="space-y-2"
                                >
                                  <span className="text-xs font-medium text-muted-foreground">
                                    最小间隔{" "}
                                  </span>
                                  <Input
                                    id="workshop-heartbeat-min-interval"
                                    type="number"
                                    min={1}
                                    value={heartbeatForm.minIntervalMinutes}
                                    onChange={(event) =>
                                      updateHeartbeatForm({
                                        minIntervalMinutes: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label
                                  htmlFor="workshop-heartbeat-default-delay"
                                  className="space-y-2"
                                >
                                  <span className="text-xs font-medium text-muted-foreground">
                                    默认延迟
                                  </span>
                                  <Input
                                    id="workshop-heartbeat-default-delay"
                                    type="number"
                                    min={1}
                                    value={heartbeatForm.defaultDelayMinutes}
                                    onChange={(event) =>
                                      updateHeartbeatForm({
                                        defaultDelayMinutes: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label
                                  htmlFor="workshop-heartbeat-max-interval"
                                  className="space-y-2"
                                >
                                  <span className="text-xs font-medium text-muted-foreground">
                                    最大间隔{" "}
                                  </span>
                                  <Input
                                    id="workshop-heartbeat-max-interval"
                                    type="number"
                                    min={1}
                                    value={heartbeatForm.maxIntervalMinutes}
                                    onChange={(event) =>
                                      updateHeartbeatForm({
                                        maxIntervalMinutes: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <label
                                  htmlFor="workshop-heartbeat-grace"
                                  className="space-y-2"
                                >
                                  <span className="text-xs font-medium text-muted-foreground">
                                    错过宽限
                                  </span>
                                  <Input
                                    id="workshop-heartbeat-grace"
                                    type="number"
                                    min={0}
                                    value={heartbeatForm.missedRunGraceMinutes}
                                    onChange={(event) =>
                                      updateHeartbeatForm({
                                        missedRunGraceMinutes: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label
                                  htmlFor="workshop-heartbeat-lease"
                                  className="space-y-2"
                                >
                                  <span className="text-xs font-medium text-muted-foreground">
                                    租约分钟
                                  </span>
                                  <Input
                                    id="workshop-heartbeat-lease"
                                    type="number"
                                    min={1}
                                    value={heartbeatForm.leaseMinutes}
                                    onChange={(event) =>
                                      updateHeartbeatForm({
                                        leaseMinutes: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label
                                  htmlFor="workshop-heartbeat-max-failures"
                                  className="space-y-2"
                                >
                                  <span className="text-xs font-medium text-muted-foreground">
                                    失败上限
                                  </span>
                                  <Input
                                    id="workshop-heartbeat-max-failures"
                                    type="number"
                                    min={1}
                                    value={heartbeatForm.maxConsecutiveFailures}
                                    onChange={(event) =>
                                      updateHeartbeatForm({
                                        maxConsecutiveFailures: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              <Button
                                onClick={saveHeartbeatPolicy}
                                disabled={!selectedId || busy}
                                variant="outline"
                                className="w-full gap-2"
                              >
                                <RemixIcon name="pulse" size="size-4" />
                                保存心跳
                              </Button>
                            </div>
                          ) : null}

                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                            金融交易、下单和付款指令始终会被拦截；自动执行也只用于通过边界检查的白名单动作。
                          </div>
                          <Button
                            onClick={saveBoundaryPolicy}
                            disabled={!selectedId || busy}
                            className="w-full gap-2"
                          >
                            <RemixIcon name="save" size="size-4" />
                            保存边界
                          </Button>
                        </div>
                      )}
                    </>
                  ) : null}
                </TabsContent>
              </Tabs>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
