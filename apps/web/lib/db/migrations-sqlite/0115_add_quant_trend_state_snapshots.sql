-- Persist trend-following state estimates for replay and strategy statistics.

CREATE TABLE IF NOT EXISTS `quant_trend_state_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `run_id` text,
  `loop_id` text,
  `loop_run_id` text,
  `source_event_id` text,
  `code` text NOT NULL,
  `name` text,
  `trade_date` text,
  `benchmark_code` text,
  `lifecycle_state` text DEFAULT 'unknown' NOT NULL,
  `trend_phase` text,
  `trend_score` real,
  `rs_rank` integer,
  `rs_percentile` real,
  `rs_score` real,
  `relative_return_60d` real,
  `trailing_stop` real,
  `hard_stop` real,
  `stop_action` text,
  `control_action` text,
  `trade_allowed` integer DEFAULT 0 NOT NULL,
  `data_quality_status` text DEFAULT 'unknown' NOT NULL,
  `snapshot` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `quant_trend_state_snapshots_workshop_code_created_at_idx`
  ON `quant_trend_state_snapshots` (`workshop_id`, `code`, `created_at`);
CREATE INDEX IF NOT EXISTS `quant_trend_state_snapshots_workshop_trade_date_idx`
  ON `quant_trend_state_snapshots` (`workshop_id`, `trade_date`);
CREATE UNIQUE INDEX IF NOT EXISTS `quant_trend_state_snapshots_source_event_code_idx`
  ON `quant_trend_state_snapshots` (`source_event_id`, `code`);
