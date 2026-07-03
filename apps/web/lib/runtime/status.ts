import 'server-only';

import {
  getLightweightSchedulerStatus,
  isLocalSchedulerAllowedLight,
} from '@/lib/cron/scheduler-state';
import {
  type IntegrationAccountWithBot,
  getIntegrationAccountsByUserId,
} from '@/lib/db/integration-queries';
import {
  type RuntimeBootstrapStatus,
  getRuntimeBootstrapStatus,
} from '@/lib/runtime/bootstrap-state';

export interface RuntimeConnectorSummary {
  totalAccounts: number;
  activeAccounts: number;
  accountsByPlatform: Record<string, number>;
  activeByPlatform: Record<string, number>;
  listenerBootstrap: RuntimeBootstrapStatus;
}

export interface RuntimeStatusSnapshot {
  generatedAt: string;
  scheduler: {
    allowed: boolean;
    isRunning: boolean;
    checkInterval: number | null;
    nativeLoops:
      | ReturnType<typeof getLightweightSchedulerStatus>['nativeLoops']
      | null;
  };
  connectors: RuntimeConnectorSummary;
}

function emptyConnectorSummary(): RuntimeConnectorSummary {
  return {
    totalAccounts: 0,
    activeAccounts: 0,
    accountsByPlatform: {},
    activeByPlatform: {},
    listenerBootstrap: {
      lastQueuedAt: null,
      lastCompletedAt: null,
      inFlight: false,
      results: [],
    },
  };
}

export async function getRuntimeStatusSnapshot(
  userId: string,
  preloadedAccounts?: IntegrationAccountWithBot[],
): Promise<RuntimeStatusSnapshot> {
  const connectorSummary = emptyConnectorSummary();
  const accounts =
    preloadedAccounts ?? (await getIntegrationAccountsByUserId({ userId }));

  for (const account of accounts) {
    connectorSummary.totalAccounts += 1;
    connectorSummary.accountsByPlatform[account.platform] =
      (connectorSummary.accountsByPlatform[account.platform] ?? 0) + 1;

    if (account.status === 'active') {
      connectorSummary.activeAccounts += 1;
      connectorSummary.activeByPlatform[account.platform] =
        (connectorSummary.activeByPlatform[account.platform] ?? 0) + 1;
    }
  }

  const schedulerAllowed = isLocalSchedulerAllowedLight();
  const schedulerStatus = schedulerAllowed
    ? getLightweightSchedulerStatus()
    : null;

  return {
    generatedAt: new Date().toISOString(),
    scheduler: {
      allowed: schedulerAllowed,
      isRunning: schedulerStatus?.isRunning ?? false,
      checkInterval: schedulerStatus?.checkInterval ?? null,
      nativeLoops: schedulerStatus?.nativeLoops ?? null,
    },
    connectors: {
      ...connectorSummary,
      listenerBootstrap: getRuntimeBootstrapStatus(userId),
    },
  };
}
