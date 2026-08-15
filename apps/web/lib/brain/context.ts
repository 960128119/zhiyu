import { canReadMemory } from "./policy";
import type { BrainAccessGrant, BrainMemory, BrainRequester } from "./types";

export type BrainContextPackItem = {
  id: string;
  memoryType: BrainMemory["memoryType"];
  subject: string;
  content: string;
  evidenceRefs: string[];
  score: number;
  reasons: string[];
  freshness?: {
    updatedAt: string;
    ageHours: number | null;
    bucket:
      | "fresh_24h"
      | "recent_3d"
      | "recent_7d"
      | "recent_30d"
      | "historical"
      | "unknown";
  };
  warnings?: Array<"content_reports_conflict" | "historical_for_current_state">;
};

export type BrainContextPack = {
  interfaceVersion: "brain-context.v1";
  contextLogId?: string;
  items: BrainContextPackItem[];
  denied: Array<{ id: string; reason: string }>;
  omitted: Array<{ id: string; reason: string }>;
  warnings?: Array<{
    code: "potential_state_conflict";
    memoryIds: string[];
    message: string;
    requiresCurrentObservation: true;
  }>;
};

export type BrainRecallProfile = {
  id: string;
  matchTerms: string[];
  memoryTypeBoosts: Partial<Record<BrainMemory["memoryType"], number>>;
};

const ACTIVE_STATUSES = new Set(["active", "verified", "weakened"]);
const MAX_TOKEN_COUNT = 240;
const VOLATILE_MEMORY_TYPES = new Set<BrainMemory["memoryType"]>([
  "fact",
  "plan",
  "task",
  "insight",
]);
const CURRENT_STATE_TERMS = [
  "current",
  "today",
  "latest",
  "now",
  "\u5f53\u524d",
  "\u4eca\u65e5",
  "\u6700\u65b0",
  "\u73b0\u5728",
  "\u672c\u6b21",
];
const CONFLICT_TERMS = [
  "conflict",
  "mismatch",
  "inconsistent",
  "not persisted",
  "\u51b2\u7a81",
  "\u5dee\u5f02",
  "\u4e0d\u4e00\u81f4",
  "\u672a\u6301\u4e45\u5316",
];
const CORE_RECALL_PROFILES: BrainRecallProfile[] = [
  {
    id: "planning",
    matchTerms: [
      "plan",
      "daily",
      "weekly",
      "todo",
      "\u8ba1\u5212",
      "\u4eca\u65e5",
      "\u6bcf\u65e5",
      "\u6267\u884c",
      "\u672a\u5b8c\u6210",
    ],
    memoryTypeBoosts: {
      plan: 35,
      task: 30,
    },
  },
  {
    id: "risk",
    matchTerms: [
      "risk",
      "boundary",
      "warning",
      "\u98ce\u9669",
      "\u8fb9\u754c",
      "\u9884\u8b66",
      "\u7981\u6b62",
      "\u4e0d\u5f97",
      "\u4e0d\u80fd",
    ],
    memoryTypeBoosts: {
      boundary: 45,
    },
  },
  {
    id: "review",
    matchTerms: [
      "review",
      "lesson",
      "failure",
      "failed",
      "postmortem",
      "\u590d\u76d8",
      "\u5931\u8d25",
      "\u6559\u8bad",
      "\u9519\u8bef",
    ],
    memoryTypeBoosts: {
      insight: 25,
      boundary: 15,
      plan: 10,
    },
  },
];

function tokenize(text: string) {
  const normalized = text.toLowerCase().normalize("NFKC");
  const latin = normalized.match(/[a-z0-9_.-]{2,}/g) ?? [];
  const chinese = chineseNgrams(normalized);
  return uniqueStrings([...latin, ...chinese]).slice(0, MAX_TOKEN_COUNT);
}

function chineseNgrams(text: string) {
  const chars = [...text.replace(/[^\u4e00-\u9fff]/g, "")];
  const result: string[] = [];
  for (const size of [2, 3, 4]) {
    for (let index = 0; index <= chars.length - size; index += 1) {
      result.push(chars.slice(index, index + size).join(""));
      if (result.length >= MAX_TOKEN_COUNT) return result;
    }
  }
  return result;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function textIncludesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function matchingRecallProfiles(
  taskIntent: string,
  profiles: BrainRecallProfile[],
) {
  const normalized = taskIntent.toLowerCase().normalize("NFKC");
  return profiles.filter((profile) =>
    textIncludesAny(
      normalized,
      profile.matchTerms.map((term) => term.toLowerCase().normalize("NFKC")),
    ),
  );
}

function freshnessForMemory(memory: BrainMemory, now: Date) {
  const updatedAt = new Date(memory.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    return {
      score: 0,
      freshness: {
        updatedAt: memory.updatedAt,
        ageHours: null,
        bucket: "unknown" as const,
      },
    };
  }

  const ageHours = Math.max(
    0,
    (now.getTime() - updatedAt.getTime()) / 3_600_000,
  );
  const bucket =
    ageHours <= 24
      ? ("fresh_24h" as const)
      : ageHours <= 72
        ? ("recent_3d" as const)
        : ageHours <= 168
          ? ("recent_7d" as const)
          : ageHours <= 720
            ? ("recent_30d" as const)
            : ("historical" as const);
  const score = !VOLATILE_MEMORY_TYPES.has(memory.memoryType)
    ? 0
    : bucket === "fresh_24h"
      ? 60
      : bucket === "recent_3d"
        ? 35
        : bucket === "recent_7d"
          ? 15
          : bucket === "recent_30d"
            ? 5
            : -20;

  return {
    score,
    freshness: {
      updatedAt: updatedAt.toISOString(),
      ageHours: Math.round(ageHours * 10) / 10,
      bucket,
    },
  };
}

function isCurrentStateIntent(taskIntent: string) {
  const normalized = taskIntent.toLowerCase().normalize("NFKC");
  return textIncludesAny(normalized, CURRENT_STATE_TERMS);
}

function contentReportsConflict(memory: BrainMemory) {
  const normalized = `${memory.subject} ${memory.content}`
    .toLowerCase()
    .normalize("NFKC");
  return textIncludesAny(normalized, CONFLICT_TERMS);
}

function profileScore(memory: BrainMemory, profiles: BrainRecallProfile[]) {
  let score = 0;
  const reasons: string[] = [];
  for (const profile of profiles) {
    const boost = profile.memoryTypeBoosts[memory.memoryType] ?? 0;
    if (boost === 0) continue;
    score += boost;
    reasons.push(`profile:${profile.id}`);
  }
  return { score, reasons };
}

function scoreMemory(
  memory: BrainMemory,
  taskIntent: string,
  recallProfiles: BrainRecallProfile[],
  now: Date,
) {
  const intentTokens = new Set(tokenize(taskIntent));
  const memoryTokens = new Set(
    tokenize(
      [
        memory.memoryType,
        memory.subject,
        memory.content,
        ...(memory.tags ?? []),
      ].join(" "),
    ),
  );
  const reasons: string[] = [];
  const freshness = freshnessForMemory(memory, now);
  let score = memory.confidence;
  reasons.push("confidence");
  if (memory.memoryType === "boundary") {
    score += 120;
    reasons.push("type:boundary");
  }
  if (memory.memoryType === "plan") {
    score += 60;
    reasons.push("type:plan");
  }
  if (memory.status === "verified") {
    score += 30;
    reasons.push("status:verified");
  }
  if (memory.status === "weakened") {
    score -= 40;
    reasons.push("status:weakened");
  }
  score += freshness.score;
  if (freshness.score !== 0) {
    reasons.push(`freshness:${freshness.freshness.bucket}`);
  }
  const profiles = matchingRecallProfiles(taskIntent, recallProfiles);
  const profile = profileScore(memory, profiles);
  score += profile.score;
  reasons.push(...profile.reasons);
  let matchedTokens = 0;
  for (const token of intentTokens) {
    if (memoryTokens.has(token)) {
      matchedTokens += 1;
      score += 15;
    }
  }
  if (matchedTokens > 0) {
    reasons.push(`token_match:${matchedTokens}`);
  }
  return {
    score,
    reasons: uniqueStrings(reasons),
    freshness: freshness.freshness,
  };
}

export function buildBrainContextPack(input: {
  memories: BrainMemory[];
  requester: BrainRequester;
  taskIntent: string;
  grants?: BrainAccessGrant[];
  accessMode?: "strict" | "owner_override";
  includeCandidates?: boolean;
  now?: Date;
  maxItems?: number;
  recallProfiles?: BrainRecallProfile[];
}): BrainContextPack {
  const {
    memories,
    requester,
    taskIntent,
    grants = [],
    accessMode = "strict",
    includeCandidates = false,
    now = new Date(),
    maxItems = 12,
    recallProfiles = [],
  } = input;
  const activeRecallProfiles = [...CORE_RECALL_PROFILES, ...recallProfiles];

  const denied: BrainContextPack["denied"] = [];
  const omitted: BrainContextPack["omitted"] = [];
  const scored: BrainContextPackItem[] = [];

  for (const memory of memories) {
    const access = canReadMemory({
      memory,
      requester,
      grants,
      accessMode,
      now,
    });
    if (!access.allowed) {
      denied.push({ id: memory.id, reason: access.reason });
      continue;
    }

    if (memory.status === "candidate" && !includeCandidates) {
      omitted.push({ id: memory.id, reason: "candidate_requires_review" });
      continue;
    }
    if (memory.status === "superseded" || memory.status === "deleted") {
      omitted.push({ id: memory.id, reason: memory.status });
      continue;
    }
    if (!ACTIVE_STATUSES.has(memory.status) && memory.status !== "candidate") {
      omitted.push({ id: memory.id, reason: "inactive_status" });
      continue;
    }

    const scoredMemory = scoreMemory(
      memory,
      taskIntent,
      activeRecallProfiles,
      now,
    );
    const warnings: BrainContextPackItem["warnings"] = [];
    if (contentReportsConflict(memory)) {
      warnings.push("content_reports_conflict");
    }
    if (
      isCurrentStateIntent(taskIntent) &&
      VOLATILE_MEMORY_TYPES.has(memory.memoryType) &&
      scoredMemory.freshness.ageHours !== null &&
      scoredMemory.freshness.ageHours > 24
    ) {
      warnings.push("historical_for_current_state");
    }
    scored.push({
      id: memory.id,
      memoryType: memory.memoryType,
      subject: memory.subject,
      content: memory.content,
      evidenceRefs: memory.evidenceRefs,
      score: scoredMemory.score,
      reasons: scoredMemory.reasons,
      freshness: scoredMemory.freshness,
      warnings,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const items = scored.slice(0, maxItems);
  const currentStateWarnings: NonNullable<BrainContextPack["warnings"]> = [];
  if (isCurrentStateIntent(taskIntent)) {
    const volatileItems = items.filter((item) =>
      VOLATILE_MEMORY_TYPES.has(item.memoryType),
    );
    const distinctDates = new Set(
      volatileItems
        .map((item) => item.freshness?.updatedAt.slice(0, 10))
        .filter((date): date is string => Boolean(date)),
    );
    const hasReportedConflict = volatileItems.some((item) =>
      item.warnings?.includes("content_reports_conflict"),
    );
    const hasTimeVersions =
      distinctDates.size > 1 &&
      new Set(volatileItems.map((item) => item.subject.toLowerCase())).size <
        volatileItems.length;
    if (hasReportedConflict || hasTimeVersions) {
      const reportedConflictIds = volatileItems
        .filter((item) => item.warnings?.includes("content_reports_conflict"))
        .map((item) => item.id);
      currentStateWarnings.push({
        code: "potential_state_conflict",
        memoryIds:
          reportedConflictIds.length > 0
            ? reportedConflictIds
            : volatileItems.map((item) => item.id),
        message:
          "Selected memories contain a reported mismatch or multiple time-versioned states. Treat them as historical evidence and verify the current state with an authorized observation tool before acting.",
        requiresCurrentObservation: true,
      });
    }
  }

  return {
    interfaceVersion: "brain-context.v1",
    items,
    denied,
    omitted,
    warnings: currentStateWarnings,
  };
}
