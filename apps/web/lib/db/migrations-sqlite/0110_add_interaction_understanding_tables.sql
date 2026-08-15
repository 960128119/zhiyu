-- Add interaction understanding tables used to materialize raw events into wiki candidates.

CREATE TABLE IF NOT EXISTS `interaction_notes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `event_id` text,
  `thread_id` text,
  `note_type` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `confidence` integer DEFAULT 50 NOT NULL,
  `model` text,
  `source_event_ids` text DEFAULT '[]' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`event_id`) REFERENCES `interaction_events`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`thread_id`) REFERENCES `interaction_threads`(`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `interaction_notes_user_created_at_idx`
  ON `interaction_notes` (`user_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `interaction_notes_user_type_idx`
  ON `interaction_notes` (`user_id`, `note_type`);
CREATE INDEX IF NOT EXISTS `interaction_notes_event_idx`
  ON `interaction_notes` (`event_id`);
CREATE INDEX IF NOT EXISTS `interaction_notes_thread_idx`
  ON `interaction_notes` (`thread_id`);

CREATE TABLE IF NOT EXISTS `interaction_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `event_id` text,
  `thread_id` text,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'candidate' NOT NULL,
  `due_at` integer,
  `assignee_name` text,
  `requester_name` text,
  `source_event_ids` text DEFAULT '[]' NOT NULL,
  `confidence` integer DEFAULT 50 NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`event_id`) REFERENCES `interaction_events`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`thread_id`) REFERENCES `interaction_threads`(`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `interaction_tasks_user_status_idx`
  ON `interaction_tasks` (`user_id`, `status`);
CREATE INDEX IF NOT EXISTS `interaction_tasks_user_created_at_idx`
  ON `interaction_tasks` (`user_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `interaction_tasks_event_idx`
  ON `interaction_tasks` (`event_id`);
CREATE INDEX IF NOT EXISTS `interaction_tasks_thread_idx`
  ON `interaction_tasks` (`thread_id`);

CREATE TABLE IF NOT EXISTS `interaction_memories` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `memory_type` text NOT NULL,
  `subject` text NOT NULL,
  `content` text NOT NULL,
  `status` text DEFAULT 'candidate' NOT NULL,
  `confidence` integer DEFAULT 50 NOT NULL,
  `tags` text DEFAULT '[]' NOT NULL,
  `source_event_ids` text DEFAULT '[]' NOT NULL,
  `last_verified_at` integer,
  `expires_at` integer,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `interaction_memories_user_status_idx`
  ON `interaction_memories` (`user_id`, `status`);
CREATE INDEX IF NOT EXISTS `interaction_memories_user_subject_idx`
  ON `interaction_memories` (`user_id`, `subject`);
CREATE INDEX IF NOT EXISTS `interaction_memories_user_type_idx`
  ON `interaction_memories` (`user_id`, `memory_type`);
