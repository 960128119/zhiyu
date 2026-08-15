import type { Workshop, WorkshopHeartbeat } from "@/lib/db/schema";
import {
  appendWorkshopEvent,
  getWorkshopHeartbeat,
  upsertWorkshopHeartbeat,
} from "./service";
import type { WorkshopHeartbeatPolicy, WorkshopJson } from "./types";

export type NormalizedWorkshopHeartbeatPolicy = {
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  defaultDelayMinutes: number;
  allowAgentSuggestedWakeup: boolean;
  missedRunGraceMinutes: number;
  leaseMinutes: number;
  maxConsecutiveFailures: number;
};

export const DEFAULT_WORKSHOP_HEARTBEAT_POLICY: NormalizedWorkshopHeartbeatPolicy =
  {
    minIntervalMinutes: 15,
    maxIntervalMinutes: 24 * 60,
    defaultDelayMinutes: 60,
    allowAgentSuggestedWakeup: true,
    missedRunGraceMinutes: 10,
    leaseMinutes: 30,
    maxConsecutiveFailures: 3,
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeWorkshopHeartbeatPolicy(
  value: unknown,
): NormalizedWorkshopHeartbeatPolicy {
  const raw = isRecord(value) ? value : {};
  const minIntervalMinutes = numberInRange(
    raw.minIntervalMinutes,
    DEFAULT_WORKSHOP_HEARTBEAT_POLICY.minIntervalMinutes,
    1,
    7 * 24 * 60,
  );
  const maxIntervalMinutes = Math.max(
    minIntervalMinutes,
    numberInRange(
      raw.maxIntervalMinutes,
      DEFAULT_WORKSHOP_HEARTBEAT_POLICY.maxIntervalMinutes,
      minIntervalMinutes,
      30 * 24 * 60,
    ),
  );

  return {
    minIntervalMinutes,
    maxIntervalMinutes,
    defaultDelayMinutes: numberInRange(
      raw.defaultDelayMinutes,
      DEFAULT_WORKSHOP_HEARTBEAT_POLICY.defaultDelayMinutes,
      minIntervalMinutes,
      maxIntervalMinutes,
    ),
    allowAgentSuggestedWakeup: booleanValue(
      raw.allowAgentSuggestedWakeup,
      DEFAULT_WORKSHOP_HEARTBEAT_POLICY.allowAgentSuggestedWakeup,
    ),
    missedRunGraceMinutes: numberInRange(
      raw.missedRunGraceMinutes,
      DEFAULT_WORKSHOP_HEARTBEAT_POLICY.missedRunGraceMinutes,
      0,
      24 * 60,
    ),
    leaseMinutes: numberInRange(
      raw.leaseMinutes,
      DEFAULT_WORKSHOP_HEARTBEAT_POLICY.leaseMinutes,
      1,
      24 * 60,
    ),
    maxConsecutiveFailures: numberInRange(
      raw.maxConsecutiveFailures,
      DEFAULT_WORKSHOP_HEARTBEAT_POLICY.maxConsecutiveFailures,
      1,
      20,
    ),
  };
}

export function getHeartbeatPolicyForRow(
  heartbeat: WorkshopHeartbeat | null,
): NormalizedWorkshopHeartbeatPolicy {
  return normalizeWorkshopHeartbeatPolicy(heartbeat?.heartbeatPolicy);
}

function suggestedDelayMinutes(suggestion: unknown): number | null {
  if (!isRecord(suggestion)) return null;
  const delay = numberInRange(suggestion.delayMinutes, 0, 0, 30 * 24 * 60);
  return delay > 0 ? delay : null;
}

function suggestionReason(suggestion: unknown) {
  if (!isRecord(suggestion)) return "";
  return typeof suggestion.reason === "string" ? suggestion.reason.trim() : "";
}

export function computeSuggestedWakeupAt(input: {
  suggestion: unknown;
  policy: NormalizedWorkshopHeartbeatPolicy;
  now?: Date;
}) {
  const delay = suggestedDelayMinutes(input.suggestion);
  if (!delay) return null;
  const clampedDelay = Math.min(
    input.policy.maxIntervalMinutes,
    Math.max(input.policy.minIntervalMinutes, delay),
  );
  const now = input.now ?? new Date();
  return {
    delayMinutes: clampedDelay,
    requestedDelayMinutes: delay,
    wakeupAt: new Date(now.getTime() + clampedDelay * 60_000),
  };
}

export async function scheduleWorkshopWakeupFromSuggestion(input: {
  workshop: Workshop;
  runId: string;
  suggestion: WorkshopJson | Record<string, unknown> | null | undefined;
  now?: Date;
}) {
  const heartbeat = await getWorkshopHeartbeat(input.workshop.id);
  const policy = getHeartbeatPolicyForRow(heartbeat);
  const reason = suggestionReason(input.suggestion);

  if (!policy.allowAgentSuggestedWakeup) {
    await appendWorkshopEvent({
      workshopId: input.workshop.id,
      runId: input.runId,
      type: "heartbeat_skipped",
      title: "Heartbeat suggestion ignored",
      body: "The current heartbeat policy does not allow agent-suggested wakeups.",
      metadata: { suggestion: input.suggestion ?? {} },
    });
    return null;
  }

  const scheduled = computeSuggestedWakeupAt({
    suggestion: input.suggestion,
    policy,
    now: input.now,
  });
  if (!scheduled) return null;

  const next = await upsertWorkshopHeartbeat(input.workshop.id, {
    enabled: true,
    mode: "suggested",
    nextWakeupAt: scheduled.wakeupAt,
    schedulerStatus: "idle",
    schedulerError: null,
    leaseUntil: null,
    heartbeatPolicy: heartbeat?.heartbeatPolicy as WorkshopHeartbeatPolicy,
  });

  await appendWorkshopEvent({
    workshopId: input.workshop.id,
    runId: input.runId,
    type: "heartbeat_scheduled",
    title: "Scheduled next workshop heartbeat",
    body: reason || `Wake up in ${scheduled.delayMinutes} minutes.`,
    metadata: {
      nextWakeupAt: scheduled.wakeupAt.toISOString(),
      delayMinutes: scheduled.delayMinutes,
      requestedDelayMinutes: scheduled.requestedDelayMinutes,
      policy,
      heartbeat: {
        enabled: next.enabled,
        mode: next.mode,
        schedulerStatus: next.schedulerStatus,
      },
    },
  });

  return next;
}
