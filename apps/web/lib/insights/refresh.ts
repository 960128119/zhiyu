import type { RefreshOptions, RefreshResult } from "./bot-types";

export async function refreshActiveBotInsight(
  _botId: string,
  _options?: RefreshOptions,
): Promise<RefreshResult> {
  return { refreshed: false, rawMessages: [] };
}
