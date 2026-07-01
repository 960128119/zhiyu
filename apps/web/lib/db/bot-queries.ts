import { and, asc, desc, eq, gt, inArray, lt, sql, type SQL } from "drizzle-orm";
import { AppError } from "@openzhiyu/shared/errors";
import { generateUUID } from "@/lib/utils";
import { isTauriMode } from "@/lib/env/constants";
import type { IntegrationId } from "@/lib/integrations/client";
import { db } from "./client";
import {
  bot,
  integrationAccounts,
  integrationCatalog,
  userContacts,
  type Bot,
  type IntegrationAccount,
  type IntegrationCatalogEntry,
} from "./schema";
import {
  deserializeJson,
  normalizeContactMetaList,
  serializeJson,
} from "./serialization";

export type BotWithAccount = Bot & {
  platformAccount: IntegrationAccount | null;
};

export async function getBotById({ id }: { id: string }) {
  try {
    const [foundBot] = await db.select().from(bot).where(eq(bot.id, id));
    if (!foundBot) return undefined;
    return {
      ...foundBot,
      adapterConfig: deserializeJson(foundBot.adapterConfig),
    };
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to get bot by id: ${id}. ${error}`,
    );
  }
}

export async function getBotWithAccountById({
  id,
}: {
  id: string;
}): Promise<BotWithAccount | undefined> {
  try {
    const [found] = await db
      .select({
        bot,
        account: integrationAccounts,
      })
      .from(bot)
      .leftJoin(
        integrationAccounts,
        eq(bot.platformAccountId, integrationAccounts.id),
      )
      .where(eq(bot.id, id));

    if (!found) return undefined;

    return {
      ...found.bot,
      adapterConfig: deserializeJson(found.bot.adapterConfig),
      platformAccount: found.account
        ? {
            ...found.account,
            metadata: deserializeJson(found.account.metadata),
          }
        : null,
    } as BotWithAccount;
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to get bot with account by id: ${id}. ${error}`,
    );
  }
}

export async function getBotByAdapter({
  userId,
  adapter,
}: {
  userId: string;
  adapter: string;
}): Promise<Bot | null> {
  try {
    const [foundBot] = await db
      .select()
      .from(bot)
      .where(and(eq(bot.userId, userId), eq(bot.adapter, adapter)))
      .limit(1);
    if (!foundBot) return null;
    return {
      ...foundBot,
      adapterConfig: deserializeJson(foundBot.adapterConfig),
    };
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to get bot by adapter ${adapter}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function createBot(botData: {
  name: string;
  userId: string;
  description: string;
  adapter: string;
  adapterConfig: Record<string, unknown>;
  enable?: boolean;
  platformAccountId?: string | null;
}): Promise<string> {
  try {
    if (botData.platformAccountId) {
      const adapterConfigStr = JSON.stringify(botData.adapterConfig);
      const configMatchCondition = isTauriMode()
        ? eq(bot.adapterConfig, adapterConfigStr)
        : sql`${bot.adapterConfig}::text = ${adapterConfigStr}::text`;

      const [existingByAccount] = await db
        .select({ id: bot.id })
        .from(bot)
        .where(
          and(
            eq(bot.userId, botData.userId),
            eq(bot.platformAccountId, botData.platformAccountId),
            configMatchCondition,
          ),
        )
        .limit(1);
      if (existingByAccount) {
        return existingByAccount.id;
      }
    }

    const id = generateUUID();
    await db.insert(bot).values({
      id,
      userId: botData.userId,
      name: botData.name,
      description: botData.description,
      adapter: botData.adapter,
      adapterConfig: serializeJson(botData.adapterConfig),
      enable: botData.enable ?? false,
      platformAccountId: botData.platformAccountId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return id;
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to create bot. ${error}`,
    );
  }
}

export async function ensureRssBot(userId: string): Promise<Bot> {
  const existing = await getBotByAdapter({ userId, adapter: "rss" });
  if (existing) return existing;

  const botId = await createBot({
    userId,
    name: "RSS Feeds",
    description: "System-managed RSS aggregator",
    adapter: "rss",
    adapterConfig: {},
    enable: true,
    platformAccountId: null,
  });

  const created = await getBotById({ id: botId });
  if (!created) {
    throw new AppError(
      "bad_request:database",
      `Failed to ensure RSS bot for user ${userId}`,
    );
  }
  return created;
}

export async function botExists({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<Bot | undefined> {
  try {
    const [foundBot] = await db
      .select()
      .from(bot)
      .where(and(eq(bot.id, id), eq(bot.userId, userId)));
    if (!foundBot) return undefined;
    return {
      ...foundBot,
      adapterConfig: deserializeJson(foundBot.adapterConfig),
    };
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to get bot by id: ${id}. ${error}`,
    );
  }
}

export async function getBotsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
  onlyEnable,
}: {
  id: string;
  limit: number | null;
  startingAfter: string | null;
  endingBefore: string | null;
  onlyEnable: boolean | null;
}): Promise<{ bots: BotWithAccount[]; hasMore: boolean }> {
  try {
    limit = limit ?? 20;
    const extendedLimit = limit + 1;

    const baseQuery = (whereCondition?: SQL<unknown>) =>
      db
        .select({
          bot,
          account: integrationAccounts,
        })
        .from(bot)
        .leftJoin(
          integrationAccounts,
          eq(bot.platformAccountId, integrationAccounts.id),
        )
        .where(
          whereCondition
            ? and(whereCondition, eq(bot.userId, id))
            : eq(bot.userId, id),
        )
        .orderBy(desc(bot.createdAt))
        .limit(extendedLimit + 1);

    type Row = { bot: Bot; account: IntegrationAccount | null };
    let rawBots: Array<Row> = [];

    if (startingAfter) {
      const [selectedBot] = await db
        .select({ bot })
        .from(bot)
        .where(and(eq(bot.id, startingAfter), eq(bot.userId, id)))
        .limit(1);
      if (!selectedBot) {
        throw new AppError(
          "not_found:database",
          `Bot id ${startingAfter} not found`,
        );
      }
      rawBots = await baseQuery(gt(bot.createdAt, selectedBot.bot.createdAt));
    } else if (endingBefore) {
      const [selectedBot] = await db
        .select({ bot })
        .from(bot)
        .where(and(eq(bot.id, endingBefore), eq(bot.userId, id)))
        .limit(1);
      if (!selectedBot) {
        throw new AppError(
          "not_found:database",
          `Bot id ${endingBefore} not found`,
        );
      }
      rawBots = await baseQuery(lt(bot.createdAt, selectedBot.bot.createdAt));
    } else {
      rawBots = await baseQuery();
    }

    const filteredBots = onlyEnable
      ? rawBots.filter((item) => item.bot?.enable === true)
      : rawBots;
    const sorted = filteredBots.sort(
      (a, b) =>
        b.bot.createdAt.getTime() - a.bot.createdAt.getTime() ||
        b.bot.updatedAt.getTime() - a.bot.updatedAt.getTime(),
    );
    const hasMore = sorted.length > extendedLimit;
    const paginated = hasMore ? sorted.slice(0, extendedLimit) : sorted;

    return {
      bots: (hasMore ? paginated.slice(0, limit) : paginated).map(
        ({ bot: botItem, account }) =>
          ({
            ...botItem,
            adapterConfig: deserializeJson(
              botItem.adapterConfig as string | Record<string, unknown> | null,
            ),
            platformAccount: account ?? null,
          }) as BotWithAccount,
      ),
      hasMore,
    };
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to get all bots. ${error}`,
    );
  }
}

export async function updateBot(
  id: string,
  updateData: Partial<{
    name: string;
    description: string;
    adapter: string;
    adapterConfig: Record<string, unknown>;
    enable: boolean;
  }>,
): Promise<void> {
  try {
    const safeUpdateData = {
      ...updateData,
      updatedAt: new Date(),
    };

    if (safeUpdateData.adapterConfig) {
      (safeUpdateData as any).adapterConfig = serializeJson(
        safeUpdateData.adapterConfig,
      );
    }

    await db.update(bot).set(safeUpdateData).where(eq(bot.id, id));
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to update bot id: ${id}. ${error}`,
    );
  }
}

export async function deleteBotById({ id }: { id: string }) {
  try {
    const [botsDeleted] = await db
      .delete(bot)
      .where(eq(bot.id, id))
      .returning();
    return botsDeleted;
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to delete bot id: ${id}. ${error}`,
    );
  }
}

export async function deleteAllBotsByUserId({ id }: { id: string }) {
  try {
    const result = await db
      .delete(bot)
      .where(eq(bot.userId, id))
      .returning({ id: bot.id });

    return {
      count: result.length,
      deletedIds: result.map((item: any) => item.id),
    };
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to delete all bots for user ${id}. ${error}`,
    );
  }
}

export async function deleteBotByEmailAndAdapter({
  email,
  adapter,
  userId,
}: {
  email: string;
  adapter: string;
  userId: string;
}) {
  try {
    const emailCheckCondition = isTauriMode()
      ? sql`json_extract(${bot.adapterConfig}, '$.GOOGLE_GMAIL_ADDRESS') = ${email}`
      : sql`${bot.adapterConfig}->>'GOOGLE_GMAIL_ADDRESS' = ${email}`;

    const botsToDelete = await db
      .select({ id: bot.id })
      .from(bot)
      .where(
        and(
          eq(bot.userId, userId),
          eq(bot.adapter, adapter),
          emailCheckCondition,
        ),
      );

    if (botsToDelete.length === 0) {
      return { count: 0, deletedIds: [] };
    }

    const botIds = botsToDelete.map((item: any) => item.id);

    const result = await db
      .delete(bot)
      .where(and(eq(bot.userId, userId), inArray(bot.id, botIds)))
      .returning({ id: bot.id });

    return {
      count: result.length,
      deletedIds: result.map((item: any) => item.id),
    };
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to delete bots for email ${email}. ${error}`,
    );
  }
}

export async function deleteBotsByAdapter({
  adapter,
  userId,
}: {
  adapter: IntegrationId;
  userId: string;
}) {
  try {
    const accountIds = await db
      .select({ id: integrationAccounts.id })
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.userId, userId),
          eq(integrationAccounts.platform, adapter),
        ),
      );

    const result = await db
      .delete(bot)
      .where(and(eq(bot.userId, userId), eq(bot.adapter, adapter)))
      .returning({ id: bot.id });

    if (accountIds.length > 0) {
      await db.delete(integrationAccounts).where(
        inArray(
          integrationAccounts.id,
          accountIds.map((a: any) => a.id),
        ),
      );
    }

    return {
      count: result.length,
      deletedIds: result.map((item: any) => item.id),
    };
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to delete bots for adapter ${adapter}. ${error}`,
    );
  }
}

export async function deleteTgBotBySessionAndUserId({
  session,
  userId,
}: {
  session: string;
  userId: string;
}) {
  try {
    const condition = isTauriMode()
      ? sql`json_extract(${bot.adapterConfig}, '$.session') = ${session}`
      : sql`${bot.adapterConfig}->>'session' = ${session}`;

    await db
      .delete(bot)
      .where(and(eq(bot.userId, userId), eq(bot.adapter, "telegram"), condition));
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to delete telegram bot. ${error}`,
    );
  }
}

export async function listIntegrationCatalogEntries({
  category,
  integrationType = "feed",
}: {
  category?: string | string[] | null;
  integrationType?: string;
} = {}): Promise<IntegrationCatalogEntry[]> {
  try {
    const filters: SQL[] = [
      eq(integrationCatalog.integrationType, integrationType),
    ];

    if (Array.isArray(category) && category.length > 0) {
      filters.push(inArray(integrationCatalog.category, category));
    } else if (typeof category === "string" && category.length > 0) {
      filters.push(eq(integrationCatalog.category, category));
    }

    return await db
      .select()
      .from(integrationCatalog)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(integrationCatalog.category), asc(integrationCatalog.title));
  } catch (error) {
    throw new AppError(
      "bad_request:database",
      `Failed to load integration catalog. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function weixinBotHasValidContextToken(
  userId: string,
  botId: string,
): Promise<boolean> {
  try {
    const contacts = await db
      .select()
      .from(userContacts)
      .where(
        and(eq(userContacts.userId, userId), eq(userContacts.botId, botId)),
      );

    if (contacts.length === 0) return false;

    const normalizedContacts = normalizeContactMetaList(contacts);
    const WEIXIN_TOKEN_MAX_AGE_MS = 23 * 60 * 60 * 1000;
    for (const contact of normalizedContacts) {
      const meta = contact.contactMeta as
        | { lastContextToken?: string; lastContextTokenAt?: number }
        | null
        | undefined;
      const token = meta?.lastContextToken?.trim();
      const age = meta?.lastContextTokenAt
        ? Date.now() - meta.lastContextTokenAt
        : Number.POSITIVE_INFINITY;
      if (token && age < WEIXIN_TOKEN_MAX_AGE_MS) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(
      `[BotQueries] Failed to check WeChat bot context tokens: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
