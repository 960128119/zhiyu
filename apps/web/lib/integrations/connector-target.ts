export type ConnectorTarget = {
  platform?: string;
  reason?: string;
};

export function normalizeIntegrationPlatform(platform?: string | null) {
  return platform?.trim().toLowerCase() ?? "";
}

export function buildConnectorTargetUrl() {
  return "";
}

export function buildMissingIntegrationActionFromText(..._args: unknown[]) {
  return null;
}

export function resolveSuggestedActionIntegrationPlatform(
  ..._args: unknown[]
) {
  return null;
}
