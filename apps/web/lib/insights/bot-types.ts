import type { DetailData, InsightData, TimelineData } from "@/lib/ai/subagents/insights";
import type { BotWithAccount } from "../db/bot-queries";
import type { UserType } from "@/app/(auth)/auth";
import type { RawMessageData } from "@openzhiyu/indexeddb/extractor";

export type Platform = string;
export type ExtractedMessageInfoWithoutAttachments = Record<string, unknown>;
export type ExtractEmailInfoWithoutAttachments = Record<string, unknown>;
export type InsightInput =
  | ExtractedMessageInfoWithoutAttachments
  | ExtractedMessageInfoWithoutAttachments[]
  | ExtractEmailInfoWithoutAttachments
  | ExtractEmailInfoWithoutAttachments[]
  | string;

export type SummaryUserContext = {
  id: string;
  type: UserType;
  slackToken?: string;
  name?: string | null;
  email?: string | null;
  token?: string;
};

export type RefreshOptions = {
  user?: SummaryUserContext;
  force?: boolean;
  chunkSize?: number;
  byGroup?: boolean;
  groupConcurrency?: number;
  groupRetryMaxAttempts?: number;
  groupRetryDelayMs?: number;
  groups?: string[];
};

export interface RefreshResult {
  refreshed: boolean;
  rawMessages?: any[];
}

export type GroupInsightResult = {
  groupName: string;
  insights: InsightData[];
  messageCount: number;
  rawMessages?: RawMessageData[];
  error?: Error;
};

export type ChunkCapableAdapter = {
  getChatsByChunk: (
    since: number,
    chunkSize?: number,
  ) => Promise<{ messages: unknown[]; hasMore: boolean }>;
};

export type DisconnectableAdapter = ChunkCapableAdapter & {
  client?: unknown | null;
  disconnect?: () => Promise<undefined | boolean>;
  kill?: () => Promise<undefined | boolean>;
};

export type { DetailData, InsightData, TimelineData, BotWithAccount };
