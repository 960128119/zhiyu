import { auth } from "@/app/(auth)/auth";
import { listExternalReplyDraftsFromState } from "@/lib/loops/approval-drafts";
import { runExternalFinalSendAdapter } from "@/lib/loops/approval-final-send";
import { getLoop, getLoopState, upsertLoopState } from "@/lib/loops/service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export async function POST(
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
			confirmationToken?: string | null;
		};
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

		const finalSendResult = await runExternalFinalSendAdapter({
			draft,
			confirmationToken: body.confirmationToken ?? null,
		});
		await upsertLoopState(loop.id, {
			currentPhase: finalSendResult.status === "success" ? "idle" : "blocked",
			lastObservation: finalSendResult.outputSummary,
			nextAction:
				finalSendResult.status === "success"
					? "Continue normal loop execution"
					: "Review final-send adapter configuration",
			blockedReason:
				finalSendResult.status === "success"
					? null
					: (finalSendResult.reason ?? null),
			stateJson: {
				...(state?.stateJson ?? {}),
				finalSendAttempts: [
					...asArray(state?.stateJson?.finalSendAttempts),
					{
						draftId,
						result: finalSendResult,
						attemptedAt: new Date().toISOString(),
					},
				],
				lastFinalSendResult: finalSendResult,
			},
		});

		return NextResponse.json(
			{ finalSendResult },
			{ status: finalSendResult.status === "success" ? 200 : 409 },
		);
	} catch (error) {
		console.error("[LoopDrafts] Final send error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to run final send",
			},
			{ status: 500 },
		);
	}
}
