import 'server-only';

import { setCloudAuthToken } from '@/lib/auth/token-manager';
import {
  getLightweightSchedulerStatus,
  isLocalSchedulerAllowedLight,
} from '@/lib/cron/scheduler-state';

const SCHEDULER_BOOTSTRAP_INTERVAL_MS = 30_000;
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
    if (Date.now() - previous > SCHEDULER_BOOTSTRAP_INTERVAL_MS) {
      schedulerBootstrapAttempts.set(userId, Date.now());
      setTimeout(() => {
        startSchedulerForUser(userId).catch((error) => {
          console.error('[RuntimeBootstrap] Scheduler bootstrap failed', error);
        });
      }, 250);
    }
  }

  return {
    success: true,
    scheduler: {
      allowed: schedulerAllowed,
      ...getLightweightSchedulerStatus(),
    },
  };
}
