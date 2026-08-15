-- Add immutable Work configuration version snapshots for SQLite.

CREATE TABLE IF NOT EXISTS `workshop_work_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `version` text NOT NULL,
  `source` text DEFAULT 'manual_update' NOT NULL,
  `change_event_id` text,
  `snapshot` text DEFAULT '{}' NOT NULL,
  `patch` text DEFAULT '{}' NOT NULL,
  `created_by` text DEFAULT 'system' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `workshop_work_versions_workshop_version_idx`
  ON `workshop_work_versions` (`workshop_id`, `version`);
CREATE INDEX IF NOT EXISTS `workshop_work_versions_workshop_created_at_idx`
  ON `workshop_work_versions` (`workshop_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `workshop_work_versions_change_event_idx`
  ON `workshop_work_versions` (`change_event_id`);
