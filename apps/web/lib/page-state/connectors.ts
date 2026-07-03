import 'server-only';

import { weixinBotHasValidContextToken } from '@/lib/db/bot-queries';
import {
  type IntegrationAccountWithBot,
  getIntegrationAccountsByUserId,
} from '@/lib/db/integration-queries';
import { getRssSubscriptionsByUser } from '@/lib/db/rss-queries';
import type { RssSubscription } from '@/lib/db/schema';
import { getRuntimeStatusSnapshot } from '@/lib/runtime/status';

export interface ConnectorAccountPageState {
  id: string;
  platform: string;
  externalId: string;
  displayName: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  hasValidContextToken?: boolean;
  bot: {
    id: string;
    name: string;
    description: string;
    adapter: string;
    enable: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export type ConnectorRssSubscriptionPageState = Omit<
  RssSubscription,
  'createdAt' | 'updatedAt' | 'lastFetchedAt'
> & {
  createdAt: string;
  updatedAt: string;
  lastFetchedAt: string | null;
};

function serializeAccount(
  account: IntegrationAccountWithBot,
): ConnectorAccountPageState {
  return {
    id: account.id,
    platform: account.platform,
    externalId: account.externalId,
    displayName: account.displayName,
    status: account.status,
    metadata:
      account.metadata && typeof account.metadata === 'object'
        ? (account.metadata as Record<string, unknown>)
        : null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    bot: account.bot
      ? {
          id: account.bot.id,
          name: account.bot.name,
          description: account.bot.description ?? '',
          adapter: account.bot.adapter,
          enable: account.bot.enable,
          createdAt: account.bot.createdAt.toISOString(),
          updatedAt: account.bot.updatedAt.toISOString(),
        }
      : null,
  };
}

function serializeRssSubscription(
  subscription: RssSubscription,
): ConnectorRssSubscriptionPageState {
  return {
    ...subscription,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
    lastFetchedAt: subscription.lastFetchedAt?.toISOString() ?? null,
  };
}

export async function getConnectorsPageState(userId: string) {
  const [accounts, rssSubscriptions] = await Promise.all([
    getIntegrationAccountsByUserId({ userId }),
    getRssSubscriptionsByUser({ userId }),
  ]);
  const runtimeState = await getRuntimeStatusSnapshot(userId, accounts);

  const enhancedAccounts = await Promise.all(
    accounts.map(async (account) => {
      const baseAccount = serializeAccount(account);
      if (account.platform === 'weixin' && account.bot?.id) {
        baseAccount.hasValidContextToken = await weixinBotHasValidContextToken(
          userId,
          account.bot.id,
        );
      }
      return baseAccount;
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    accounts: enhancedAccounts,
    rssSubscriptions: rssSubscriptions.map(serializeRssSubscription),
    runtime: runtimeState,
  };
}
