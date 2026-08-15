import type { BrainRequesterType } from "./types";

export const BRAIN_RECALL_FEEDBACK_OUTCOMES = [
  "used",
  "irrelevant",
  "missing",
  "stale",
  "incorrect",
  "conflicting",
] as const;

export type BrainRecallFeedbackOutcome =
  (typeof BRAIN_RECALL_FEEDBACK_OUTCOMES)[number];

export type BrainRecallQualityLog = {
  id: string;
  requesterType: BrainRequesterType;
  requesterId: string | null;
  selectedMemoryIds: string[];
  deniedCount: number;
  omittedCount: number;
  recallProfileIds: string[];
  recallProfileIssueCount: number;
  createdAt: string;
};

export type BrainRecallQualityFeedback = {
  contextLogId: string | null;
  workshopId: string;
  outcome: BrainRecallFeedbackOutcome;
  createdAt: string;
};

export function isBrainRecallFeedbackOutcome(
  value: unknown,
): value is BrainRecallFeedbackOutcome {
  return BRAIN_RECALL_FEEDBACK_OUTCOMES.includes(
    value as BrainRecallFeedbackOutcome,
  );
}

export function buildBrainRecallQualityReport(input: {
  logs: BrainRecallQualityLog[];
  feedback: BrainRecallQualityFeedback[];
}) {
  const feedbackOutcomes = Object.fromEntries(
    BRAIN_RECALL_FEEDBACK_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<BrainRecallFeedbackOutcome, number>;
  const profileCounts = new Map<string, number>();
  const requesterCounts = new Map<
    string,
    {
      requesterType: BrainRequesterType;
      requesterId: string | null;
      recallCount: number;
      emptyRecallCount: number;
      deniedMemoryCount: number;
      omittedMemoryCount: number;
    }
  >();

  for (const log of input.logs) {
    for (const profileId of log.recallProfileIds) {
      profileCounts.set(profileId, (profileCounts.get(profileId) ?? 0) + 1);
    }
    const key = `${log.requesterType}:${log.requesterId ?? ""}`;
    const current = requesterCounts.get(key) ?? {
      requesterType: log.requesterType,
      requesterId: log.requesterId,
      recallCount: 0,
      emptyRecallCount: 0,
      deniedMemoryCount: 0,
      omittedMemoryCount: 0,
    };
    current.recallCount += 1;
    current.emptyRecallCount += log.selectedMemoryIds.length === 0 ? 1 : 0;
    current.deniedMemoryCount += log.deniedCount;
    current.omittedMemoryCount += log.omittedCount;
    requesterCounts.set(key, current);
  }

  for (const feedback of input.feedback) {
    feedbackOutcomes[feedback.outcome] += 1;
  }

  const recallCount = input.logs.length;
  const emptyRecallCount = input.logs.filter(
    (log) => log.selectedMemoryIds.length === 0,
  ).length;
  const deniedMemoryCount = input.logs.reduce(
    (sum, log) => sum + log.deniedCount,
    0,
  );
  const feedbackCount = input.feedback.length;

  return {
    interfaceVersion: "brain-recall-quality.v1" as const,
    summary: {
      recallCount,
      emptyRecallCount,
      emptyRecallRate: recallCount > 0 ? emptyRecallCount / recallCount : 0,
      selectedMemoryCount: input.logs.reduce(
        (sum, log) => sum + log.selectedMemoryIds.length,
        0,
      ),
      deniedMemoryCount,
      omittedMemoryCount: input.logs.reduce(
        (sum, log) => sum + log.omittedCount,
        0,
      ),
      profileIssueCount: input.logs.reduce(
        (sum, log) => sum + log.recallProfileIssueCount,
        0,
      ),
      feedbackCount,
    },
    assessments: {
      accessBoundary: {
        filteredCandidateCount: deniedMemoryCount,
        status:
          deniedMemoryCount > 0
            ? ("policy_enforced" as const)
            : ("no_filtering_observed" as const),
        grantGapEvidence: "insufficient" as const,
        eligibleForGrantProposal: false,
        interpretation:
          "Access-filtered candidates show that policy enforcement ran. This count alone does not prove that a grant is missing.",
        requiredGrantProposalEvidence: [
          "explicit missing-recall feedback tied to an intended task",
          "owner-confirmed cross-scope need",
          "a narrow proposed scope with regression cases and rollback",
        ],
      },
      observability: {
        feedbackStatus:
          feedbackCount > 0 ? ("observed" as const) : ("unobserved" as const),
        canAssessMissingRecall: feedbackOutcomes.missing > 0,
        canAssessRanking:
          feedbackOutcomes.used > 0 || feedbackOutcomes.irrelevant > 0,
        interpretation:
          feedbackCount > 0
            ? "Feedback exists, but conclusions must stay within the outcomes actually recorded."
            : "No recall feedback was recorded, so missing recall, ranking quality, freshness, and correctness are not assessable.",
      },
    },
    feedbackOutcomes,
    profileUsage: [...profileCounts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    byRequester: [...requesterCounts.values()].sort(
      (a, b) =>
        b.recallCount - a.recallCount ||
        `${a.requesterType}:${a.requesterId ?? ""}`.localeCompare(
          `${b.requesterType}:${b.requesterId ?? ""}`,
        ),
    ),
  };
}
