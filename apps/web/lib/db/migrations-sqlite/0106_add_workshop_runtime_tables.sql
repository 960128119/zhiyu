-- Add Work Workshop runtime tables for SQLite.

CREATE TABLE IF NOT EXISTS `workshops` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `mission` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `autonomy_level` text DEFAULT 'draft' NOT NULL,
  `boundary_policy` text DEFAULT '{}' NOT NULL,
  `model_config` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `workshop_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `status` text DEFAULT 'running' NOT NULL,
  `trigger_reason` text,
  `cc_session_id` text,
  `input_snapshot` text,
  `output_summary` text,
  `error` text,
  `started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `completed_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `workshop_events` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `run_id` text,
  `seq` integer NOT NULL,
  `type` text NOT NULL,
  `title` text NOT NULL,
  `body` text,
  `metadata` text DEFAULT '{}' NOT NULL,
  `visibility` text DEFAULT 'user' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`run_id`) REFERENCES `workshop_runs`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `workshop_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `type` text NOT NULL,
  `name` text NOT NULL,
  `uri` text,
  `content` text,
  `config` text DEFAULT '{}' NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `last_checked_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `workshop_directives` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `run_id` text,
  `content` text NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `scope` text DEFAULT 'current_run' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`run_id`) REFERENCES `workshop_runs`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `workshop_memories` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `kind` text NOT NULL,
  `content` text NOT NULL,
  `confidence` integer DEFAULT 50 NOT NULL,
  `tags` text DEFAULT '[]' NOT NULL,
  `source_event_ids` text DEFAULT '[]' NOT NULL,
  `expires_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `workshop_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `run_id` text,
  `channel` text DEFAULT 'wechat_desktop' NOT NULL,
  `recipient_name` text,
  `message` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `confidence` integer DEFAULT 50 NOT NULL,
  `risk_level` text DEFAULT 'medium' NOT NULL,
  `source_event_ids` text DEFAULT '[]' NOT NULL,
  `boundary_result` text DEFAULT '{}' NOT NULL,
  `sent_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`run_id`) REFERENCES `workshop_runs`(`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `workshops_user_idx`
  ON `workshops` (`user_id`);
CREATE INDEX IF NOT EXISTS `workshops_user_status_idx`
  ON `workshops` (`user_id`, `status`);
CREATE INDEX IF NOT EXISTS `workshops_updated_at_idx`
  ON `workshops` (`updated_at`);
CREATE INDEX IF NOT EXISTS `workshop_runs_workshop_idx`
  ON `workshop_runs` (`workshop_id`);
CREATE INDEX IF NOT EXISTS `workshop_runs_status_idx`
  ON `workshop_runs` (`status`);
CREATE INDEX IF NOT EXISTS `workshop_runs_started_at_idx`
  ON `workshop_runs` (`started_at`);
CREATE UNIQUE INDEX IF NOT EXISTS `workshop_events_workshop_seq_idx`
  ON `workshop_events` (`workshop_id`, `seq`);
CREATE INDEX IF NOT EXISTS `workshop_events_workshop_created_at_idx`
  ON `workshop_events` (`workshop_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `workshop_events_run_idx`
  ON `workshop_events` (`run_id`);
CREATE INDEX IF NOT EXISTS `workshop_sources_workshop_idx`
  ON `workshop_sources` (`workshop_id`);
CREATE INDEX IF NOT EXISTS `workshop_sources_type_idx`
  ON `workshop_sources` (`type`);
CREATE INDEX IF NOT EXISTS `workshop_directives_workshop_status_idx`
  ON `workshop_directives` (`workshop_id`, `status`);
CREATE INDEX IF NOT EXISTS `workshop_directives_run_idx`
  ON `workshop_directives` (`run_id`);
CREATE INDEX IF NOT EXISTS `workshop_memories_workshop_kind_idx`
  ON `workshop_memories` (`workshop_id`, `kind`);
CREATE INDEX IF NOT EXISTS `workshop_memories_created_at_idx`
  ON `workshop_memories` (`created_at`);
CREATE INDEX IF NOT EXISTS `workshop_outbox_workshop_status_idx`
  ON `workshop_outbox` (`workshop_id`, `status`);
CREATE INDEX IF NOT EXISTS `workshop_outbox_run_idx`
  ON `workshop_outbox` (`run_id`);
