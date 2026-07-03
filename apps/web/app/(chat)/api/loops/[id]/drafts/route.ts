import { auth } from "@/app/(auth)/auth";
import {
	evaluateExternalReplyDraftEligibility,
	listExternalReplyDraftsFromState,
} from "@/lib/loops/approval-drafts";
import {
	buildExternalFinalSendConfirmationToken,
	createExternalFinalSendPlan,
} from "@/lib/loops/approval-final-send";
import { getLoop, getLoopState } from "@/lib/loops/service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
		const loop = await getLoop(session.user.id, id);
		if (!loop) {
			return NextResponse.json({ error: "Loop not found" }, { status: 404 });
		}

		const state = await getLoopState(loop.id);
		const drafts = listExternalReplyDraftsFromState(state?.stateJson ?? {});
		return NextResponse.json({
			drafts: drafts.map((draft) => ({
				...draft,
				eligibility: evaluateExternalReplyDraftEligibility(draft),
				finalSendPlan: createExternalFinalSendPlan({ draft }),
				finalSendConfirmationToken:
					buildExternalFinalSendConfirmationToken(draft),
			})),
		});
	} catch (error) {
		console.error("[LoopDrafts] GET error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to list loop drafts",
			},
			{ status: 500 },
		);
	}
}
