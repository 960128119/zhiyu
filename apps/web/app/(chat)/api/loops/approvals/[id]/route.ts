import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  buildLoopApprovalContinuation,
  buildLoopApprovalReplayConfirmationToken,
  getApprovalRequestContinuation,
  getLoopApprovalRequest,
  getLoopState,
  mergeLoopApprovalContinuationPayload,
  resolveLoopApprovalRequest,
  sanitizeReplayToolInput,
  upsertLoopState,
} from "@/lib/loops";
import type { LoopApprovalRequestStatus } from "@/lib/loops";

export const dynamic = "force-dynamic";

type ResolvableLoopApprovalRequestStatus = Exclude<
  LoopApprovalRequestStatus,
  "pending"
>;

const RESOLVABLE_STATUSES = new Set<ResolvableLoopApprovalRequestStatus>([
  "approved",
  "rejected",
  "superseded",
]);

function isResolvableStatus(
  status: LoopApprovalRequestStatus | undefined,
): status is ResolvableLoopApprovalRequestStatus {
  return Boolean(status && RESOLVABLE_STATUSES.has(status as never));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function replayConfirmationRequired(capability: string | null): boolean {
  return capability === "write_external" || capability === "dangerous";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const approvalRequest = await getLoopApprovalRequest(session.user.id, id);
    if (!approvalRequest) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 },
      );
    }

    const continuationPreview =
      getApprovalRequestContinuation(approvalRequest) ??
      buildLoopApprovalContinuation({
        request: approvalRequest,
        approvedBy: session.user.id,
      });

    return NextResponse.json({
      approvalRequest: {
        ...approvalRequest,
        toolInput: sanitizeReplayToolInput(approvalRequest.toolInput),
      },
      continuationPreview: {
        ...continuationPreview,
        toolInput: sanitizeReplayToolInput(continuationPreview.toolInput),
        replayConfirmationToken: replayConfirmationRequired(
          continuationPreview.capability,
        )
          ? buildLoopApprovalReplayConfirmationToken(continuationPreview)
          : null,
      },
    });
  } catch (error) {
    console.error("[LoopApprovals] GET detail error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to read loop approval",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      status?: LoopApprovalRequestStatus;
      resolutionNote?: string | null;
      actionPayload?: Record<string, unknown> | null;
    };
    const status = body.status;
    if (!isResolvableStatus(status)) {
      return NextResponse.json(
        { error: "status must be approved, rejected, or superseded" },
        { status: 400 },
      );
    }

    const existingRequest = await getLoopApprovalRequest(session.user.id, id);
    if (!existingRequest) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 },
      );
    }
    if (existingRequest.status !== "pending") {
      return NextResponse.json(
        { error: "Approval request has already been resolved" },
        { status: 409 },
      );
    }

    const continuation =
      status === "approved"
        ? buildLoopApprovalContinuation({
            request: existingRequest,
            approvedBy: session.user.id,
          })
        : null;

    const approvalRequest = await resolveLoopApprovalRequest(
      session.user.id,
      id,
      {
        status,
        resolvedBy: session.user.id,
        resolutionNote: body.resolutionNote ?? null,
        actionPayload:
          continuation === null
            ? body.actionPayload ?? undefined
            : mergeLoopApprovalContinuationPayload({
                existingPayload:
                  body.actionPayload ?? existingRequest.actionPayload,
                continuation,
              }),
      },
    );

    if (!approvalRequest) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 },
      );
    }

    if (continuation) {
      const state = await getLoopState(existingRequest.loopId);
      await upsertLoopState(existingRequest.loopId, {
        currentPhase: state?.currentPhase ?? "needs_approval",
        lastObservation: `Approval granted for ${existingRequest.actionName}`,
        nextAction: "Review or resume approved loop action",
        blockedReason: null,
        stateJson: {
          ...(state?.stateJson ?? {}),
          lastApprovedRequestId: existingRequest.id,
          pendingApprovalContinuations: [
            ...asArray(state?.stateJson?.pendingApprovalContinuations),
            continuation,
          ],
        },
      });
    }

    return NextResponse.json({ approvalRequest, continuation });
  } catch (error) {
    console.error("[LoopApprovals] PATCH error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update loop approval",
      },
      { status: 500 },
    );
  }
}
