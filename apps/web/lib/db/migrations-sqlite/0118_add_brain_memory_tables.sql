CREATE TABLE IF NOT EXISTS `brain_observations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_id` text NOT NULL,
  `source_event_id` text,
  `observed_at` integer NOT NULL,
  `content` text NOT NULL,
  `content_hash` text NOT NULL,
  `trust_level` text DEFAULT 'raw' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `brain_observations_user_observed_idx`
  ON `brain_observations` (`user_id`, `observed_at`);
CREATE UNIQUE INDEX IF NOT EXISTS `brain_observations_source_unique_idx`
  ON `brain_observations` (`user_id`, `source_type`, `source_id`);
CREATE INDEX IF NOT EXISTS `brain_observations_content_hash_idx`
  ON `brain_observations` (`user_id`, `content_hash`);

CREATE TABLE IF NOT EXISTS `brain_memories` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `scope_type` text NOT NULL,
  `scope_id` text,
  `owner_type` text NOT NULL,
  `owner_id` text NOT NULL,
  `memory_type` text NOT NULL,
  `subject` text NOT NULL,
  `content` text NOT NULL,
  `status` text DEFAULT 'candidate' NOT NULL,
  `confidence` integer DEFAULT 50 NOT NULL,
  `evidence_refs` text DEFAULT '[]' NOT NULL,
  `tags` text DEFAULT '[]' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `expires_at` integer,
  `supersedes` text DEFAULT '[]' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `brain_memories_user_scope_status_idx`
  ON `brain_memories` (`user_id`, `scope_type`, `scope_id`, `status`);
CREATE INDEX IF NOT EXISTS `brain_memories_owner_idx`
  ON `brain_memories` (`user_id`, `owner_type`, `owner_id`);
CREATE INDEX IF NOT EXISTS `brain_memories_subject_idx`
  ON `brain_memories` (`user_id`, `memory_type`, `subject`);
CREATE INDEX IF NOT EXISTS `brain_memories_updated_idx`
  ON `brain_memories` (`user_id`, `updated_at`);

CREATE TABLE IF NOT EXISTS `brain_memory_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `memory_id` text NOT NULL,
  `reviewer_type` text NOT NULL,
  `reviewer_id` text,
  `decision` text NOT NULL,
  `reason` text,
  `evidence_refs` text DEFAULT '[]' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`memory_id`) REFERENCES `brain_memories`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `brain_memory_reviews_memory_idx`
  ON `brain_memory_reviews` (`memory_id`);
CREATE INDEX IF NOT EXISTS `brain_memory_reviews_user_created_idx`
  ON `brain_memory_reviews` (`user_id`, `created_at`);

CREATE TABLE IF NOT EXISTS `brain_state_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `scope_type` text NOT NULL,
  `scope_id` text,
  `snapshot_type` text NOT NULL,
  `content` text DEFAULT '{}' NOT NULL,
  `source_memory_ids` text DEFAULT '[]' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `brain_state_snapshots_scope_created_idx`
  ON `brain_state_snapshots` (`user_id`, `scope_type`, `scope_id`, `created_at`);

CREATE TABLE IF NOT EXISTS `brain_access_grants` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `subject_type` text NOT NULL,
  `subject_id` text,
  `scope_type` text NOT NULL,
  `scope_id` text,
  `permissions` text DEFAULT '[]' NOT NULL,
  `memory_types` text DEFAULT '[]' NOT NULL,
  `reason` text,
  `expires_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `brain_access_grants_subject_scope_idx`
  ON `brain_access_grants` (`user_id`, `subject_type`, `subject_id`, `scope_type`, `scope_id`);

CREATE TABLE IF NOT EXISTS `brain_context_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `requester_type` text NOT NULL,
  `requester_id` text,
  `task_intent` text,
  `selected_memory_ids` text DEFAULT '[]' NOT NULL,
  `denied` text DEFAULT '[]' NOT NULL,
  `omitted` text DEFAULT '[]' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `brain_context_logs_requester_created_idx`
  ON `brain_context_logs` (`user_id`, `requester_type`, `requester_id`, `created_at`);
