-- Add trend-following outcome samples linked to immutable state snapshots.

CREATE TABLE IF NOT EXISTS `quant_trend_strategy_samples` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `snapshot_id` text NOT NULL,
  `source_event_id` text,
  `code` text NOT NULL,
  `name` text,
  `trade_date` text,
  `lifecycle_state` text NOT NULL,
  `trend_phase` text,
  `control_action` text,
  `observed_price` real,
  `observed_at` integer NOT NULL,
  `evaluation_at` integer,
  `latest_price` real,
  `return_pct` real,
  `horizon_days` integer DEFAULT 0 NOT NULL,
  `holding_quantity` integer DEFAULT 0 NOT NULL,
  `realized_pnl` real DEFAULT 0 NOT NULL,
  `outcome_status` text DEFAULT 'open' NOT NULL,
  `exit_reason` text,
  `result` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`snapshot_id`) REFERENCES `quant_trend_state_snapshots`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `quant_trend_strategy_samples_snapshot_idx`
  ON `quant_trend_strategy_samples` (`snapshot_id`);
CREATE INDEX IF NOT EXISTS `quant_trend_strategy_samples_workshop_code_observed_at_idx`
  ON `quant_trend_strategy_samples` (`workshop_id`, `code`, `observed_at`);
CREATE INDEX IF NOT EXISTS `quant_trend_strategy_samples_workshop_outcome_idx`
  ON `quant_trend_strategy_samples` (`workshop_id`, `outcome_status`);
