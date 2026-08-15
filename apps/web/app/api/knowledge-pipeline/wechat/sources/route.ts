import { auth } from "@/app/(auth)/auth";
import {
  listInteractionSourcePolicies,
  normalizeSourcePolicy,
  upsertInteractionSourcePolicy,
} from "@/lib/knowledge-pipeline/source-policies";
import { getWechatLocalSessions } from "@/lib/wechat-local/client";
import {
  listInteractionEvents,
  markInteractionEventsProcessed,
} from "@/lib/interactions/service";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function firstBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
  }
  return undefined;
}

function sessionsFromPayload(payload: unknown) {
  const record = asRecord(payload);
  return asRecordList(
    record.sessions ?? record.results ?? record.items ?? record.data ?? payload,
  )
    .map((item) => {
      const sourceId = firstString(item, [
        "username",
        "chatId",
        "conversationId",
        "chat",
      ]);
      if (!sourceId) return null;
      const timestamp = firstNumber(item, ["timestamp", "last_timestamp"]);
      return {
        sourceId,
        sourceName:
          firstString(item, ["chat", "display", "displayName", "name"]) ??
          sourceId,
        sourceType:
          firstString(item, ["chat_type", "chatType", "conversationType"]) ??
          "unknown",
        isGroup: firstBoolean(item, ["is_group", "isGroup"]) ?? false,
        unread:
          firstNumber(item, ["unread", "unread_count", "unreadCount"]) ?? 0,
        lastMessagePreview: firstString(item, ["summary", "lastMessage"]) ?? "",
        lastMessageAt: timestamp
          ? new Date(timestamp * 1000).toISOString()
          : null,
        raw: item,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) =>
      String(b.lastMessageAt ?? "").localeCompare(
        String(a.lastMessageAt ?? ""),
      ),
    );
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedLimit = Number(
      request.nextUrl.searchParams.get("limit") ?? 200,
    );
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
      : 200;
    const [sessionsPayload, policies] = await Promise.all([
      getWechatLocalSessions({ limit, withMeta: true }),
      listInteractionSourcePolicies({
        userId: session.user.id,
        platform: "wechat",
      }),
    ]);
    const policyBySource = new Map(
      policies.map((policy) => [policy.sourceId, policy]),
    );
    const sources = sessionsFromPayload(sessionsPayload).map((source) => {
      const policy = policyBySource.get(source.sourceId);
      return {
        ...source,
        policy: policy?.policy ?? "sync",
        enabled: policy?.enabled ?? false,
        priority: policy?.priority ?? 0,
        configured: Boolean(policy),
        updatedAt: policy?.updatedAt ?? null,
      };
    });
    const configuredSourceIds = new Set(
      sources.map((source) => source.sourceId),
    );
    const configuredOnly = policies
      .filter((policy) => !configuredSourceIds.has(policy.sourceId))
      .map((policy) => ({
        sourceId: policy.sourceId,
        sourceName: policy.sourceName,
        sourceType: policy.sourceType,
        isGroup: policy.sourceType === "group",
        unread: 0,
        lastMessagePreview: "",
        lastMessageAt: policy.lastSeenAt?.toISOString() ?? null,
        raw: {},
        policy: policy.policy,
        enabled: policy.enabled,
        priority: policy.priority,
        configured: true,
        updatedAt: policy.updatedAt,
      }));

    return NextResponse.json({
      sources: [...sources, ...configuredOnly],
      policies,
      meta: asRecord(sessionsPayload).meta ?? null,
    });
  } catch (error) {
    console.error("[KnowledgePipelineWechatSourcesAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load WeChat sources",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const sourceId = String(body.sourceId ?? "").trim();
    const sourceName = String(body.sourceName ?? sourceId).trim();
    if (!sourceId || !sourceName) {
      return NextResponse.json(
        { error: "sourceId and sourceName are required" },
        { status: 400 },
      );
    }
    const existingPolicies = await listInteractionSourcePolicies({
      userId: session.user.id,
      platform: "wechat",
    });
    const previous = existingPolicies.find(
      (item) => item.sourceId === sourceId,
    );
    const nextEnabled = body.enabled !== false;
    const becomingEnabled =
      nextEnabled &&
      (!previous || !previous.enabled || previous.policy === "ignore");
    const policy = await upsertInteractionSourcePolicy({
      userId: session.user.id,
      platform: "wechat",
      sourceId,
      sourceName,
      sourceType: String(body.sourceType ?? "unknown").trim() || "unknown",
      policy: normalizeSourcePolicy(body.policy),
      enabled: nextEnabled,
      priority: Number.isFinite(Number(body.priority))
        ? Number(body.priority)
        : 0,
      lastSeenAt:
        typeof body.lastMessageAt === "string" && body.lastMessageAt
          ? new Date(body.lastMessageAt)
          : null,
      metadata: {
        ...(previous?.metadata ?? {}),
        ...(body.metadata && typeof body.metadata === "object"
          ? body.metadata
          : {}),
        ...(becomingEnabled ? { historyBackfillCompleted: false } : {}),
      },
    });
    let backfillCount = 0;
    if (becomingEnabled) {
      const existingEvents = await listInteractionEvents({
        userId: session.user.id,
        platform: "wechat",
        conversationId: sourceId,
        limit: 200,
      });
      if (existingEvents.length > 0) {
        await markInteractionEventsProcessed({
          userId: session.user.id,
          ids: existingEvents.map((event) => event.id),
          status: "new",
        });
        backfillCount = existingEvents.length;
      }
    }
    return NextResponse.json({ policy, backfillCount });
  } catch (error) {
    console.error("[KnowledgePipelineWechatSourcesAPI] PATCH error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update WeChat source policy",
      },
      { status: 500 },
    );
  }
}
