import { auth } from "@/app/(auth)/auth";
import { getConnectorsPageState } from "@/lib/page-state/connectors";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return new Response("Unauthorized", { status: 401 });
		}

		return NextResponse.json(await getConnectorsPageState(session.user.id));
	} catch (error) {
		console.error("[ConnectorsPageState] GET error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load connectors page state",
			},
			{ status: 500 },
		);
	}
}
