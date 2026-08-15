-- Add heartbeat scheduling state for Work Workshops.

CREATE TABLE IF NOT EXISTS `workshop_heartbeats` (
  `workshop_id` text PRIMARY KEY NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `mode` text DEFAULT 'suggested' NOT NULL,
  `next_wakeup_at` integer,
  `last_wakeup_at` integer,
  `last_heartbeat_at` integer,
  `scheduler_status` text DEFAULT 'idle' NOT NULL,
  `scheduler_error` text,
  `consecutive_failures` integer DEFAULT 0 NOT NULL,
  `lease_until` integer,
  `heartbeat_policy` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `workshop_heartbeats_enabled_next_wakeup_idx`
  ON `workshop_heartbeats` (`enabled`, `next_wakeup_at`);
CREATE INDEX IF NOT EXISTS `workshop_heartbeats_status_idx`
  ON `workshop_heartbeats` (`scheduler_status`);
CREATE INDEX IF NOT EXISTS `workshop_heartbeats_lease_idx`
  ON `workshop_heartbeats` (`lease_until`);
