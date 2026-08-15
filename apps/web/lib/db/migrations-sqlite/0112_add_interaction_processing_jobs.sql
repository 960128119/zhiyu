-- Add durable processing jobs for interaction understanding.

CREATE TABLE IF NOT EXISTS `interaction_processing_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `event_id` text,
  `thread_id` text,
  `event_ids` text DEFAULT '[]' NOT NULL,
  `processing_mode` text DEFAULT 'full' NOT NULL,
  `job_type` text DEFAULT 'summarize_thread' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  `scheduled_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`event_id`) REFERENCES `interaction_events`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`thread_id`) REFERENCES `interaction_threads`(`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `interaction_processing_jobs_user_status_scheduled_idx`
  ON `interaction_processing_jobs` (`user_id`, `status`, `scheduled_at`);
CREATE INDEX IF NOT EXISTS `interaction_processing_jobs_event_idx`
  ON `interaction_processing_jobs` (`event_id`);
CREATE INDEX IF NOT EXISTS `interaction_processing_jobs_thread_idx`
  ON `interaction_processing_jobs` (`thread_id`);
