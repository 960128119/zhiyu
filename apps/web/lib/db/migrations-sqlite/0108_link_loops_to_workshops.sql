ALTER TABLE `loops`
  ADD COLUMN `workshop_id` text;

CREATE INDEX IF NOT EXISTS `loops_workshop_idx`
  ON `loops` (`workshop_id`);

CREATE INDEX IF NOT EXISTS `loops_workshop_status_idx`
  ON `loops` (`workshop_id`, `status`);

ALTER TABLE `workshop_events`
  ADD COLUMN `loop_id` text;

ALTER TABLE `workshop_events`
  ADD COLUMN `loop_run_id` text;

CREATE INDEX IF NOT EXISTS `workshop_events_loop_idx`
  ON `workshop_events` (`loop_id`);

CREATE INDEX IF NOT EXISTS `workshop_events_loop_run_idx`
  ON `workshop_events` (`loop_run_id`);
