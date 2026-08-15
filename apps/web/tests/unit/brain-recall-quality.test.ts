import { describe, expect, it } from "vitest";
import { buildBrainRecallQualityReport } from "@/lib/brain";

describe("brain recall quality", () => {
  it("aggregates recall telemetry without exposing task or memory content", () => {
    const report = buildBrainRecallQualityReport({
      logs: [
        {
          id: "log-1",
          requesterType: "work",
          requesterId: "work-a",
          selectedMemoryIds: ["memory-1"],
          deniedCount: 1,
          omittedCount: 0,
          recallProfileIds: ["profile-a"],
          recallProfileIssueCount: 0,
          createdAt: "2026-08-11T00:00:00.000Z",
        },
        {
          id: "log-2",
          requesterType: "work",
          requesterId: "work-a",
          selectedMemoryIds: [],
          deniedCount: 0,
          omittedCount: 2,
          recallProfileIds: [],
          recallProfileIssueCount: 1,
          createdAt: "2026-08-11T01:00:00.000Z",
        },
      ],
      feedback: [
        {
          contextLogId: "log-1",
          workshopId: "work-a",
          outcome: "used",
          createdAt: "2026-08-11T02:00:00.000Z",
        },
        {
          contextLogId: "log-2",
          workshopId: "work-a",
          outcome: "missing",
          createdAt: "2026-08-11T03:00:00.000Z",
        },
      ],
    });

    expect(report.summary).toMatchObject({
      recallCount: 2,
      emptyRecallCount: 1,
      selectedMemoryCount: 1,
      deniedMemoryCount: 1,
      omittedMemoryCount: 2,
      profileIssueCount: 1,
      feedbackCount: 2,
    });
    expect(report.feedbackOutcomes).toMatchObject({ used: 1, missing: 1 });
    expect(report.profileUsage).toEqual([{ id: "profile-a", count: 1 }]);
    expect(report.byRequester[0]).toMatchObject({
      requesterId: "work-a",
      recallCount: 2,
      emptyRecallCount: 1,
    });
    expect(JSON.stringify(report)).not.toContain("memory-1");
  });

  it("does not treat access-policy filtering as evidence of a missing grant", () => {
    const report = buildBrainRecallQualityReport({
      logs: [
        {
          id: "log-1",
          requesterType: "work",
          requesterId: "work-a",
          selectedMemoryIds: ["selected-memory"],
          deniedCount: 348,
          omittedCount: 0,
          recallProfileIds: [],
          recallProfileIssueCount: 0,
          createdAt: "2026-08-11T00:00:00.000Z",
        },
      ],
      feedback: [],
    });

    expect(report.assessments.accessBoundary).toMatchObject({
      filteredCandidateCount: 348,
      status: "policy_enforced",
      grantGapEvidence: "insufficient",
      eligibleForGrantProposal: false,
    });
    expect(report.assessments.observability).toMatchObject({
      feedbackStatus: "unobserved",
      canAssessMissingRecall: false,
      canAssessRanking: false,
    });
  });
});
