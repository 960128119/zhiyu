import { auth } from "@/app/(auth)/auth";
import { clearAIUserContext, setAIUserContextFromRequest } from "@/lib/ai";
import { processInteractionEvents } from "@/lib/interactions/processor";
import {
  listInteractionEvents,
  recordWechatNewMessages,
} from "@/lib/interactions/service";
import {
  listInteractionSourcePolicies,
  upsertInteractionSourcePolicy,
} from "@/lib/knowledge-pipeline/source-policies";
import { appendWorkshopEvent, getWorkshop } from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";
import pLimit from "p-limit";
import { splitConversationWindows } from "@/lib/interactions/windowing";
import {
  isInteractionEventAllowedBySourcePolicy,
  processingModeForSourcePolicy,
  sourcePolicyMentionAliases,
} from "@/lib/knowledge-pipeline/source-policy-runtime";

export const dynamic = "force-dynamic";

function summarizeEvents(
  events: Array<{ conversationName: string; contentPreview: string }>,
) {
  if (events.length === 0) return "No new WeChat messages were recorded.";
  return events
    .slice(0, 8)
    .map((event) => `${event.conversationName}: ${event.contentPreview}`)
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    await setAIUserContextFromRequest({
      userId: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? session.user.displayName ?? null,
      userType: session.user.type,
      request,
      body: {
        ...body,
        cloudAuthToken: body.cloudAuthToken ?? session.cloudAuthToken,
      },
    });
    const result = await recordWechatNewMessages({
      userId: session.user.id,
      limit: Number(body.limit ?? 50),
    });
    const autoProcess = body.autoProcess !== false;
    const insertedEventIds = result.insertedEvents.map((event) => event.id);
    const policies = await listInteractionSourcePolicies({
      userId: session.user.id,
      platform: "wechat",
    });
    const enabledPolicyBySource = new Map(
      policies
        .filter((policy) => policy.enabled && policy.policy !== "ignore")
        .map((policy) => [policy.sourceId, policy]),
    );
    const pendingEvents = autoProcess
      ? await listInteractionEvents({
          userId: session.user.id,
          platform: "wechat",
          statuses: ["new", "failed"],
          limit: 500,
        })
      : [];
    const enabledPendingEvents = pendingEvents.filter((event) => {
      const policy = enabledPolicyBySource.get(
        event.conversationId ?? event.conversationName,
      );
      return Boolean(
        policy &&
          isInteractionEventAllowedBySourcePolicy({
            policy: policy.policy,
            event,
            mentionAliases: sourcePolicyMentionAliases({
              userName: session.user.name,
              displayName: session.user.displayName,
              metadata: policy.metadata,
            }),
          }),
      );
    });
    const backfillPolicies = policies.filter(
      (policy) =>
        policy.enabled &&
        policy.policy !== "ignore" &&
        policy.metadata.historyBackfillCompleted !== true,
    );
    const backfillEvents = autoProcess
      ? (
          await Promise.all(
            backfillPolicies.map((policy) =>
              listInteractionEvents({
                userId: session.user.id,
                platform: "wechat",
                conversationId: policy.sourceId,
                limit: 200,
              }),
            ),
          )
        ).flat()
      : [];
    const processableEvents = [
      ...new Map(
        [...enabledPendingEvents, ...backfillEvents].map((event) => [
          event.id,
          event,
        ]),
      ).values(),
    ].filter((event) => {
      const policy = enabledPolicyBySource.get(
        event.conversationId ?? event.conversationName,
      );
      return Boolean(
        policy &&
          isInteractionEventAllowedBySourcePolicy({
            policy: policy.policy,
            event,
            mentionAliases: sourcePolicyMentionAliases({
              userName: session.user.name,
              displayName: session.user.displayName,
              metadata: policy.metadata,
            }),
          }),
      );
    });
    const eventsBySource = new Map<string, typeof processableEvents>();
    for (const event of processableEvents) {
      const sourceId = event.conversationId ?? event.conversationName;
      const sourceEvents = eventsBySource.get(sourceId) ?? [];
      sourceEvents.push(event);
      eventsBySource.set(sourceId, sourceEvents);
    }
    const sourceLimit = pLimit(2);
    const sourceWindows = [...eventsBySource.values()].flatMap((events) =>
      splitConversationWindows(events),
    );
    const processorResults =
      autoProcess && processableEvents.length > 0
        ? await Promise.all(
            sourceWindows.map((events) =>
              sourceLimit(() =>
                processInteractionEvents({
                  userId: session.user.id,
                  eventIds: events.map((event) => event.id),
                  fallbackToSummary: body.fallbackToSummary !== false,
                  processingMode: processingModeForSourcePolicy(
                    enabledPolicyBySource.get(
                      events[0].conversationId ?? events[0].conversationName,
                    )?.policy ?? "sync",
                  ),
                }),
              ),
            ),
          )
        : [];
    const processorResult =
      processorResults.length > 0
        ? {
            mode: processorResults.some((item) => item.mode === "llm")
              ? "llm"
              : processorResults[0].mode,
            model: processorResults.find((item) => item.model)?.model,
            processedEventIds: processorResults.flatMap(
              (item) => item.processedEventIds,
            ),
            notes: processorResults.flatMap((item) => item.notes),
            tasks: processorResults.flatMap((item) => item.tasks),
            memories: processorResults.flatMap((item) => item.memories),
            error: processorResults
              .map((item) => item.error)
              .filter(Boolean)
              .join("\n"),
            sources: processorResults,
          }
        : null;
    if (autoProcess && backfillPolicies.length > 0) {
      await Promise.all(
        backfillPolicies.map((policy) =>
          upsertInteractionSourcePolicy({
            userId: policy.userId,
            platform: policy.platform,
            sourceId: policy.sourceId,
            sourceName: policy.sourceName,
            sourceType: policy.sourceType,
            policy: policy.policy,
            enabled: policy.enabled,
            priority: policy.priority,
            lastSeenAt: policy.lastSeenAt,
            metadata: {
              ...policy.metadata,
              historyBackfillCompleted: true,
            },
          }),
        ),
      );
    }

    const workshopId =
      typeof body.workshopId === "string" && body.workshopId.trim()
        ? body.workshopId.trim()
        : undefined;
    if (workshopId) {
      const workshop = await getWorkshop(session.user.id, workshopId);
      if (workshop) {
        await appendWorkshopEvent({
          workshopId,
          type: "wechat_messages_recorded",
          title: "WeChat messages recorded",
          body: summarizeEvents(result.events),
          metadata: {
            platform: "wechat",
            insertedCount: result.insertedCount,
            duplicateCount: result.duplicateCount,
            eventCount: result.eventCount,
            eventIds: result.events.map((event) => event.id),
            insertedEventIds,
          },
        });
        if (processorResult) {
          await appendWorkshopEvent({
            workshopId,
            type: "interaction_processor_completed",
            title: "Interaction processor completed",
            body: `${processorResult.mode}: ${processorResult.notes.length} note(s), ${processorResult.tasks.length} task(s), ${processorResult.memories.length} memory candidate(s).`,
            metadata: {
              mode: processorResult.mode,
              model: processorResult.model,
              processedEventIds: processorResult.processedEventIds,
              noteCount: processorResult.notes.length,
              taskCount: processorResult.tasks.length,
              memoryCount: processorResult.memories.length,
              error: processorResult.error,
            },
          });
        }
      }
    }

    return NextResponse.json({
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount,
      eventCount: result.eventCount,
      events: result.events,
      insertedEvents: result.insertedEvents,
      duplicateEvents: result.duplicateEvents,
      sourceResults: result.sourceResults ?? [],
      processor: processorResult,
    });
  } catch (error) {
    console.error("[WechatRecordNewAPI] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to record WeChat messages",
      },
      { status: 500 },
    );
  } finally {
    clearAIUserContext();
  }
}
