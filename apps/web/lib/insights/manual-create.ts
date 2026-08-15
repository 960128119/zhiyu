import "server-only";

import { createBot, getBotsByUserId } from "@/lib/db/bot-queries";
import { extractCloudAuthToken } from "@/lib/ai/request-context";
import { AppError } from "@openzhiyu/shared/errors";
import type { NextRequest } from "next/server";

export async function createManualInsight(
	request: NextRequest,
	userId: string,
) {
	try {
		const body = await request.json();
		const {
			title,
			description,
			importance,
			urgency,
			platform,
			groups,
			categories,
			people,
			details,
			timeline,
			myTasks,
		} = body;

		if (!title || typeof title !== "string") {
			return Response.json({ error: "title is required" }, { status: 400 });
		}
		if (!description || typeof description !== "string") {
			return Response.json(
				{ error: "description is required" },
				{ status: 400 },
			);
		}

		const bots = await getBotsByUserId({
			id: userId,
			limit: null,
			startingAfter: null,
			endingBefore: null,
			onlyEnable: false,
		});

		const manualBot = bots.bots.find((bot) => bot.adapter === "manual");

		const botId = manualBot
			? manualBot.id
			: await createBot({
					name: "My Bot",
					userId,
					description: "Default bot for manual insights",
					adapter: "manual",
					adapterConfig: {},
					enable: true,
				});

		const normalizedImportance =
			importance === "Important"
				? "Important"
				: importance === "Not Important"
					? "Not Important"
					: "General";
		const normalizedUrgency =
			urgency === "As soon as possible"
				? "ASAP"
				: urgency === "Within 24 hours"
					? "24h"
					: urgency === "Not urgent"
						? "Not urgent"
						: "General";

		const normalizedTasks = myTasks?.map((task: any) => ({
			text: typeof task === "string" ? task : task.text,
			completed: typeof task === "object" ? (task.completed ?? false) : false,
			deadline:
				typeof task === "object" && task.deadline ? task.deadline : undefined,
			owner: typeof task === "object" && task.owner ? task.owner : undefined,
		}));

		const payload = {
			dedupeKey: null,
			taskLabel: normalizedTasks?.length > 0 ? "task" : "insight",
			title,
			description,
			importance: normalizedImportance,
			urgency: normalizedUrgency,
			platform: platform || "manual",
			account: null,
			groups: groups || [],
			categories: categories || [],
			people: people || [],
			time: new Date(),
			details: details
				? details.map((detail: any) => ({
						...detail,
						time: detail.time ?? Date.now(),
					}))
				: null,
			timeline: timeline
				? timeline.map((item: any) => ({ ...item, time: Date.now() }))
				: null,
			insights: null,
			trendDirection: null,
			trendConfidence: null,
			sentiment: null,
			sentimentConfidence: null,
			intent: null,
			trend: null,
			issueStatus: null,
			communityTrend: null,
			duplicateFlag: null,
			impactLevel: null,
			resolutionHint: null,
			topKeywords: [],
			topEntities: [],
			topVoices: null,
			sources: null,
			sourceConcentration: null,
			buyerSignals: [],
			stakeholders: null,
			contractStatus: null,
			signalType: null,
			confidence: null,
			scope: null,
			myTasks: normalizedTasks || null,
			waitingForMe: null,
			waitingForOthers: null,
			clarifyNeeded: null,
			learning: null,
			priority: null,
			experimentIdeas: null,
			executiveSummary: null,
			actionRequired: null,
			actionRequiredDetails: null,
			isUnreplied: null,
			followUps: null,
			nextActions: null,
		};

		const { insertInsightRecords } = await import("@/lib/db/queries");
		const insightIds = await insertInsightRecords([{ ...payload, botId }], {
			authToken: extractCloudAuthToken(request, body),
		});

		return Response.json(
			{ id: insightIds[0], message: "Insight created successfully" },
			{ status: 201 },
		);
	} catch (error) {
		console.error("[Insights] Create failed:", error);
		return new AppError("bad_request:database", String(error)).toResponse();
	}
}
