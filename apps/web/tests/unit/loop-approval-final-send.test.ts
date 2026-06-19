import { describe, expect, it } from "vitest";
import {
  buildExternalFinalSendConfirmationToken,
  createExternalFinalSendPlan,
  listExternalFinalSendAdapters,
  listExternalReplyDraftsFromState,
  runExternalFinalSendAdapter,
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
      },
    },
  ],
};

describe("loop approval final send", () => {
  it("blocks drafts that are not eligible", () => {
    const draft = listExternalReplyDraftsFromState(stateJson)[0];

    expect(createExternalFinalSendPlan({ draft })).toMatchObject({
      status: "blocked",
      reason: "Draft must be marked ready_to_send",
      confirmationRequired: true,
    });
  });

  it("requires final confirmation for eligible drafts", () => {
    const draft = updateExternalReplyDraftInState({
      stateJson,
      draftId: "draft-1",
      updates: { status: "ready_to_send" },
    }).draft!;

    expect(buildExternalFinalSendConfirmationToken(draft)).toBe(
      "confirm-final-send:loop-1:approval-1:draft-1",
    );
    expect(createExternalFinalSendPlan({ draft })).toMatchObject({
      status: "blocked",
      reason: "Final send confirmation is required",
    });
  });

  it("blocks even confirmed drafts until a platform adapter is allowlisted", async () => {
    const draft = updateExternalReplyDraftInState({
      stateJson,
      draftId: "draft-1",
      updates: { status: "ready_to_send" },
    }).draft!;

    const result = await runExternalFinalSendAdapter({
      draft,
      confirmationToken: buildExternalFinalSendConfirmationToken(draft),
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason:
        "No final-send adapter is allowlisted with proven delivery idempotency",
      idempotencyKey: "loop-final-send:loop-1:approval-1:draft-1",
    });
  });

  it("lists final-send adapter metadata without execute functions", () => {
    expect(listExternalFinalSendAdapters()).toEqual([]);

    expect(
      listExternalFinalSendAdapters([
        {
          platform: "email",
          description: "Send an approved email reply idempotently.",
          riskLevel: "high",
          requiresConfirmation: true,
          execute: async () => ({ sent: true }),
        },
      ]),
    ).toEqual([
      {
        platform: "email",
        description: "Send an approved email reply idempotently.",
        riskLevel: "high",
        requiresConfirmation: true,
      },
    ]);
  });
});
