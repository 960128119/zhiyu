import { auth } from "@/app/(auth)/auth";
import { createManualInsight } from "@/lib/insights/manual-create";
import { AppError } from "@openzhiyu/shared/errors";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user) {
		return new AppError("unauthorized:insight").toResponse();
	}

	return createManualInsight(request, session.user.id);
}
