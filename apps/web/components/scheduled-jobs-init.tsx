'use client';

import { getAuthToken } from '@/lib/auth/token-manager';
import { useEffect } from 'react';

/**
 * Bootstraps local runtime services after the first paint.
 *
 * This starts the native scheduler and restores connector listeners without
 * coupling those side effects to page-list APIs such as /api/integrations.
 */
export function ScheduledJobsInit() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isTauri = '__TAURI__' in window;
    const isLocalDev =
      process.env.NODE_ENV === 'development' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');

    if (!isTauri && !isLocalDev) {
      return;
    }

    const initializeRuntime = async () => {
      try {
        const cloudAuthToken = getAuthToken();
        const response = await fetch(
          `/api/runtime/bootstrap${
            cloudAuthToken
              ? `?cloudAuthToken=${encodeURIComponent(cloudAuthToken)}`
              : ''
          }`,
        );

        if (!response.ok) {
          console.warn(
            '[RuntimeBootstrap] API returned non-OK status:',
            response.status,
          );
          return;
        }

        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          console.warn(
            '[RuntimeBootstrap] Unexpected response content-type:',
            contentType,
          );
          return;
        }

        const data = await response.json();
        if (data.success && data.scheduler.isRunning) {
          console.log(
            '[RuntimeBootstrap] Local scheduler is running (checks every',
            data.scheduler.checkInterval / 1000,
            'seconds)',
          );
        }
        if (data.connectorBootstrapQueued) {
          console.log('[RuntimeBootstrap] Connector listeners queued');
        }
      } catch (error) {
        console.error('[RuntimeBootstrap] Failed to initialize:', error);
      }
    };

    const bootstrapDelayMs = isLocalDev && !isTauri ? 60_000 : 3_000;
    const timer = setTimeout(() => {
      const requestIdleCallback = window.requestIdleCallback;
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => void initializeRuntime(), {
          timeout: 30_000,
        });
        return;
      }

      void initializeRuntime();
    }, bootstrapDelayMs);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
