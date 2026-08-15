import { auth } from "@/app/(auth)/auth";
import {
	createLoopFromNaturalLanguage,
	draftLoopFromNaturalLanguage,
} from "@/lib/loops/natural-language";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return new Response("Unauthorized", { status: 401 });
		}

		const body = await request.json().catch(() => null);
		const intent = body?.intent;
		if (typeof intent !== "string" || !intent.trim()) {
			return NextResponse.json(
				{ error: "intent is required" },
				{ status: 400 },
			);
		}

		const input = {
			userId: session.user.id,
			intent,
			timezone: typeof body?.timezone === "string" ? body.timezone : undefined,
			externalWriteMode:
				body?.externalWriteMode === "manual_approval"
					? ("manual_approval" as const)
					: ("loop_approved" as const),
		};

		if (body?.create === true) {
			const result = await createLoopFromNaturalLanguage(input);
			return NextResponse.json(result, { status: 201 });
		}

		const draft = await draftLoopFromNaturalLanguage(input);
		return NextResponse.json({ draft });
	} catch (error) {
		console.error("[LoopsNaturalLanguage] POST error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to process natural language loop",
			},
			{ status: 400 },
		);
	}
}
