import { auth } from "@/app/(auth)/auth";
import { listLoopApprovalInbox } from "@/lib/loops/approval-inbox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return new Response("Unauthorized", { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const limit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
		const inbox = await listLoopApprovalInbox(session.user.id, {
			limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100,
		});

		return NextResponse.json(inbox);
	} catch (error) {
		console.error("[LoopApprovals] GET error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to list loop approvals",
			},
			{ status: 500 },
		);
	}
}
