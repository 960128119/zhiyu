import { auth } from "@/app/(auth)/auth";
import { getLoopsPageState } from "@/lib/page-state/loops";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return new Response("Unauthorized", { status: 401 });
		}

		return NextResponse.json(await getLoopsPageState(session.user.id));
	} catch (error) {
		console.error("[LoopsPageState] GET error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load loops page state",
			},
			{ status: 500 },
		);
	}
}
