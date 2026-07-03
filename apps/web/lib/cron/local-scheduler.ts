/**
 * Local Scheduler for Tauri/Desktop Environment
 * This module provides a client-side scheduler that checks for due jobs periodically
 */

import { recoverStuckJobs, cleanupStuckJobs } from './service';
import { isTauriMode } from '../env/constants';
import { getCloudAuthToken } from '@/lib/auth/token-manager';
import { db } from '../db/index';
import { jobExecutions, scheduledJobs } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  getNativeLoopSchedulerStatus,
  runDueNativeLoops,
} from '@/lib/loops/native-scheduler';
import {
  LOCAL_SCHEDULER_CHECK_INTERVAL,
  setLocalSchedulerRunning,
} from './scheduler-state';

// Track running jobs to prevent duplicate executions within the same scheduler cycle
const runningJobs = new Set<string>();

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
const CHECK_INTERVAL = LOCAL_SCHEDULER_CHECK_INTERVAL; // Check every minute

// Store current user ID for filtering jobs (set when scheduler starts)
let schedulerUserId: string | undefined;

export function isLocalSchedulerAllowed() {
  return isTauriMode() || process.env.ENABLE_LOCAL_SCHEDULER === 'true';
}

/**
 * Set the current user ID for job filtering
 * Called when the scheduler is started via API
 */
export function setSchedulerUserId(userId: string | undefined) {
  schedulerUserId = userId;
}

/**
 * Get the current user ID for job filtering
 */
export function getSchedulerUserId(): string | undefined {
  return schedulerUserId;
}

/**
 * Start the local scheduler
 * This should be called when the app starts
 */
export async function startLocalScheduler() {
  if (schedulerInterval) {
    console.log('[LocalScheduler] Already running');
    return;
  }

  if (!isLocalSchedulerAllowed()) {
    console.log(
      '[LocalScheduler] Local scheduler disabled; set ENABLE_LOCAL_SCHEDULER=true to run it outside Tauri',
    );
    return;
  }

  // Check periodically. The first run is intentionally delayed so runtime
  // bootstrap does not block page navigation with maintenance compilation.
  schedulerInterval = setInterval(() => {
    checkAndExecuteDueJobs();
  }, CHECK_INTERVAL);
  setLocalSchedulerRunning(true, getNativeLoopSchedulerStatus());
}

/**
 * Stop the local scheduler
 */
export async function stopLocalScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    setLocalSchedulerRunning(false, getNativeLoopSchedulerStatus());
    console.log('[LocalScheduler] Scheduler stopped');
  }
  // Clear running jobs to prevent stuck entries on shutdown
  runningJobs.clear();

  // Update database to mark all running jobs as interrupted
  const now = new Date();
  const running = await db
    .select()
    .from(jobExecutions)
    .where(eq(jobExecutions.status, 'running'));

  for (const exec of running) {
    await db
      .update(jobExecutions)
      .set({
        status: 'interrupted',
        completedAt: now,
        error: 'Job was interrupted (application closed)',
      })
      .where(eq(jobExecutions.id, exec.id));

    await db
      .update(scheduledJobs)
      .set({
        lastStatus: 'error',
        lastError: 'Job was interrupted (application closed)',
        updatedAt: now,
      })
      .where(eq(scheduledJobs.id, exec.jobId));
  }

  if (running.length > 0) {
    console.log(
      `[LocalScheduler] Marked ${running.length} running jobs as interrupted`,
    );
  }
}

// Register cleanup on process exit to prevent jobs from being stuck in runningJobs
// This handles unexpected crashes or process termination
if (typeof process !== 'undefined' && process.on) {
  const cleanupHandler = async () => {
    runningJobs.clear();

    // Update database to mark all running jobs as interrupted
    const now = new Date();
    const running = await db
      .select()
      .from(jobExecutions)
      .where(eq(jobExecutions.status, 'running'));

    for (const exec of running) {
      await db
        .update(jobExecutions)
        .set({
          status: 'interrupted',
          completedAt: now,
          error: 'Job was interrupted (application closed)',
        })
        .where(eq(jobExecutions.id, exec.id));

      await db
        .update(scheduledJobs)
        .set({
          lastStatus: 'error',
          lastError: 'Job was interrupted (application closed)',
          updatedAt: now,
        })
        .where(eq(scheduledJobs.id, exec.jobId));
    }

    if (running.length > 0) {
      console.log(
        `[LocalScheduler] Marked ${running.length} running jobs as interrupted`,
      );
    }
  };
  process.on('exit', cleanupHandler);
}

/**
 * Check for due jobs and execute them
 */
async function checkAndExecuteDueJobs() {
  if (isProcessing) {
    console.log('[LocalScheduler] Already processing, skipping');
    return;
  }

  isProcessing = true;

  try {
    // First, recover any stuck jobs (runs every minute as part of the scheduler cycle)
    // Jobs running longer than RECOVERY_TIMEOUT_MS (120 min) are considered stuck
    await recoverStuckJobs();

    // Then clean up zombie jobs that have been stuck for over 4 hours
    // These are beyond recovery and are simply deleted
    await cleanupStuckJobs();

    const schedulerAuthToken = getCloudAuthToken();
    try {
      const {
        runInsightEmbeddingDreamIfDue,
        runInsightMaintenanceIfDue,
        runRawMessageEmbeddingDreamIfDue,
      } = await import('./insight-maintenance');
      await runRawMessageEmbeddingDreamIfDue(
        schedulerUserId,
        schedulerAuthToken,
      );
      await runInsightEmbeddingDreamIfDue(schedulerUserId, schedulerAuthToken);
      await runInsightMaintenanceIfDue(schedulerUserId);
      await runDueNativeLoops({ userId: schedulerUserId });
    } catch (error) {
      console.error('[LocalScheduler] Error running maintenance loops:', error);
    }
  } catch (error) {
    console.error('[LocalScheduler] Error checking for due jobs:', error);
  } finally {
    // Reset isProcessing after launching all jobs (not after they complete)
    isProcessing = false;
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  const nativeLoops = getNativeLoopSchedulerStatus();
  setLocalSchedulerRunning(schedulerInterval !== null, nativeLoops);
  return {
    isRunning: schedulerInterval !== null,
    checkInterval: CHECK_INTERVAL,
    nativeLoops,
  };
}
