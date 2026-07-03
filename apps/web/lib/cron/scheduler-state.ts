import 'server-only';

import { isTauriMode } from '@/lib/env/constants';

export const LOCAL_SCHEDULER_CHECK_INTERVAL = 60 * 1000;

let schedulerRunning = false;
let nativeLoopStatus: unknown = null;

export function isLocalSchedulerAllowedLight() {
  return isTauriMode() || process.env.ENABLE_LOCAL_SCHEDULER === 'true';
}

export function setLocalSchedulerRunning(
  isRunning: boolean,
  nativeLoops?: unknown,
) {
  schedulerRunning = isRunning;
  if (nativeLoops !== undefined) {
    nativeLoopStatus = nativeLoops;
  }
}

export function getLightweightSchedulerStatus() {
  return {
    isRunning: schedulerRunning,
    checkInterval: LOCAL_SCHEDULER_CHECK_INTERVAL,
    nativeLoops: nativeLoopStatus,
  };
}
