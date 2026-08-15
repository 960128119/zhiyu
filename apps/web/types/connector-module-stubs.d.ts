declare module "@openzhiyu/integrations/contacts" {
  export type ContactMeta = Record<string, unknown>;
}

declare module "@openzhiyu/integrations/channels/sources/types" {
  export type Platform = string;
  export type ExtractedMessageInfo = Record<string, unknown>;
}

declare module "@openzhiyu/integrations/*" {
  const value: any;
  export = value;
}

declare module "@openzhiyu/rss" {
  export type RssSubscription = Record<string, unknown>;
  export type InsertRssItem = Record<string, unknown>;
  export function buildRssItemInserts(...args: any[]): any[];
  export function extractRssTags(...args: any[]): string[];
  export function parseOpmlFeeds(...args: any[]): any[];
}
