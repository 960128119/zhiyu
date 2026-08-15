import { auth } from "@/app/(auth)/auth";
import { bootstrapRuntimeForUser } from "@/lib/runtime/bootstrap";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const url = new URL(request.url);
		const cloudAuthToken = url.searchParams.get("cloudAuthToken") || undefined;

		return NextResponse.json(
			await bootstrapRuntimeForUser({
				userId: session.user.id,
				cloudAuthToken,
			}),
		);
	} catch (error) {
		console.error("[RuntimeBootstrap] GET error:", error);
		return NextResponse.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to bootstrap runtime",
			},
			{ status: 500 },
		);
	}
}
