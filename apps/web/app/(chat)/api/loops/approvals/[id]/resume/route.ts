import { auth } from "@/app/(auth)/auth";
import { resumeLoopApprovalContinuation } from "@/lib/loops/approval-resume";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
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
			note?: string | null;
		};

		const result = await resumeLoopApprovalContinuation({
			userId: session.user.id,
			approvalRequestId: id,
			note: body.note ?? null,
		});

		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to resume loop approval continuation";
		const status = message.includes("not found")
			? 404
			: message.includes("Only approved") ||
					message.includes("Continuation is") ||
					message.includes("not pending")
				? 409
				: 500;

		console.error("[LoopApprovals] Resume error:", error);
		return NextResponse.json({ error: message }, { status });
	}
}
