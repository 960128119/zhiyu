import type { RawMessageData } from "@openzhiyu/indexeddb/extractor";
import type {
  BotWithAccount,
  DisconnectableAdapter,
  InsightData,
  Platform,
  SummaryUserContext,
} from "./bot-types";

type GeneratedInsightPayload = Record<string, unknown>;

export async function getInsightsByBotId(_input: {
  bot: BotWithAccount;
  insights: InsightData[] | string;
  since: number;
  customPrompt: string;
  user: SummaryUserContext;
  options?: {
    language?: string;
    byGroup?: boolean;
    groupConcurrency?: number;
    groupRetryMaxAttempts?: number;
    groupRetryDelayMs?: number;
  };
  chunkSize?: number;
  failedGroupsToRetry?: Array<{
    groupName: string;
    processedSince: number;
    failureCount: number;
  }>;
}): Promise<{
  payload: GeneratedInsightPayload[];
  originalMsgCount: number;
  locked: boolean;
  rawMessages?: RawMessageData[];
  processedGroups?: string[];
}> {
  return {
    payload: [],
    originalMsgCount: 0,
    locked: false,
    rawMessages: [],
    processedGroups: [],
  };
}

export async function dealMessageChunk(
  _bot: BotWithAccount,
  _customPrompt: string,
  _inputInsights: string,
  _adapter: DisconnectableAdapter,
  _messageChunk: { messages: unknown[]; hasMore: boolean },
  _user: SummaryUserContext,
  _platform: Platform,
  _since: number,
  _chunkSize?: number,
) {
  return;
}
