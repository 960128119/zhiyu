-- Store per-user source policies for long-running interaction ingestion.

CREATE TABLE IF NOT EXISTS `interaction_source_policies` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `platform` text NOT NULL,
  `source_id` text NOT NULL,
  `source_name` text NOT NULL,
  `source_type` text DEFAULT 'unknown' NOT NULL,
  `policy` text DEFAULT 'sync' NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `last_seen_at` integer,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `interaction_source_policies_user_platform_source_idx`
  ON `interaction_source_policies` (`user_id`, `platform`, `source_id`);
CREATE INDEX IF NOT EXISTS `interaction_source_policies_user_platform_policy_idx`
  ON `interaction_source_policies` (`user_id`, `platform`, `policy`);
CREATE INDEX IF NOT EXISTS `interaction_source_policies_user_updated_at_idx`
  ON `interaction_source_policies` (`user_id`, `updated_at`);
