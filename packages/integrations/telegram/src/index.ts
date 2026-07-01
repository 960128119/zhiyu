/**
 * @openzhiyu/integrations-telegram - Telegram integration package
 */

export { TelegramAdapter } from "./adapter";
export { markdownToTelegramHtml } from "./markdown";
export { TelegramConversationStore } from "./conversation-store";

// Re-export types
export type {
  DialogInfo,
  ExtractedMessageInfo,
} from "@openzhiyu/integrations/channels/sources/types";
export type {
  TelegramContactMeta,
  ContactMeta,
} from "@openzhiyu/integrations/contacts";

// Re-export utility functions
export {
  openzhiyuMessageToTgText,
  tgMessageToopenzhiyuMessage,
} from "./adapter";
export { withTimeout, CONNECT_TIMEOUT_MS } from "./adapter";
