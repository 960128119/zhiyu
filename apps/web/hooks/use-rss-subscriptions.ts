export type RssSubscriptionClient = Record<string, unknown>;

export function useRssSubscriptions(_options?: Record<string, unknown>) {
  return {
    subscriptions: [] as RssSubscriptionClient[],
    isLoading: false,
    error: undefined,
    mutate: async () => undefined,
  };
}
