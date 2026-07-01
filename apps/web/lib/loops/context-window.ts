import type { LoopState } from "@/lib/db/schema";
import type { LoopSpec } from "./spec";

export interface LoopContextWindowResult {
  durableState: {
    currentPhase: string;
    memorySummary: string | null;
    openQuestions: unknown[];
    lastObservation: string | null;
    nextAction: string | null;
    blockedReason: string | null;
    stateJson: Record<string, unknown>;
  };
  compacted: boolean;
  originalChars: number;
  compactedChars: number;
  maxChars: number;
  omittedStateKeys: string[];
}

const DEFAULT_LOOP_CONTEXT_MAX_CHARS = 24_000;
const MAX_OPEN_QUESTIONS = 8;
const MAX_STRING_CHARS = 2_000;
const MAX_ARRAY_ITEMS = 20;

const ESSENTIAL_STATE_KEYS = new Set([
  "loopSpec",
  "templateId",
  "lastLoopRunId",
  "lastExecutionId",
  "lastExecutionMode",
  "lastJobStatus",
  "lastVerificationPassed",
  "lastCheckerPassed",
  "lastOutcomeAction",
  "attemptsRemaining",
  "lastApprovalRequiresApproval",
  "lastApprovalDenied",
  "lastActionGuardBlocked",
  "lastActionGuardMode",
  "nextScheduledRunAt",
  "lastScheduledRunAt",
  "schedulerStatus",
  "schedulerError",
  "approvalReplayHistory",
  "pendingApprovalContinuations",
  "consumedApprovalContinuations",
]);

function parsePositiveIntEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonChars(value: unknown) {
  try {
    return JSON.stringify(value ?? {}).length;
  } catch {
    return String(value).length;
  }
}

function truncateString(value: string, maxChars = MAX_STRING_CHARS) {
  return value.length > maxChars
    ? `${value.slice(0, maxChars)}... [truncated ${value.length - maxChars} chars]`
    : value;
}

function compactValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return truncateString(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth >= 3) return "[truncated nested object]";

  if (Array.isArray(value)) {
    return value.slice(Math.max(0, value.length - MAX_ARRAY_ITEMS)).map((item) =>
      compactValue(item, depth + 1),
    );
  }

  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      compactValue(item, depth + 1),
    ]),
  );
}

function compactStateJson(input: {
  stateJson: Record<string, unknown>;
  loopSpec: LoopSpec;
  maxChars: number;
}): { stateJson: Record<string, unknown>; omittedStateKeys: string[] } {
  const compacted: Record<string, unknown> = {};
  const omittedStateKeys: string[] = [];

  for (const [key, value] of Object.entries(input.stateJson)) {
    if (ESSENTIAL_STATE_KEYS.has(key)) {
      compacted[key] = compactValue(value);
    } else {
      omittedStateKeys.push(key);
    }
  }

  if (!compacted.loopSpec) {
    compacted.loopSpec = input.loopSpec;
  }

  let remainingChars = input.maxChars - jsonChars(compacted);
  if (remainingChars > 0) {
    for (const [key, value] of Object.entries(input.stateJson)) {
      if (key in compacted) continue;
      const nextValue = compactValue(value);
      const nextChars = jsonChars({ [key]: nextValue });
      if (nextChars <= remainingChars) {
        compacted[key] = nextValue;
        remainingChars -= nextChars;
        const index = omittedStateKeys.indexOf(key);
        if (index >= 0) omittedStateKeys.splice(index, 1);
      }
    }
  }

  if (omittedStateKeys.length > 0) {
    compacted._contextCompaction = {
      omittedStateKeys,
      reason: "State exceeded Loop prompt context budget",
    };
  }

  return { stateJson: compacted, omittedStateKeys };
}

export function prepareLoopContextWindow(input: {
  state: LoopState | null;
  loopSpec: LoopSpec;
  maxChars?: number;
}): LoopContextWindowResult {
  const maxChars =
    input.maxChars ??
    parsePositiveIntEnv("LOOP_CONTEXT_MAX_CHARS", DEFAULT_LOOP_CONTEXT_MAX_CHARS);
  const rawStateJson = asRecord(input.state?.stateJson);
  const originalState = {
    currentPhase: input.state?.currentPhase ?? "idle",
    memorySummary: input.state?.memorySummary ?? null,
    openQuestions: Array.isArray(input.state?.openQuestions)
      ? input.state.openQuestions
      : [],
    lastObservation: input.state?.lastObservation ?? null,
    nextAction: input.state?.nextAction ?? null,
    blockedReason: input.state?.blockedReason ?? null,
    stateJson: rawStateJson,
  };
  const originalChars = jsonChars(originalState);

  if (originalChars <= maxChars) {
    return {
      durableState: originalState,
      compacted: false,
      originalChars,
      compactedChars: originalChars,
      maxChars,
      omittedStateKeys: [],
    };
  }

  const { stateJson, omittedStateKeys } = compactStateJson({
    stateJson: rawStateJson,
    loopSpec: input.loopSpec,
    maxChars: Math.max(1_000, maxChars - 2_000),
  });
  const durableState = {
    currentPhase: originalState.currentPhase,
    memorySummary: originalState.memorySummary
      ? truncateString(originalState.memorySummary, 4_000)
      : null,
    openQuestions: originalState.openQuestions.slice(-MAX_OPEN_QUESTIONS),
    lastObservation: originalState.lastObservation
      ? truncateString(originalState.lastObservation)
      : null,
    nextAction: originalState.nextAction
      ? truncateString(originalState.nextAction)
      : null,
    blockedReason: originalState.blockedReason
      ? truncateString(originalState.blockedReason)
      : null,
    stateJson,
  };

  return {
    durableState,
    compacted: true,
    originalChars,
    compactedChars: jsonChars(durableState),
    maxChars,
    omittedStateKeys,
  };
}
