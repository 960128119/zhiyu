/**
 * Client-safe deployment mode detection
 *
 * For client-side components only, use @/lib/env/constants for server-side
 */

const DEPLOYMENT_MODE = "server";

export function isTauriMode(): boolean {
  return false;
}

export function isServerMode(): boolean {
  return DEPLOYMENT_MODE === "server";
}
