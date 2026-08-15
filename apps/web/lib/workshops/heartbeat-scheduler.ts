import type { Workshop, WorkshopHeartbeat } from "@/lib/db/schema";
import {
  appendWorkshopEvent,
  claimWorkshopHeartbeat,
  listWorkshopHeartbeatCandidates,
  upsertWorkshopHeartbeat,
} from "./service";
import { getHeartbeatPolicyForRow } from "./heartbeat";

const runningWorkshopHeartbeats = new Set<string>();

function isDue(date: Date | null, now: Date) {
  return Boolean(date && date.getTime() <= now.getTime());
}

function isLeaseActive(heartbeat: WorkshopHeartbeat, now: Date) {
  return Boolean(
    heartbeat.leaseUntil && heartbeat.leaseUntil.getTime() > now.getTime(),
  );
}

function hasExpiredLease(heartbeat: WorkshopHeartbeat, now: Date) {
  return Boolean(
    heartbeat.leaseUntil && heartbeat.leaseUntil.getTime() <= now.getTime(),
  );
}

function shouldSkipMissedWakeup(input: {
  heartbeat: WorkshopHeartbeat;
  now: Date;
}) {
  if (!input.heartbeat.nextWakeupAt) return false;
  const policy = getHeartbeatPolicyForRow(input.heartbeat);
  if (policy.missedRunGraceMinutes <= 0) return false;
  return (
    input.now.getTime() - input.heartbeat.nextWakeupAt.getTime() >
    policy.missedRunGraceMinutes * 60_000
  );
}

export async function listDueWorkshopHeartbeats(input: {
  userId?: string;
  now?: Date;
}) {
  if (!input.userId) return [];
  const now = input.now ?? new Date();
  const rows = await listWorkshopHeartbeatCandidates(input.userId);
  const due: Array<{
    workshop: Workshop;
    heartbeat: WorkshopHeartbeat;
    scheduledAt: Date;
  }> = [];

  for (const { workshop, heartbeat } of rows) {
    if (!heartbeat) continue;
    if (workshop.status !== "active") continue;
    if (!heartbeat.enabled) continue;
    if (heartbeat.schedulerStatus === "paused") continue;
    if (!isDue(heartbeat.nextWakeupAt, now)) continue;
    if (runningWorkshopHeartbeats.has(workshop.id)) continue;
    if (
      (heartbeat.schedulerStatus === "reserved" ||
        heartbeat.schedulerStatus === "running") &&
      isLeaseActive(heartbeat, now)
    ) {
      continue;
    }

    if (shouldSkipMissedWakeup({ heartbeat, now })) {
      await upsertWorkshopHeartbeat(workshop.id, {
        nextWakeupAt: null,
        schedulerStatus: "idle",
        schedulerError: null,
        leaseUntil: null,
        lastHeartbeatAt: now,
      });
      await appendWorkshopEvent({
        workshopId: workshop.id,
        type: "heartbeat_missed",
        title: "Missed workshop heartbeat skipped",
        body: "The scheduled heartbeat was outside the configured grace window.",
        metadata: {
          scheduledAt: heartbeat.nextWakeupAt?.toISOString(),
          now: now.toISOString(),
          policy: getHeartbeatPolicyForRow(heartbeat),
        },
      });
      continue;
    }

    const scheduledAt = heartbeat.nextWakeupAt;
    if (!scheduledAt) continue;
    due.push({
      workshop,
      heartbeat,
      scheduledAt,
    });
  }

  return due;
}

async function markHeartbeatComplete(input: {
  workshop: Workshop;
  now: Date;
}) {
  await upsertWorkshopHeartbeat(input.workshop.id, {
    lastHeartbeatAt: input.now,
    schedulerStatus: "idle",
    schedulerError: null,
    consecutiveFailures: 0,
    leaseUntil: null,
  });
}

async function markHeartbeatError(input: {
  workshop: Workshop;
  heartbeat: WorkshopHeartbeat;
  error: unknown;
  now: Date;
}) {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  const policy = getHeartbeatPolicyForRow(input.heartbeat);
  const failures = input.heartbeat.consecutiveFailures + 1;
  const disabled = failures >= policy.maxConsecutiveFailures;

  await upsertWorkshopHeartbeat(input.workshop.id, {
    enabled: disabled ? false : input.heartbeat.enabled,
    schedulerStatus: disabled ? "error" : "idle",
    schedulerError: message,
    consecutiveFailures: failures,
    leaseUntil: null,
    lastHeartbeatAt: input.now,
  });
  await appendWorkshopEvent({
    workshopId: input.workshop.id,
    type: disabled ? "heartbeat_disabled" : "heartbeat_failed",
    title: disabled
      ? "Workshop heartbeat disabled after repeated failures"
      : "Workshop heartbeat failed",
    body: message,
    metadata: {
      consecutiveFailures: failures,
      maxConsecutiveFailures: policy.maxConsecutiveFailures,
    },
  });
}

export async function runDueWorkshopHeartbeats(input: {
  userId?: string;
  now?: Date;
  awaitCompletion?: boolean;
}) {
  if (!input.userId) return { launched: 0, skipped: 0 };
  const now = input.now ?? new Date();
  const due = await listDueWorkshopHeartbeats({ userId: input.userId, now });
  let launched = 0;
  let skipped = 0;

  for (const { workshop, heartbeat, scheduledAt } of due) {
    if (runningWorkshopHeartbeats.has(workshop.id)) {
      skipped += 1;
      continue;
    }

    runningWorkshopHeartbeats.add(workshop.id);
    const policy = getHeartbeatPolicyForRow(heartbeat);
    const leaseUntil = new Date(now.getTime() + policy.leaseMinutes * 60_000);

    try {
      const claimed = await claimWorkshopHeartbeat({
        workshopId: workshop.id,
        scheduledAt,
        now,
        leaseUntil,
        schedulerError: hasExpiredLease(heartbeat, now)
          ? "Recovered expired heartbeat lease."
          : null,
      });
      if (!claimed) {
        runningWorkshopHeartbeats.delete(workshop.id);
        skipped += 1;
        continue;
      }
      await appendWorkshopEvent({
        workshopId: workshop.id,
        type: "heartbeat_reserved",
        title: "Workshop heartbeat reserved",
        body: `Scheduled wakeup: ${scheduledAt.toISOString()}`,
        metadata: {
          scheduledAt: scheduledAt.toISOString(),
          leaseUntil: leaseUntil.toISOString(),
        },
      });
      launched += 1;

      const { startWorkshopRun } = await import("./runtime");
      const runPromise = startWorkshopRun({
        userId: input.userId,
        workshopId: workshop.id,
        triggerReason: {
          type: "heartbeat",
          scheduledAt: scheduledAt.toISOString(),
          reservedAt: now.toISOString(),
        },
      });

      const tracked = runPromise
        .then(async () => {
          await markHeartbeatComplete({
            workshop,
            now: new Date(),
          });
        })
        .catch(async (error) => {
          await markHeartbeatError({
            workshop,
            heartbeat,
            error,
            now: new Date(),
          });
        })
        .finally(() => {
          runningWorkshopHeartbeats.delete(workshop.id);
        });

      if (input.awaitCompletion) {
        await tracked;
      } else {
        tracked.catch(() => undefined);
      }
    } catch (error) {
      runningWorkshopHeartbeats.delete(workshop.id);
      skipped += 1;
      await markHeartbeatError({
        workshop,
        heartbeat,
        error,
        now: new Date(),
      });
    }
  }

  return { launched, skipped };
}

export function getWorkshopHeartbeatSchedulerStatus() {
  return {
    runningWorkshopIds: [...runningWorkshopHeartbeats],
  };
}
