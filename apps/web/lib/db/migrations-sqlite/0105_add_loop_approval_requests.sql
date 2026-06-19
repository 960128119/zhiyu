-- Add persistent loop approval requests.

CREATE TABLE IF NOT EXISTS `loop_approval_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `loop_id` text NOT NULL,
  `loop_run_id` text NOT NULL,
  `user_id` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `source` text DEFAULT 'tool_gate' NOT NULL,
  `action_name` text NOT NULL,
  `capability` text,
  `reason` text,
  `message` text,
  `tool_input` text,
  `action_payload` text,
  `resolved_by` text,
  `resolved_at` integer,
  `resolution_note` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`loop_id`) REFERENCES `loops`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`loop_run_id`) REFERENCES `loop_runs`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`resolved_by`) REFERENCES `User`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loop_approval_requests_user_status_idx` ON `loop_approval_requests` (`user_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loop_approval_requests_loop_idx` ON `loop_approval_requests` (`loop_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loop_approval_requests_run_idx` ON `loop_approval_requests` (`loop_run_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loop_approval_requests_created_at_idx` ON `loop_approval_requests` (`created_at`);
