export type IntegrationId = string;

export type IntegrationAccountClient = {
  id: string;
  platform: IntegrationId;
  externalId: string;
  displayName: string;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  botId?: string | null;
  bot?: {
    id?: string;
    name?: string;
    adapter?: string;
  } | null;
};

export type IntegrationGroupMap = Record<IntegrationId, IntegrationAccountClient[]>;

const EMPTY_GROUPS = new Proxy({} as IntegrationGroupMap, {
  get() {
    return [];
  },
});

export function useIntegrations(_options?: Record<string, unknown>) {
  return {
    accounts: [] as IntegrationAccountClient[],
    groupedByIntegration: EMPTY_GROUPS,
    isLoading: false,
    error: undefined,
    mutate: async () => undefined,
  };
}
