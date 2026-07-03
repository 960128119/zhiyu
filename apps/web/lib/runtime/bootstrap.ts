import 'server-only';

import { setCloudAuthToken } from '@/lib/auth/token-manager';
import {
  getLightweightSchedulerStatus,
  isLocalSchedulerAllowedLight,
} from '@/lib/cron/scheduler-state';
import { getIntegrationAccountsByUserId } from '@/lib/db/integration-queries';
import {
  type ConnectorBootstrapName,
  type ConnectorBootstrapResult,
  getRuntimeBootstrapStatus,
  setRuntimeBootstrapStatus,
} from '@/lib/runtime/bootstrap-state';

const CONNECTOR_BOOTSTRAP_INTERVAL_MS = 30_000;
const connectorBootstrapAttempts = new Map<string, number>();

const schedulerBootstrapAttempts = new Map<string, number>();

async function startSchedulerForUser(userId: string) {
  const { getSchedulerStatus, setSchedulerUserId, startLocalScheduler } =
    await import('@/lib/cron/local-scheduler');

  setSchedulerUserId(userId);
  if (!getSchedulerStatus().isRunning) {
    await startLocalScheduler();
  }
  getSchedulerStatus();
}

async function startConnectorListenersForUser(
  userId: string,
  authToken?: string,
): Promise<ConnectorBootstrapResult[]> {
  const tasks: Array<{
    name: ConnectorBootstrapName;
    promise: Promise<unknown>;
  }> = [];
  const accounts = await getIntegrationAccountsByUserId({ userId });
  const activePlatforms = new Set(
    accounts
      .filter((account) => account.status === 'active')
      .map((account) => account.platform),
  );

  if (activePlatforms.has('feishu')) {
    const { startFeishuListenersForUser } = await import(
      '@/lib/integrations/feishu/ws-listener'
    );
    tasks.push({
      name: 'feishu',
      promise: startFeishuListenersForUser(userId, authToken),
    });
  }
  if (activePlatforms.has('dingtalk')) {
    const { startDingTalkListenersForUser } = await import(
      '@/lib/integrations/dingtalk/ws-listener'
    );
    tasks.push({
      name: 'dingtalk',
      promise: startDingTalkListenersForUser(userId, authToken),
    });
  }
  if (activePlatforms.has('qqbot')) {
    const { startQQListenersForUser } = await import(
      '@/lib/integrations/qqbot/ws-listener'
    );
    tasks.push({
      name: 'qqbot',
      promise: startQQListenersForUser(userId, authToken),
    });
  }
  if (activePlatforms.has('weixin')) {
    const { startWeixinListenersForUser } = await import(
      '@/lib/integrations/weixin/ws-listener'
    );
    tasks.push({
      name: 'weixin',
      promise: startWeixinListenersForUser(userId, authToken),
    });
  }
  if (activePlatforms.has('telegram')) {
    const { initTelegramUserListener } = await import(
      '@/lib/integrations/telegram/init'
    );
    tasks.push({
      name: 'telegram',
      promise: initTelegramUserListener(userId),
    });
  }
  if (activePlatforms.has('whatsapp')) {
    const { initWhatsAppSelfMessageListener } = await import(
      '@/lib/integrations/whatsapp/init'
    );
    tasks.push({
      name: 'whatsapp',
      promise: initWhatsAppSelfMessageListener(userId, authToken),
    });
  }
  if (activePlatforms.has('imessage')) {
    const { initIMessageSelfListener } = await import(
      '@/lib/integrations/imessage/init'
    );
    tasks.push({
      name: 'imessage',
      promise: initIMessageSelfListener(userId, undefined, authToken),
    });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  return settled.map((result, index) => {
    const name = tasks[index].name;
    if (result.status === 'fulfilled') {
      return { name, status: 'fulfilled' };
    }
    return {
      name,
      status: 'rejected',
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  });
}

function shouldBootstrapConnectors(userId: string): boolean {
  const now = Date.now();
  const previous = connectorBootstrapAttempts.get(userId) ?? 0;
  if (now - previous < CONNECTOR_BOOTSTRAP_INTERVAL_MS) return false;
  connectorBootstrapAttempts.set(userId, now);
  return true;
}

export async function bootstrapRuntimeForUser({
  userId,
  cloudAuthToken,
}: {
  userId: string;
  cloudAuthToken?: string;
}) {
  const normalizedToken = cloudAuthToken?.trim() || undefined;

  if (normalizedToken) {
    setCloudAuthToken(normalizedToken);
  }

  const schedulerAllowed = isLocalSchedulerAllowedLight();
  if (schedulerAllowed && !getLightweightSchedulerStatus().isRunning) {
    const previous = schedulerBootstrapAttempts.get(userId) ?? 0;
    if (Date.now() - previous > CONNECTOR_BOOTSTRAP_INTERVAL_MS) {
      schedulerBootstrapAttempts.set(userId, Date.now());
      setTimeout(() => {
        startSchedulerForUser(userId).catch((error) => {
          console.error('[RuntimeBootstrap] Scheduler bootstrap failed', error);
        });
      }, 250);
    }
  }

  let connectorBootstrapQueued = false;
  if (shouldBootstrapConnectors(userId)) {
    connectorBootstrapQueued = true;
    setRuntimeBootstrapStatus(userId, {
      ...getRuntimeBootstrapStatus(userId),
      lastQueuedAt: new Date().toISOString(),
      inFlight: true,
    });
    setTimeout(() => {
      startConnectorListenersForUser(userId, normalizedToken)
        .then((results) => {
          setRuntimeBootstrapStatus(userId, {
            lastQueuedAt: getRuntimeBootstrapStatus(userId).lastQueuedAt,
            lastCompletedAt: new Date().toISOString(),
            inFlight: false,
            results,
          });
        })
        .catch((error) => {
          console.error(
            '[RuntimeBootstrap] Connector listener bootstrap failed',
            error,
          );
          setRuntimeBootstrapStatus(userId, {
            lastQueuedAt: getRuntimeBootstrapStatus(userId).lastQueuedAt,
            lastCompletedAt: new Date().toISOString(),
            inFlight: false,
            results: [
              {
                name: 'feishu',
                status: 'rejected',
                error: error instanceof Error ? error.message : String(error),
              },
            ],
          });
        });
    }, 500);
  }

  return {
    success: true,
    connectorBootstrapQueued,
    connectorBootstrap: getRuntimeBootstrapStatus(userId),
    scheduler: {
      allowed: schedulerAllowed,
      ...getLightweightSchedulerStatus(),
    },
  };
}
