import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { AppError } from "@openzhiyu/shared/errors";
import { generateUUID } from "@/lib/utils";
import { isTauriMode } from "@/lib/env/constants";
import { getBotsByUserId } from "./bot-queries";
import { db } from "./client";
import {
  chat,
  chatInsights,
  insight,
  insightTabs,
  integrationAccounts,
  message,
  ragDocuments,
  rssSubscriptions,
  userCategories,
  userContacts,
  userInsightSettings,
  userRoles,
  type DBInsightTab,
  type DBInsertInsightTab,
  type DBUserCategory,
  type Insight,
  type InsightSettings,
  type UserRole,
  parseInsightSettings,
  serializeInsightSettings,
} from "./schema";
import {
  deserializeJson,
  normalizeInsight,
  serializeJson,
} from "./serialization";
import type { InsightFilterDefinition } from "@/lib/insights/filter-schema";
import type { InsightTaskItem } from "../ai/subagents/insights";

function caseInsensitiveSearch(column: any, pattern: string): SQL {
  return isTauriMode() ? like(column, pattern) : ilike(column, pattern);
}

async function executeTransaction<T>(
  callback: (tx: typeof db) => Promise<T>,
): Promise<T> {
  if (isTauriMode()) {
    return await callback(db as typeof db);
  }

  return await db.transaction(callback);
}

export async function saveChatInsights({
  chatId,
  insightIds,
}: {
  chatId: string;
  insightIds: string[];
}) {
  if (!insightIds || insightIds.length === 0) return [];

  try {
    const values = insightIds.map((insightId, index) => ({
      chatId,
      insightId,
      sortOrder: index,
    }));

    return await db
      .insert(chatInsights)
      .values(values)
      .onConflictDoNothing()
      .returning();
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to save chat insights. ${error}`,
    );
  }
}

export async function getChatInsightIds({
  chatId,
}: {
  chatId: string;
}): Promise<string[]> {
  try {
    const results = await db
      .select({ insightId: chatInsights.insightId })
      .from(chatInsights)
      .where(eq(chatInsights.chatId, chatId))
      .orderBy(chatInsights.sortOrder);

    return results.map((r: { insightId: string }) => r.insightId);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getChatInsights({
  chatId,
}: {
  chatId: string;
}): Promise<Insight[]> {
  try {
    const results = await db
      .select({ insight })
      .from(chatInsights)
      .innerJoin(insight, eq(chatInsights.insightId, insight.id))
      .where(eq(chatInsights.chatId, chatId))
      .orderBy(chatInsights.sortOrder);

    return results.map((r: { insight: Insight }) =>
      isTauriMode() ? normalizeInsight(r.insight) : r.insight,
    );
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getUserInsightSettings(
  userId: string,
): Promise<InsightSettings | null> {
  try {
    const dbSettings = await db
      .select()
      .from(userInsightSettings)
      .where(eq(userInsightSettings.userId, userId))
      .limit(1);

    return dbSettings.length > 0 ? parseInsightSettings(dbSettings[0]) : null;
  } catch (error) {
    console.error("Failed to get user insight settings:", error);
    throw new AppError(
      "bad_request:database",
      `Failed to retrieve insight settings. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function updateUserInsightSettings(
  userId: string,
  settings: Partial<InsightSettings>,
) {
  try {
    const existing = await getUserInsightSettings(userId);
    const mergedSettings: InsightSettings = {
      focusPeople: [],
      focusTopics: [],
      language: "",
      refreshIntervalMinutes: 30,
      lastMessageProcessedAt: null,
      lastActiveAt: null,
      lastInsightMaintenanceRunAt: null,
      lastInsightEmbeddingDreamRunAt: null,
      activityTier: "low",
      aiSoulPrompt: null,
      identityIndustries: null,
      identityWorkDescription: null,
      userId,
      ...existing,
      ...settings,
      lastUpdated: new Date(),
    };
    const dbData = serializeInsightSettings(mergedSettings);

    if (existing) {
      return await db
        .update(userInsightSettings)
        .set({ ...dbData, lastUpdated: new Date() })
        .where(eq(userInsightSettings.userId, userId));
    }

    return await db.insert(userInsightSettings).values({
      ...dbData,
      userId,
      id: generateUUID(),
      lastUpdated: new Date(),
    });
  } catch (error) {
    console.error("Failed to update user insight settings:", error);
    throw new AppError(
      "bad_request:database",
      `Failed to update insight settings. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  return await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .orderBy(desc(userRoles.confidence), desc(userRoles.updatedAt));
}

export async function upsertUserRole(input: {
  userId: string;
  roleKey: string;
  source: string;
  confidence: number;
  evidence?: Record<string, unknown> | null;
  lastConfirmedAt?: Date | null;
}): Promise<UserRole> {
  const now = new Date();
  const [record] = await db
    .insert(userRoles)
    .values({
      id: generateUUID(),
      userId: input.userId,
      roleKey: input.roleKey,
      source: input.source,
      confidence: input.confidence,
      evidence: serializeJson(input.evidence),
      lastConfirmedAt: input.lastConfirmedAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userRoles.userId, userRoles.roleKey, userRoles.source],
      set: {
        confidence: input.confidence,
        evidence: serializeJson(input.evidence),
        lastConfirmedAt: input.lastConfirmedAt ?? now,
        updatedAt: now,
      },
    })
    .returning();

  if (!record) throw new Error("Failed to upsert user role");
  return record;
}

export async function removeUserRole(input: {
  userId: string;
  roleKey: string;
  source?: string;
}) {
  await db
    .delete(userRoles)
    .where(
      input.source
        ? and(
            eq(userRoles.userId, input.userId),
            eq(userRoles.roleKey, input.roleKey),
            eq(userRoles.source, input.source),
          )
        : and(
            eq(userRoles.userId, input.userId),
            eq(userRoles.roleKey, input.roleKey),
          ),
    );
}

export async function getUserInsightTabs(
  userId: string,
): Promise<DBInsightTab[]> {
  return await db
    .select()
    .from(insightTabs)
    .where(eq(insightTabs.userId, userId))
    .orderBy(asc(insightTabs.sortOrder), desc(insightTabs.createdAt));
}

export async function createInsightTab(input: {
  userId: string;
  name: string;
  filter: InsightFilterDefinition;
}): Promise<DBInsightTab> {
  const [tab] = await db
    .insert(insightTabs)
    .values({
      id: generateUUID(),
      userId: input.userId,
      name: input.name,
      filter: serializeJson(input.filter as any) as any,
      type: "custom",
      enabled: true,
      sortOrder: 0,
    })
    .returning();

  if (!tab) {
    throw new AppError("bad_request:database", "Failed to create insight tab");
  }

  return tab;
}

export async function updateInsightTab(input: {
  userId: string;
  tabId: string;
  payload: {
    name?: string;
    filter?: InsightFilterDefinition;
    enabled?: boolean;
  };
}): Promise<DBInsightTab | null> {
  const updateFields: Partial<DBInsertInsightTab> = { updatedAt: new Date() };

  if (input.payload.name !== undefined) updateFields.name = input.payload.name;
  if (input.payload.filter !== undefined) {
    updateFields.filter = input.payload.filter;
  }
  if (input.payload.enabled !== undefined) {
    updateFields.enabled = input.payload.enabled;
  }

  const [tab] = await db
    .update(insightTabs)
    .set(updateFields)
    .where(
      and(
        eq(insightTabs.id, input.tabId),
        eq(insightTabs.userId, input.userId),
      ),
    )
    .returning();

  return tab ?? null;
}

export async function deleteInsightTab(input: {
  userId: string;
  tabId: string;
}): Promise<{ id: string } | null> {
  const [deleted] = await db
    .delete(insightTabs)
    .where(
      and(
        eq(insightTabs.id, input.tabId),
        eq(insightTabs.userId, input.userId),
      ),
    )
    .returning({ id: insightTabs.id });

  return deleted ?? null;
}

export async function reorderInsightTabs(input: {
  userId: string;
  tabIds: string[];
}): Promise<boolean> {
  try {
    await executeTransaction(async (tx) => {
      for (let i = 0; i < input.tabIds.length; i++) {
        await tx
          .update(insightTabs)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(
            and(
              eq(insightTabs.id, input.tabIds[i]),
              eq(insightTabs.userId, input.userId),
            ),
          );
      }
    });
    return true;
  } catch (error) {
    console.error("Failed to reorder insight tabs:", error);
    throw new AppError(
      "bad_request:database",
      "Failed to reorder insight tabs",
    );
  }
}

export async function getUserCategories(
  userId: string,
): Promise<DBUserCategory[]> {
  return await db
    .select()
    .from(userCategories)
    .where(eq(userCategories.userId, userId))
    .orderBy(asc(userCategories.sortOrder), asc(userCategories.name));
}

export async function getUserCategoryByName(
  userId: string,
  name: string,
): Promise<DBUserCategory | null> {
  const [category] = await db
    .select()
    .from(userCategories)
    .where(
      and(eq(userCategories.userId, userId), eq(userCategories.name, name)),
    )
    .limit(1);
  return category ?? null;
}

export async function getUserCategoryById(
  categoryId: string,
): Promise<DBUserCategory | null> {
  const [category] = await db
    .select()
    .from(userCategories)
    .where(eq(userCategories.id, categoryId))
    .limit(1);
  return category ?? null;
}

export async function createUserCategory(
  userId: string,
  category: {
    name: string;
    description?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<DBUserCategory> {
  const existing = await getUserCategoryByName(userId, category.name);
  if (existing) {
    throw new AppError(
      "bad_request:category",
      `Category with name "${category.name}" already exists.`,
    );
  }

  const [newCategory] = await db
    .insert(userCategories)
    .values({
      id: generateUUID(),
      userId,
      name: category.name,
      description: category.description ?? null,
      isActive: category.isActive ?? true,
      sortOrder: category.sortOrder ?? 0,
    })
    .returning();

  if (!newCategory) {
    throw new AppError("offline:category", "Failed to create category");
  }

  return newCategory;
}

export async function updateUserCategory(
  categoryId: string,
  userId: string,
  updates: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<DBUserCategory> {
  if (updates.name) {
    const existing = await getUserCategoryByName(userId, updates.name);
    if (existing && existing.id !== categoryId) {
      throw new AppError(
        "bad_request:category",
        `Category with name "${updates.name}" already exists.`,
      );
    }
  }

  const category = await getUserCategoryById(categoryId);
  if (!category || category.userId !== userId) {
    throw new AppError(
      "not_found:category",
      "Category not found or access denied",
    );
  }

  const [updated] = await db
    .update(userCategories)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(userCategories.id, categoryId))
    .returning();

  if (!updated) {
    throw new AppError("offline:category", "Failed to update category");
  }

  return updated;
}

export async function deleteUserCategory(
  categoryId: string,
  userId: string,
): Promise<void> {
  const category = await getUserCategoryById(categoryId);
  if (!category || category.userId !== userId) {
    throw new AppError(
      "not_found:category",
      "Category not found or access denied",
    );
  }

  await db.delete(userCategories).where(eq(userCategories.id, categoryId));
}

export async function updateUserCategoriesSortOrder(
  userId: string,
  sortOrders: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  await executeTransaction(async (tx) => {
    for (const item of sortOrders) {
      await tx
        .update(userCategories)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(
          and(
            eq(userCategories.id, item.id),
            eq(userCategories.userId, userId),
          ),
        );
    }
  });
}

export async function searchEvents(
  userId: string,
  query: string,
  limit = 20,
): Promise<Insight[]> {
  try {
    const bots = await getBotsByUserId({
      id: userId,
      limit: null,
      startingAfter: null,
      endingBefore: null,
      onlyEnable: false,
    });

    if (bots.bots.length === 0) return [];

    const botIds = bots.bots.map((bot) => bot.id);
    const searchPattern = `%${query}%`;

    const results = await db
      .select()
      .from(insight)
      .where(
        and(
          inArray(insight.botId, botIds),
          or(
            caseInsensitiveSearch(insight.title, searchPattern),
            caseInsensitiveSearch(insight.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(insight.time))
      .limit(limit);

    if (isTauriMode()) return results.map((insight: any) => normalizeInsight(insight));
    return results;
  } catch (error) {
    console.error("Failed to search events:", error);
    throw new AppError(
      "bad_request:database",
      `Failed to search events. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function searchChats(
  userId: string,
  query: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    title: string;
    latestMessageContent: string | null;
    latestMessageTime: Date | null;
  }>
> {
  try {
    const searchPattern = `%${query}%`;

    const chats = await db
      .select({ id: chat.id, title: chat.title })
      .from(chat)
      .where(
        and(
          eq(chat.userId, userId),
          caseInsensitiveSearch(chat.title, searchPattern),
        ),
      )
      .orderBy(desc(chat.createdAt))
      .limit(limit);

    return await Promise.all(
      chats.map(async (c: { id: string; title: string | null }) => {
        const [latestMessage] = await db
          .select({ createdAt: message.createdAt, parts: message.parts })
          .from(message)
          .where(eq(message.chatId, c.id))
          .orderBy(desc(message.createdAt))
          .limit(1);

        let latestMessageContent: string | null = null;
        if (latestMessage?.parts) {
          type MessagePart = { type?: string; text?: string };
          const parts = Array.isArray(latestMessage.parts)
            ? (latestMessage.parts as MessagePart[])
            : [];
          latestMessageContent = parts
            .filter(
              (
                part,
              ): part is Required<Pick<MessagePart, "text">> & MessagePart =>
                part?.type === "text" && typeof part.text === "string",
            )
            .map((part) => part.text)
            .join("");
        }

        return {
          id: c.id,
          title: c.title,
          latestMessageContent,
          latestMessageTime: latestMessage?.createdAt ?? null,
        };
      }),
    );
  } catch (error) {
    console.error("Failed to search chats:", error);
    throw new AppError(
      "bad_request:database",
      `Failed to search chats. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function listTasksFromInsights(
  userId: string,
  limit = 5,
): Promise<
  Array<{
    id: string;
    title: string;
    context: string | null;
    insightId: string;
  }>
> {
  try {
    const bots = await getBotsByUserId({
      id: userId,
      limit: null,
      startingAfter: null,
      endingBefore: null,
      onlyEnable: false,
    });
    if (bots.bots.length === 0) return [];

    const botIds = bots.bots.map((bot) => bot.id);
    const insights = await db
      .select({
        id: insight.id,
        myTasks: insight.myTasks,
        waitingForMe: insight.waitingForMe,
        waitingForOthers: insight.waitingForOthers,
      })
      .from(insight)
      .where(inArray(insight.botId, botIds));

    const results: Array<{
      id: string;
      title: string;
      context: string | null;
      insightId: string;
    }> = [];

    for (const insightItem of insights) {
      const buckets = [
        insightItem.myTasks,
        insightItem.waitingForMe,
        insightItem.waitingForOthers,
      ] as Array<InsightTaskItem[] | null | undefined>;
      for (const tasks of buckets) {
        const parsedTasks = deserializeJson(tasks ?? []);
        if (!Array.isArray(parsedTasks)) continue;
        for (const task of parsedTasks) {
          const taskId = task.id || `${insightItem.id}|${task.title}`;
          results.push({
            id: taskId,
            title: task.title || "Untitled task",
            context: task.context ?? null,
            insightId: insightItem.id,
          });
          if (results.length >= limit) return results;
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Failed to list tasks:", error);
    throw new AppError(
      "bad_request:database",
      `Failed to list tasks. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function searchFiles(
  userId: string,
  query: string,
  limit = 20,
): Promise<Array<{ id: string; name: string; createdAt: Date }>> {
  try {
    const searchPattern = `%${query}%`;

    const documents = await db
      .select({
        id: ragDocuments.id,
        name: ragDocuments.fileName,
        uploadedAt: ragDocuments.uploadedAt,
      })
      .from(ragDocuments)
      .where(
        and(
          eq(ragDocuments.userId, userId),
          caseInsensitiveSearch(ragDocuments.fileName, searchPattern),
        ),
      )
      .orderBy(desc(ragDocuments.uploadedAt))
      .limit(limit);

    return documents.map(
      (doc: { id: string; name: string; uploadedAt: Date }) => ({
        id: doc.id,
        name: doc.name,
        createdAt: doc.uploadedAt,
      }),
    );
  } catch (error) {
    console.error("Failed to search files:", error);
    throw new AppError(
      "bad_request:database",
      `Failed to search files. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
