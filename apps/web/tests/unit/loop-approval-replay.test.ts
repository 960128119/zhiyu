import { describe, expect, it } from "vitest";
import {
  buildLoopApprovalReplayConfirmationToken,
  buildLoopApprovalReplayIdempotencyKey,
  appendApprovalReplayHistory,
  createDraftExternalReplyReplayAdapter,
  createRecordLoopAuditReplayAdapter,
  createLoopApprovalReplayPlan,
  hasApprovalReplayHistory,
  listLoopApprovalReplayAdapters,
  runLoopApprovalReplayAdapter,
  sanitizeReplayToolInput,
} from "@/lib/loops";
import type { LoopApprovalContinuation } from "@/lib/loops";

const continuation: LoopApprovalContinuation = {
  type: "tool_call",
  status: "consumed",
  approvalRequestId: "approval-1",
  loopId: "loop-1",
  loopRunId: "run-1",
  actionName: "mcp__business-tools__sendReply",
  capability: "write_external",
  toolUseID: "tool-1",
  toolInput: { body: "hello" },
  approvedBy: "user-1",
  approvedAt: "2026-06-16T00:00:00.000Z",
  resumeMode: "manual_review",
  reason: "External write",
};

describe("loop approval replay", () => {
  it("builds stable idempotency keys", () => {
    expect(buildLoopApprovalReplayIdempotencyKey(continuation)).toBe(
      "loop-approval-replay:loop-1:approval-1:tool-1:sendReply",
    );
  });

  it("blocks replay when no adapter is allowlisted", () => {
    const plan = createLoopApprovalReplayPlan({
      continuation,
      adapters: [],
      confirmationToken: buildLoopApprovalReplayConfirmationToken(continuation),
    });

    expect(plan).toMatchObject({
      status: "blocked",
      reason: "No replay adapter is allowlisted for mcp__business-tools__sendReply",
    });
  });

  it("requires explicit confirmation before external replay", () => {
    const plan = createLoopApprovalReplayPlan({
      continuation,
      adapters: [
        {
          actionName: "sendReply",
          capability: "write_external",
          riskLevel: "high",
          description: "Send a reply",
          requiresConfirmation: true,
          execute: async () => ({}),
        },
      ],
    });

    expect(plan).toMatchObject({
      status: "blocked",
      confirmationRequired: true,
      confirmationToken:
        "confirm-replay:approval-1:tool-1:sendReply",
      reason: "Replay confirmation is required for write_external",
    });
  });

  it("runs an allowlisted leaf-name adapter", async () => {
    const result = await runLoopApprovalReplayAdapter({
      continuation,
      adapters: [
        {
          actionName: "sendReply",
          capability: "write_external",
          riskLevel: "high",
          description: "Send a reply",
          requiresConfirmation: true,
          execute: async ({ idempotencyKey }) => ({
            sent: true,
            idempotencyKey,
          }),
        },
      ],
      confirmationToken: buildLoopApprovalReplayConfirmationToken(continuation),
    });

    expect(result).toMatchObject({
      status: "success",
      actionName: "mcp__business-tools__sendReply",
      adapterResult: {
        sent: true,
        idempotencyKey:
          "loop-approval-replay:loop-1:approval-1:tool-1:sendReply",
      },
    });
  });

  it("redacts sensitive values from replay audit payloads", () => {
    expect(
      sanitizeReplayToolInput({
        body: "hello",
        token: "secret-token",
        nested: {
          apiKey: "secret-key",
        },
      }),
    ).toEqual({
      body: "hello",
      token: "[redacted]",
      nested: {
        apiKey: "[redacted]",
      },
    });
  });

  it("records internal replay audits through the default low-risk adapter", async () => {
    const auditContinuation: LoopApprovalContinuation = {
      ...continuation,
      actionName: "recordLoopAudit",
      capability: "write_internal",
      toolInput: {
        note: "Approved internal audit",
        password: "do-not-store",
      },
    };

    const result = await runLoopApprovalReplayAdapter({
      continuation: auditContinuation,
      adapters: [createRecordLoopAuditReplayAdapter()],
    });

    expect(result).toMatchObject({
      status: "success",
      adapterResult: {
        type: "loop_replay_audit_record",
        actionName: "recordLoopAudit",
        sanitizedToolInput: {
          note: "Approved internal audit",
          password: "[redacted]",
        },
      },
    });
  });

  it("tracks replay idempotency history in loop state", () => {
    const stateJson = appendApprovalReplayHistory({
      stateJson: {},
      replayResult: {
        status: "success",
        approvalRequestId: "approval-1",
        actionName: "recordLoopAudit",
        idempotencyKey: "idem-1",
        outputSummary: "Recorded",
      },
      recordedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(
      hasApprovalReplayHistory({
        stateJson,
        idempotencyKey: "idem-1",
      }),
    ).toBe(true);
    expect(stateJson.approvalReplayHistory).toMatchObject([
      {
        idempotencyKey: "idem-1",
        status: "success",
        recordedAt: "2026-06-17T00:00:00.000Z",
      },
    ]);
  });

  it("lists replay adapter metadata without execute functions", () => {
    expect(
      listLoopApprovalReplayAdapters([
        createRecordLoopAuditReplayAdapter(),
        createDraftExternalReplyReplayAdapter(),
      ]),
    ).toEqual([
      {
        actionName: "recordLoopAudit",
        capability: "write_internal",
        riskLevel: "low",
        description: expect.any(String),
        requiresConfirmation: false,
      },
      {
        actionName: "draftExternalReply",
        capability: "write_external",
        riskLevel: "medium",
        description: expect.any(String),
        requiresConfirmation: true,
      },
    ]);
  });

  it("creates external reply drafts without sending", async () => {
    const draftContinuation: LoopApprovalContinuation = {
      ...continuation,
      actionName: "draftExternalReply",
      toolInput: {
        channel: "email",
        recipient: "customer@example.com",
        subject: "Follow up",
        body: "Thanks for the context.",
        apiKey: "do-not-store",
      },
    };

    const blocked = await runLoopApprovalReplayAdapter({
      continuation: draftContinuation,
      adapters: [createDraftExternalReplyReplayAdapter()],
    });
    expect(blocked).toMatchObject({
      status: "blocked",
      reason: "Replay confirmation is required for write_external",
    });

    const result = await runLoopApprovalReplayAdapter({
      continuation: draftContinuation,
      adapters: [createDraftExternalReplyReplayAdapter()],
      confirmationToken:
        buildLoopApprovalReplayConfirmationToken(draftContinuation),
    });

    expect(result).toMatchObject({
      status: "success",
      adapterResult: {
        type: "loop_external_reply_draft",
        sent: false,
        requiresFinalSendAdapter: true,
        draft: {
          channel: "email",
          recipient: "customer@example.com",
          subject: "Follow up",
          body: "Thanks for the context.",
        },
      },
    });
  });
});
