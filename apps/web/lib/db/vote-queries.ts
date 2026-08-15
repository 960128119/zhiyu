import "server-only";

import { db } from "@/lib/db/client";
import { vote } from "@/lib/db/schema";
import { AppError } from "@openzhiyu/shared/errors";
import { and, eq } from "drizzle-orm";

export async function voteMessage({
	chatId,
	messageId,
	type,
}: {
	chatId: string;
	messageId: string;
	type: "up" | "down";
}) {
	try {
		const [existingVote] = await db
			.select()
			.from(vote)
			.where(and(eq(vote.messageId, messageId)));

		if (existingVote) {
			return await db
				.update(vote)
				.set({ isUpvoted: type === "up" })
				.where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
		}

		return await db.insert(vote).values({
			chatId,
			messageId,
			isUpvoted: type === "up",
		});
	} catch (error) {
		console.error(error);
		throw new AppError(
			"bad_request:database",
			`Failed to vote message. ${error}`,
		);
	}
}

export async function getVotesByChatId({ id }: { id: string }) {
	try {
		return await db.select().from(vote).where(eq(vote.chatId, id));
	} catch (error) {
		console.error(error);
		throw new AppError(
			"bad_request:database",
			`Failed to get votes by chat id. ${error}`,
		);
	}
}
