import { auth } from "@/app/(auth)/auth";
import {
	type LoopExternalDraftStatus,
	evaluateExternalReplyDraftEligibility,
	listExternalReplyDraftsFromState,
	updateExternalReplyDraftInState,
} from "@/lib/loops/approval-drafts";
import {
	buildExternalFinalSendConfirmationToken,
	createExternalFinalSendPlan,
} from "@/lib/loops/approval-final-send";
import { getLoop, getLoopState, upsertLoopState } from "@/lib/loops/service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DRAFT_STATUSES = new Set<LoopExternalDraftStatus>([
	"draft",
	"needs_revision",
	"ready_to_send",
	"discarded",
]);

function isDraftStatus(value: unknown): value is LoopExternalDraftStatus {
	return typeof value === "string" && DRAFT_STATUSES.has(value as never);
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string; draftId: string }> },
) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return new Response("Unauthorized", { status: 401 });
		}

		const { id, draftId } = await params;
		const loop = await getLoop(session.user.id, id);
		if (!loop) {
			return NextResponse.json({ error: "Loop not found" }, { status: 404 });
		}

		const state = await getLoopState(loop.id);
		const draft =
			listExternalReplyDraftsFromState(state?.stateJson ?? {}).find(
				(item) => item.id === draftId,
			) ?? null;
		if (!draft) {
			return NextResponse.json({ error: "Draft not found" }, { status: 404 });
		}

		return NextResponse.json({
			draft: {
				...draft,
				eligibility: evaluateExternalReplyDraftEligibility(draft),
				finalSendPlan: createExternalFinalSendPlan({ draft }),
				finalSendConfirmationToken:
					buildExternalFinalSendConfirmationToken(draft),
			},
		});
	} catch (error) {
		console.error("[LoopDrafts] GET detail error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to read loop draft",
			},
			{ status: 500 },
		);
	}
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string; draftId: string }> },
) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return new Response("Unauthorized", { status: 401 });
		}

		const { id, draftId } = await params;
		const body = (await request.json().catch(() => ({}))) as {
			status?: unknown;
			draft?: Record<string, unknown>;
		};
		if (body.status !== undefined && !isDraftStatus(body.status)) {
			return NextResponse.json(
				{ error: "Invalid draft status" },
				{ status: 400 },
			);
		}

		const loop = await getLoop(session.user.id, id);
		if (!loop) {
			return NextResponse.json({ error: "Loop not found" }, { status: 404 });
		}

		const state = await getLoopState(loop.id);
		const result = updateExternalReplyDraftInState({
			stateJson: state?.stateJson ?? {},
			draftId,
			updates: {
				status: body.status,
				draft: body.draft,
			},
		});
		if (!result.draft) {
			return NextResponse.json({ error: "Draft not found" }, { status: 404 });
		}

		await upsertLoopState(loop.id, {
			currentPhase: state?.currentPhase ?? "idle",
			lastObservation: `Draft updated for ${result.draft.actionName}`,
			nextAction:
				result.draft.status === "ready_to_send"
					? "Review final send adapter eligibility"
					: "Continue draft review",
			blockedReason: null,
			stateJson: result.stateJson,
		});

		return NextResponse.json({
			draft: {
				...result.draft,
				eligibility: evaluateExternalReplyDraftEligibility(result.draft),
				finalSendPlan: createExternalFinalSendPlan({ draft: result.draft }),
				finalSendConfirmationToken: buildExternalFinalSendConfirmationToken(
					result.draft,
				),
			},
		});
	} catch (error) {
		console.error("[LoopDrafts] PATCH error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to update loop draft",
			},
			{ status: 500 },
		);
	}
}
