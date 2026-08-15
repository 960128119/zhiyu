type AdapterModule = Record<string, unknown>;

export const platformAdapterPaths: Record<string, () => Promise<AdapterModule>> = {};

export async function getPlatformAdapter<T = unknown>(
  platform: string,
  _adapterName: string,
  _config: Record<string, unknown>,
): Promise<T> {
  throw new Error(`Connector platform adapters have been removed: ${platform}`);
}

export function getAvailablePlatforms(): string[] {
  return [];
}
