import type { ScheduleConfig } from "@/lib/cron/types";
import { computeNextRun } from "@/lib/cron/scheduler";
import type { LoopJson } from "./types";

export interface LoopSchedulerStateJson extends LoopJson {
  nextScheduledRunAt?: string;
  lastScheduledRunAt?: string;
  schedulerStatus?: "idle" | "reserved" | "running" | "completed_once";
  schedulerError?: string;
}

export function isNativeScheduledTrigger(triggerConfig: LoopJson): boolean {
  return (
    triggerConfig.type === "cron" ||
    triggerConfig.type === "interval" ||
    triggerConfig.type === "once"
  );
}

export function loopTriggerToScheduleConfig(
  triggerConfig: LoopJson,
): ScheduleConfig | null {
  if (
    triggerConfig.type === "cron" &&
    typeof triggerConfig.expression === "string" &&
    triggerConfig.expression.trim()
  ) {
    return {
      type: "cron",
      expression: triggerConfig.expression,
      timezone:
        typeof triggerConfig.timezone === "string"
          ? triggerConfig.timezone
          : "UTC",
    };
  }

  if (
    triggerConfig.type === "interval" &&
    typeof triggerConfig.minutes === "number" &&
    Number.isFinite(triggerConfig.minutes) &&
    triggerConfig.minutes > 0
  ) {
    return {
      type: "interval-minutes",
      minutes: Math.floor(triggerConfig.minutes),
    };
  }

  if (
    triggerConfig.type === "once" &&
    typeof triggerConfig.at === "string" &&
    triggerConfig.at.trim()
  ) {
    return {
      type: "once",
      at: triggerConfig.at,
    };
  }

  return null;
}

export function parseScheduledRunAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeNextLoopRun(input: {
  triggerConfig: LoopJson;
  from: Date;
}): Date | null {
  const schedule = loopTriggerToScheduleConfig(input.triggerConfig);
  return schedule ? computeNextRun(schedule, input.from) : null;
}

export function getEffectiveNextLoopRun(input: {
  triggerConfig: LoopJson;
  stateJson: LoopSchedulerStateJson;
  baseline: Date;
}): Date | null {
  if (input.stateJson.schedulerStatus === "completed_once") {
    return null;
  }

  const existing = parseScheduledRunAt(input.stateJson.nextScheduledRunAt);
  if (existing) return existing;

  return computeNextLoopRun({
    triggerConfig: input.triggerConfig,
    from: input.baseline,
  });
}

export function isLoopDue(input: {
  triggerConfig: LoopJson;
  stateJson: LoopSchedulerStateJson;
  baseline: Date;
  now: Date;
}): boolean {
  const nextRun = getEffectiveNextLoopRun(input);
  return nextRun !== null && nextRun <= input.now;
}

export function reserveNextLoopRun(input: {
  triggerConfig: LoopJson;
  stateJson: LoopSchedulerStateJson;
  now: Date;
}): LoopSchedulerStateJson {
  const isOnce = input.triggerConfig.type === "once";
  const nextRun = isOnce
    ? null
    : computeNextLoopRun({
        triggerConfig: input.triggerConfig,
        from: input.now,
      });

  return {
    ...input.stateJson,
    nextScheduledRunAt: nextRun?.toISOString(),
    lastScheduledRunAt: input.now.toISOString(),
    schedulerStatus: isOnce ? "completed_once" : "reserved",
    schedulerError: undefined,
  };
}
