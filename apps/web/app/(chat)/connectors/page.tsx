'use client';

import { Spinner } from '@/components/spinner';
import type {
  IntegrationAccountClient,
  IntegrationId,
} from '@/hooks/use-integrations';
import type { RssSubscriptionClient } from '@/hooks/use-rss-subscriptions';
import { normalizeIntegrationPlatform } from '@/lib/integrations/connector-target';
import { fetcher } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import '../../../i18n';

const PersonalizationLinkedAccounts = dynamic(
  () =>
    import('@/components/personalization/personalization-linked-accounts').then(
      (module) => module.PersonalizationLinkedAccounts,
    ),
  {
    loading: () => (
      <div className="flex h-full min-h-[360px] items-center justify-center text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    ),
    ssr: false,
  },
);

interface ConnectorsPageState {
  generatedAt: string;
  accounts: IntegrationAccountClient[];
  rssSubscriptions: RssSubscriptionClient[];
  runtime: {
    scheduler: {
      allowed: boolean;
      isRunning: boolean;
      checkInterval: number | null;
    };
    connectors: {
      totalAccounts: number;
      activeAccounts: number;
      accountsByPlatform: Record<string, number>;
      activeByPlatform: Record<string, number>;
    };
  };
}

/**
 * Standalone Connectors page: manage linked platforms and RSS (moved out of Personalization dialog).
 * URL `?addPlatform=true` opens the add-platform flow via PlatformIntegrations.
 * URL `?platform=xxx` pre-selects a specific platform for connection.
 */
export default function ConnectorsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    data: pageState,
    error: pageStateError,
    isLoading: isPageStateLoading,
  } = useSWR<ConnectorsPageState>('/api/page-state/connectors', fetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
  });
  const [isAddConnectorDialogOpen, setIsAddConnectorDialogOpen] =
    useState(false);
  const [pendingLinkingPlatform, setPendingLinkingPlatform] =
    useState<IntegrationId | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const addPanelTab = useMemo<'apps' | 'rss'>(() => {
    return searchParams.get('addPanelTab') === 'rss' ? 'rss' : 'apps';
  }, [searchParams]);

  /**
   * Auto-open add-connector dialog for deep links.
   */
  useEffect(() => {
    if (searchParams.get('addPlatform') !== 'true') return;
    setPendingLinkingPlatform(
      normalizeIntegrationPlatform(searchParams.get('platform')),
    );
    setReturnTo(searchParams.get('returnTo'));
    setIsAddConnectorDialogOpen(true);
    router.replace('/connectors', { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!returnTo) return;

    const handleAuthorized = () => {
      router.push(returnTo);
    };

    window.addEventListener('integration:accountAuthorized', handleAuthorized);
    return () => {
      window.removeEventListener(
        'integration:accountAuthorized',
        handleAuthorized,
      );
    };
  }, [returnTo, router]);

  const handleAddConnectorDialogOpenChange = (open: boolean) => {
    setIsAddConnectorDialogOpen(open);
    if (!open) setPendingLinkingPlatform(null);
  };

  if (isPageStateLoading && !pageState) {
    return (
      <div className="flex h-full min-h-[60vh] flex-1 items-center justify-center text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-h-[60vh] flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <PersonalizationLinkedAccounts
          open={true}
          isAddConnectorDialogOpen={isAddConnectorDialogOpen}
          onAddConnectorDialogOpenChange={handleAddConnectorDialogOpenChange}
          initialAddPanelTab={addPanelTab}
          linkingPlatform={pendingLinkingPlatform}
          initialAccounts={
            pageStateError ? undefined : (pageState?.accounts ?? [])
          }
          initialRssSubscriptions={
            pageStateError ? undefined : (pageState?.rssSubscriptions ?? [])
          }
        />
      </div>
    </div>
  );
}
