-- Add interaction memory tables for external message streams such as WeChat.

CREATE TABLE IF NOT EXISTS `interaction_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `platform` text NOT NULL,
  `source` text NOT NULL,
  `conversation_id` text,
  `conversation_name` text NOT NULL,
  `conversation_type` text DEFAULT 'unknown' NOT NULL,
  `sender_id` text,
  `sender_name` text,
  `sender_display_name` text,
  `direction` text DEFAULT 'unknown' NOT NULL,
  `content_type` text DEFAULT 'unknown' NOT NULL,
  `content` text DEFAULT '' NOT NULL,
  `content_preview` text DEFAULT '' NOT NULL,
  `message_time` integer NOT NULL,
  `collected_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `source_message_id` text,
  `source_sequence` text,
  `source_raw` text DEFAULT '{}' NOT NULL,
  `dedupe_key` text NOT NULL,
  `processed_status` text DEFAULT 'new' NOT NULL,
  `importance` text DEFAULT 'unknown' NOT NULL,
  `requires_reply` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `interaction_events_user_platform_dedupe_idx`
  ON `interaction_events` (`user_id`, `platform`, `dedupe_key`);
CREATE INDEX IF NOT EXISTS `interaction_events_user_message_time_idx`
  ON `interaction_events` (`user_id`, `message_time`);
CREATE INDEX IF NOT EXISTS `interaction_events_user_status_idx`
  ON `interaction_events` (`user_id`, `processed_status`);
CREATE INDEX IF NOT EXISTS `interaction_events_conversation_idx`
  ON `interaction_events` (`user_id`, `platform`, `conversation_id`);

CREATE TABLE IF NOT EXISTS `interaction_threads` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `platform` text NOT NULL,
  `conversation_id` text NOT NULL,
  `conversation_name` text NOT NULL,
  `conversation_type` text DEFAULT 'unknown' NOT NULL,
  `last_message_at` integer NOT NULL,
  `last_collected_at` integer NOT NULL,
  `unread_count` integer DEFAULT 0 NOT NULL,
  `pending_reply_count` integer DEFAULT 0 NOT NULL,
  `last_event_id` text,
  `summary` text,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`last_event_id`) REFERENCES `interaction_events`(`id`) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `interaction_threads_user_conversation_idx`
  ON `interaction_threads` (`user_id`, `platform`, `conversation_id`);
CREATE INDEX IF NOT EXISTS `interaction_threads_user_last_message_idx`
  ON `interaction_threads` (`user_id`, `last_message_at`);
