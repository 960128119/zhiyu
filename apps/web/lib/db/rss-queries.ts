import { and, desc, eq } from 'drizzle-orm';
import { AppError } from '@openzhiyu/shared/errors';
import { generateUUID } from '@/lib/utils';
import { db } from './client';
import {
  bot,
  integrationCatalog,
  rssSubscriptions,
  type Bot,
  type IntegrationCatalogEntry,
  type RssSubscription,
} from './schema';
import { serializeJson } from './serialization';

const rssSubscriptionSafeSelect = {
  id: rssSubscriptions.id,
  userId: rssSubscriptions.userId,
  catalogId: rssSubscriptions.catalogId,
  integrationAccountId: rssSubscriptions.integrationAccountId,
  sourceUrl: rssSubscriptions.sourceUrl,
  title: rssSubscriptions.title,
  category: rssSubscriptions.category,
  status: rssSubscriptions.status,
  sourceType: rssSubscriptions.sourceType,
  etag: rssSubscriptions.etag,
  lastModified: rssSubscriptions.lastModified,
  lastFetchedAt: rssSubscriptions.lastFetchedAt,
  lastErrorCode: rssSubscriptions.lastErrorCode,
  lastErrorMessage: rssSubscriptions.lastErrorMessage,
  createdAt: rssSubscriptions.createdAt,
  updatedAt: rssSubscriptions.updatedAt,
};

async function ensureRssBot(userId: string): Promise<Bot> {
  const [existing] = await db
    .select()
    .from(bot)
    .where(and(eq(bot.userId, userId), eq(bot.adapter, 'rss')))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(bot)
    .values({
      id: generateUUID(),
      userId,
      name: 'RSS Feeds',
      description: 'System-managed RSS aggregator',
      adapter: 'rss',
      adapterConfig: serializeJson({}),
      enable: true,
      platformAccountId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!created) {
    throw new AppError(
      'bad_request:database',
      `Failed to ensure RSS bot for user ${userId}`,
    );
  }

  return created;
}

export async function getRssSubscriptionsByUser({
  userId,
}: {
  userId: string;
}): Promise<RssSubscription[]> {
  try {
    const rows = await db
      .select(rssSubscriptionSafeSelect)
      .from(rssSubscriptions)
      .where(eq(rssSubscriptions.userId, userId))
      .orderBy(desc(rssSubscriptions.createdAt));
    return rows as RssSubscription[];
  } catch (error) {
    throw new AppError(
      'bad_request:database',
      `Failed to load RSS subscriptions. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getIntegrationCatalogEntryBySlug({
  slug,
}: {
  slug: string;
}): Promise<IntegrationCatalogEntry | null> {
  try {
    const [entry] = await db
      .select()
      .from(integrationCatalog)
      .where(eq(integrationCatalog.slug, slug))
      .limit(1);
    return entry ?? null;
  } catch (error) {
    throw new AppError(
      'bad_request:database',
      `Failed to load catalog entry ${slug}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getRssSubscriptionById({
  userId,
  subscriptionId,
}: {
  userId: string;
  subscriptionId: string;
}): Promise<RssSubscription | null> {
  try {
    const [row] = await db
      .select(rssSubscriptionSafeSelect)
      .from(rssSubscriptions)
      .where(
        and(
          eq(rssSubscriptions.id, subscriptionId),
          eq(rssSubscriptions.userId, userId),
        ),
      )
      .limit(1);

    return (row ?? null) as RssSubscription | null;
  } catch (error) {
    throw new AppError(
      'bad_request:database',
      `Failed to load RSS subscription ${subscriptionId}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function createRssSubscription({
  userId,
  sourceUrl,
  title,
  category,
  status = 'active',
  sourceType = 'custom',
  catalogId = null,
  integrationAccountId = null,
}: {
  userId: string;
  sourceUrl: string;
  title?: string | null;
  category?: string | null;
  status?: string;
  sourceType?: string;
  catalogId?: string | null;
  integrationAccountId?: string | null;
}): Promise<RssSubscription> {
  try {
    const normalizedUrl = sourceUrl.trim();
    await ensureRssBot(userId);
    const [row] = await db
      .insert(rssSubscriptions)
      .values({
        userId,
        sourceUrl: normalizedUrl,
        title: title ?? null,
        category: category ?? null,
        status,
        sourceType,
        catalogId,
        integrationAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [rssSubscriptions.userId, rssSubscriptions.sourceUrl],
        set: {
          title: title ?? null,
          category: category ?? null,
          status,
          sourceType,
          catalogId,
          integrationAccountId,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  } catch (error) {
    throw new AppError(
      'bad_request:database',
      `Failed to create RSS subscription. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function updateRssSubscription({
  userId,
  subscriptionId,
  title,
  category,
  status,
  lastFetchedAt,
  etag,
  lastModified,
  lastErrorCode,
  lastErrorMessage,
}: {
  userId: string;
  subscriptionId: string;
  title?: string | null;
  category?: string | null;
  status?: string;
  lastFetchedAt?: Date | null;
  etag?: string | null;
  lastModified?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}): Promise<RssSubscription | null> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) payload.title = title;
    if (category !== undefined) payload.category = category;
    if (status !== undefined) payload.status = status;
    if (lastFetchedAt !== undefined) payload.lastFetchedAt = lastFetchedAt;
    if (etag !== undefined) payload.etag = etag;
    if (lastModified !== undefined) payload.lastModified = lastModified;
    if (lastErrorCode !== undefined) payload.lastErrorCode = lastErrorCode;
    if (lastErrorMessage !== undefined)
      payload.lastErrorMessage = lastErrorMessage;

    if (Object.keys(payload).length === 1) {
      return await getRssSubscriptionById({ userId, subscriptionId });
    }

    const [updated] = await db
      .update(rssSubscriptions)
      .set(payload)
      .where(
        and(
          eq(rssSubscriptions.id, subscriptionId),
          eq(rssSubscriptions.userId, userId),
        ),
      )
      .returning();

    return updated ?? null;
  } catch (error) {
    throw new AppError(
      'bad_request:database',
      `Failed to update RSS subscription ${subscriptionId}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function deleteRssSubscription({
  userId,
  subscriptionId,
}: {
  userId: string;
  subscriptionId: string;
}): Promise<boolean> {
  try {
    const [deleted] = await db
      .delete(rssSubscriptions)
      .where(
        and(
          eq(rssSubscriptions.id, subscriptionId),
          eq(rssSubscriptions.userId, userId),
        ),
      )
      .returning({ id: rssSubscriptions.id });

    return Boolean(deleted?.id);
  } catch (error) {
    throw new AppError(
      'bad_request:database',
      `Failed to delete RSS subscription ${subscriptionId}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
