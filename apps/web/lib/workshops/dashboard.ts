import type {
  Loop,
  LoopRun,
  LoopState,
  Workshop,
  WorkshopEvent,
  WorkshopHeartbeat,
  WorkshopMemory,
  WorkshopOutboxItem,
  WorkshopRun,
  WorkshopSource,
} from "@/lib/db/schema";
import {
  getLoopState,
  listLoopRuns,
  listLoopsForWorkshop,
} from "@/lib/loops/service";
import {
  summarizeLoop,
  type LoopDashboardStatus,
  type LoopDashboardSummary,
} from "@/lib/loops/dashboard";
import {
  countActiveDirectives,
  countWorkshopMemories,
  countWorkshopSources,
  getWorkshop,
  getWorkshopHeartbeat,
  listWorkshopEvents,
  listWorkshopOutbox,
  listWorkshops,
} from "./service";
import { summarizeWorkshopEventsForList } from "./event-summary";

export type WorkshopDashboardStatus =
  | "active"
  | "paused"
  | "archived"
  | "blocked"
  | "needs_approval"
  | "error";

export interface WorkshopDashboardCounts {
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
}

export interface WorkshopNextWork {
  source: "heartbeat" | "loop" | null;
  at: string | null;
  label: string;
}

export interface WorkshopDashboardSummary {
  workshop: Workshop;
  status: WorkshopDashboardStatus;
  counts: WorkshopDashboardCounts;
  nextWork: WorkshopNextWork;
  recentFinding: WorkshopEvent | null;
  latestEvent: WorkshopEvent | null;
  pendingOutbox: WorkshopOutboxItem[];
  pendingLoopProposals: LoopDashboardSummary[];
  blockedLoops: LoopDashboardSummary[];
}

export interface WorkshopDashboard extends WorkshopDashboardSummary {
  loops: LoopDashboardSummary[];
  recentEvents: WorkshopEvent[];
  outbox: WorkshopOutboxItem[];
  memories: WorkshopMemory[];
  sources: WorkshopSource[];
  runs: WorkshopRun[];
  heartbeat: WorkshopHeartbeat | null;
}

const PENDING_OUTBOX_STATUSES = new Set([
  "draft",
  "previewed",
  "pending",
  "needs_approval",
  "blocked",
]);

const FINDING_EVENT_TYPES = new Set([
  "source_checked",
  "memory_written",
  "loop_run_completed",
  "observation",
  "hypothesis",
  "decision",
]);

function isoTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseTime(value: Date | string | null | undefined): number {
  const iso = isoTime(value);
  if (!iso) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(iso).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function isPendingOutbox(item: WorkshopOutboxItem) {
  if (!PENDING_OUTBOX_STATUSES.has(item.status)) return false;

  const boundary =
    item.boundaryResult &&
    typeof item.boundaryResult === "object" &&
    !Array.isArray(item.boundaryResult)
      ? (item.boundaryResult as Record<string, unknown>)
      : {};
  if (boundary.source === "loop_suggested_action") return false;

  return true;
}

function isPendingLoopProposal(loop: LoopDashboardSummary) {
  const activationStatus = loop.stateJson.ownerActivationStatus;
  return (
    loop.stateJson.requiresOwnerActivation === true &&
    (activationStatus === undefined || activationStatus === "pending")
  );
}

function latestByTime<T>(
  items: T[],
  pickTime: (item: T) => Date | string | null | undefined,
): T | null {
  return (
    [...items].sort((a, b) => parseTime(pickTime(b)) - parseTime(pickTime(a)))[0] ??
    null
  );
}

function countLoopsByStatus(
  loops: LoopDashboardSummary[],
  status: LoopDashboardStatus,
) {
  return loops.filter((loop) => loop.dashboardStatus === status).length;
}

export function deriveWorkshopDashboardStatus(input: {
  workshop: Pick<Workshop, "status">;
  loops: LoopDashboardSummary[];
  pendingOutbox?: WorkshopOutboxItem[];
  pendingOutboxCount?: number;
  heartbeat: WorkshopHeartbeat | null;
}): WorkshopDashboardStatus {
  const pendingOutboxCount =
    input.pendingOutboxCount ?? input.pendingOutbox?.length ?? 0;

  if (input.workshop.status === "archived") return "archived";
  if (input.workshop.status === "paused") return "paused";

  if (
    input.heartbeat?.schedulerStatus === "error" ||
    input.heartbeat?.schedulerError ||
    input.loops.some((loop) => loop.dashboardStatus === "error")
  ) {
    return "error";
  }

  if (
    pendingOutboxCount > 0 ||
    input.loops.some((loop) => loop.dashboardStatus === "needs_approval")
  ) {
    return "needs_approval";
  }

  if (input.loops.some((loop) => loop.dashboardStatus === "blocked")) {
    return "blocked";
  }

  return "active";
}

export function deriveWorkshopNextWork(input: {
  heartbeat: WorkshopHeartbeat | null;
  loops: LoopDashboardSummary[];
}): WorkshopNextWork {
  const candidates: Array<{
    source: "heartbeat" | "loop";
    at: string;
    label: string;
  }> = [];

  const heartbeatAt = isoTime(input.heartbeat?.nextWakeupAt);
  if (heartbeatAt) {
    candidates.push({
      source: "heartbeat",
      at: heartbeatAt,
      label: "车间心跳唤醒",
    });
  }

  for (const loop of input.loops) {
    if (!loop.nextScheduledRunAt || loop.status !== "active") continue;
    candidates.push({
      source: "loop",
      at: loop.nextScheduledRunAt,
      label: loop.name,
    });
  }

  const next = candidates.sort((a, b) => parseTime(a.at) - parseTime(b.at))[0];
  return next ?? { source: null, at: null, label: "暂无已安排的下一次工作" };
}

export function buildWorkshopDashboard(input: {
  workshop: Workshop;
  loops: LoopDashboardSummary[];
  events: WorkshopEvent[];
  outbox?: WorkshopOutboxItem[];
  memories?: WorkshopMemory[];
  sources?: WorkshopSource[];
  runs?: WorkshopRun[];
  heartbeat: WorkshopHeartbeat | null;
  pendingOutboxCount?: number;
  memoriesCount?: number;
  sourcesCount?: number;
  directivesCount?: number;
}): WorkshopDashboard {
  const outbox = input.outbox ?? [];
  const memories = input.memories ?? [];
  const sources = input.sources ?? [];
  const pendingOutbox = outbox.filter(isPendingOutbox);
  const pendingOutboxCount = input.pendingOutboxCount ?? pendingOutbox.length;
  const pendingLoopProposals = input.loops.filter(isPendingLoopProposal);
  const status = deriveWorkshopDashboardStatus({
    workshop: input.workshop,
    loops: input.loops,
    pendingOutboxCount,
    heartbeat: input.heartbeat,
  });
  const blockedLoops = input.loops.filter((loop) =>
    ["blocked", "error"].includes(loop.dashboardStatus),
  );
  const recentFinding =
    [...input.events]
      .reverse()
      .find((event) => FINDING_EVENT_TYPES.has(event.type)) ?? null;

  return {
    workshop: input.workshop,
    status,
    counts: {
      loops: input.loops.length,
      activeLoops: input.loops.filter((loop) => loop.status === "active").length,
      pendingLoopProposals: pendingLoopProposals.length,
      pendingOutbox: pendingOutboxCount,
      pendingApprovals: countLoopsByStatus(input.loops, "needs_approval"),
      blockedLoops: countLoopsByStatus(input.loops, "blocked"),
      errorLoops: countLoopsByStatus(input.loops, "error"),
      sources: input.sourcesCount ?? sources.length,
      memories: input.memoriesCount ?? memories.length,
      directives: input.directivesCount ?? 0,
    },
    nextWork: deriveWorkshopNextWork({
      heartbeat: input.heartbeat,
      loops: input.loops,
    }),
    recentFinding,
    latestEvent: latestByTime(input.events, (event) => event.createdAt),
    pendingOutbox,
    pendingLoopProposals,
    blockedLoops,
    loops: input.loops,
    recentEvents: [],
    outbox: [],
    memories: [],
    sources: [],
    runs: [],
    heartbeat: null,
  };
}

async function summarizeWorkshopLoop(loop: Loop): Promise<LoopDashboardSummary> {
  const [state, runs] = await Promise.all([
    getLoopState(loop.id),
    listLoopRuns(loop.id, { limit: 1 }),
  ]);
  return summarizeLoop({
    loop,
    state: state as LoopState | null,
    latestRun: (runs[0] as LoopRun | undefined) ?? null,
  });
}

export async function getWorkshopDashboard(input: {
  userId: string;
  workshopId: string;
}): Promise<WorkshopDashboard | null> {
  const workshop = await getWorkshop(input.userId, input.workshopId);
  if (!workshop) return null;

  const [
    loops,
    events,
    outbox,
    memoriesCount,
    sourcesCount,
    heartbeat,
    directivesCount,
  ] = await Promise.all([
    listLoopsForWorkshop({
      userId: input.userId,
      workshopId: input.workshopId,
      limit: 200,
    }),
    listWorkshopEvents(input.workshopId, { limit: 30, order: "latest" }),
    listWorkshopOutbox(input.workshopId, 500),
    countWorkshopMemories(input.workshopId),
    countWorkshopSources(input.workshopId),
    getWorkshopHeartbeat(input.workshopId),
    countActiveDirectives(input.workshopId),
  ]);
  const loopSummaries = await Promise.all(loops.map(summarizeWorkshopLoop));

  return buildWorkshopDashboard({
    workshop,
    loops: loopSummaries,
    events: summarizeWorkshopEventsForList(events, { maxBodyChars: 500 }),
    outbox,
    memoriesCount,
    sourcesCount,
    heartbeat,
    directivesCount,
  });
}

export async function listWorkshopDashboard(input: {
  userId: string;
  limit?: number;
}): Promise<WorkshopDashboardSummary[]> {
  const workshops: Workshop[] = await listWorkshops(
    input.userId,
    input.limit ?? 100,
  );
  const dashboards = await Promise.all(
    workshops.map((workshop) =>
      getWorkshopDashboard({
        userId: input.userId,
        workshopId: workshop.id,
      }),
    ),
  );
  return dashboards.filter(
    (dashboard): dashboard is WorkshopDashboard => Boolean(dashboard),
  );
}
