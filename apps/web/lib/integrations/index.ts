import type { IntegrationId } from "@/hooks/use-integrations";

export type IntegrationPlatform = {
  id: IntegrationId;
  name: string;
  description?: string;
};

export const INTEGRATION_PLATFORMS: IntegrationPlatform[] = [];
export const integrationPlatforms = INTEGRATION_PLATFORMS;

export function getIntegrationPlatform(id: IntegrationId) {
  return INTEGRATION_PLATFORMS.find((platform) => platform.id === id);
}

export function getDiscordAuthorizationUrl() {
  return "";
}

export function getSlackAuthorizationUrl() {
  return "";
}

export function getTeamsAuthorizationUrl() {
  return "";
}
