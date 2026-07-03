'use client';

import useSWR from 'swr';
import type { RssSubscription } from '@/lib/db/schema';

export type RssSubscriptionClient = Omit<
  RssSubscription,
  'createdAt' | 'updatedAt' | 'lastFetchedAt'
> & {
  createdAt: string;
  updatedAt: string;
  lastFetchedAt: string | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return (await response.json()) as { subscriptions: RssSubscriptionClient[] };
};

export function useRssSubscriptions(options?: {
  fallbackSubscriptions?: RssSubscriptionClient[];
  revalidateOnMount?: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR<{
    subscriptions: RssSubscriptionClient[];
  }>('/api/integrations/rss', fetcher, {
    fallbackData: { subscriptions: options?.fallbackSubscriptions ?? [] },
    revalidateOnMount: options?.revalidateOnMount,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  return {
    subscriptions: data?.subscriptions ?? [],
    isLoading,
    error,
    mutate,
  };
}
