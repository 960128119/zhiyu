import { describe, expect, it } from "vitest";
import {
  evaluateExternalReplyDraftEligibility,
  listExternalReplyDraftsFromState,
  updateExternalReplyDraftInState,
} from "@/lib/loops";

const stateJson = {
  approvalReplayHistory: [
    {
      idempotencyKey: "draft-1",
      approvalRequestId: "approval-1",
      actionName: "draftExternalReply",
      status: "success",
      adapterResult: {
        type: "loop_external_reply_draft",
        idempotencyKey: "draft-1",
        approvalRequestId: "approval-1",
        loopId: "loop-1",
        sourceActionName: "draftExternalReply",
        draft: {
          channel: "email",
          recipient: "customer@example.com",
          subject: "Follow up",
          body: "Thanks",
          context: null,
        },
        sent: false,
        requiresFinalSendAdapter: true,
        recordedAt: "2026-06-17T00:00:00.000Z",
      },
    },
  ],
};

describe("loop approval drafts", () => {
  it("lists external reply drafts from replay history", () => {
    expect(listExternalReplyDraftsFromState(stateJson)).toMatchObject([
      {
        id: "draft-1",
        approvalRequestId: "approval-1",
        status: "draft",
        draft: {
          recipient: "customer@example.com",
          subject: "Follow up",
          body: "Thanks",
        },
        sent: false,
        requiresFinalSendAdapter: true,
      },
    ]);
  });

  it("updates draft fields and status in replay history", () => {
    const result = updateExternalReplyDraftInState({
      stateJson,
      draftId: "draft-1",
      updates: {
        status: "ready_to_send",
        draft: {
          body: "Updated body",
        },
      },
      updatedAt: new Date("2026-06-17T01:00:00.000Z"),
    });

    expect(result.draft).toMatchObject({
      id: "draft-1",
      status: "ready_to_send",
      draft: {
        body: "Updated body",
      },
      updatedAt: "2026-06-17T01:00:00.000Z",
    });
    expect(
      listExternalReplyDraftsFromState(result.stateJson)[0],
    ).toMatchObject({
      status: "ready_to_send",
      draft: {
        body: "Updated body",
      },
    });
  });

  it("evaluates final-send eligibility for reviewed drafts", () => {
    const draft = listExternalReplyDraftsFromState(stateJson)[0];

    expect(evaluateExternalReplyDraftEligibility(draft)).toMatchObject({
      eligible: false,
      reasons: ["Draft must be marked ready_to_send"],
    });

    const updated = updateExternalReplyDraftInState({
      stateJson,
      draftId: "draft-1",
      updates: {
        status: "ready_to_send",
      },
    }).draft;

    expect(evaluateExternalReplyDraftEligibility(updated!)).toEqual({
      eligible: true,
      reasons: [],
      finalSendIdempotencyKey: "loop-final-send:loop-1:approval-1:draft-1",
    });
  });
});
