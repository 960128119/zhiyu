-- Add first-class Loop Runtime tables for SQLite.

CREATE TABLE IF NOT EXISTS `loops` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `goal` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `trigger_config` text DEFAULT '{}' NOT NULL,
  `context_config` text DEFAULT '{}' NOT NULL,
  `action_policy` text DEFAULT '{}' NOT NULL,
  `verification_config` text DEFAULT '{}' NOT NULL,
  `approval_policy` text DEFAULT '{}' NOT NULL,
  `retry_policy` text DEFAULT '{}' NOT NULL,
  `escalation_policy` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `loop_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `loop_id` text NOT NULL,
  `status` text DEFAULT 'running' NOT NULL,
  `trigger_reason` text,
  `started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `completed_at` integer,
  `input_snapshot` text,
  `output_summary` text,
  `verification_result` text,
  `error` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`loop_id`) REFERENCES `loops`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `loop_states` (
  `loop_id` text PRIMARY KEY NOT NULL,
  `current_phase` text DEFAULT 'idle' NOT NULL,
  `memory_summary` text,
  `open_questions` text DEFAULT '[]' NOT NULL,
  `last_observation` text,
  `next_action` text,
  `blocked_reason` text,
  `state_json` text DEFAULT '{}' NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`loop_id`) REFERENCES `loops`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `loops_user_idx`
  ON `loops` (`user_id`);

CREATE INDEX IF NOT EXISTS `loops_status_idx`
  ON `loops` (`status`);

CREATE INDEX IF NOT EXISTS `loops_user_status_idx`
  ON `loops` (`user_id`, `status`);

CREATE INDEX IF NOT EXISTS `loops_updated_at_idx`
  ON `loops` (`updated_at`);

CREATE INDEX IF NOT EXISTS `loop_runs_loop_idx`
  ON `loop_runs` (`loop_id`);

CREATE INDEX IF NOT EXISTS `loop_runs_status_idx`
  ON `loop_runs` (`status`);

CREATE INDEX IF NOT EXISTS `loop_runs_started_at_idx`
  ON `loop_runs` (`started_at`);

CREATE INDEX IF NOT EXISTS `loop_runs_loop_started_at_idx`
  ON `loop_runs` (`loop_id`, `started_at`);
