CREATE TABLE IF NOT EXISTS `quant_trade_plans` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL,
  `run_id` text,
  `loop_id` text,
  `loop_run_id` text,
  `source_event_id` text,
  `plan_date` text NOT NULL,
  `horizon` text DEFAULT 'next_day' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `code` text NOT NULL,
  `name` text,
  `action` text NOT NULL,
  `side` text,
  `quantity` integer,
  `target_price` real,
  `trigger_condition` text NOT NULL,
  `invalidation` text,
  `rationale` text NOT NULL,
  `priority` text DEFAULT 'normal' NOT NULL,
  `execution_status` text DEFAULT 'pending' NOT NULL,
  `order_id` text,
  `blocker_reason` text,
  `completion_note` text,
  `source_decision` text DEFAULT '{}' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `planned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `due_at` integer,
  `executed_at` integer,
  `reviewed_at` integer,
  `superseded_by` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `quant_trade_plans_workshop_plan_date_idx`
  ON `quant_trade_plans` (`workshop_id`, `plan_date`);
CREATE INDEX IF NOT EXISTS `quant_trade_plans_workshop_status_idx`
  ON `quant_trade_plans` (`workshop_id`, `status`, `execution_status`);
CREATE INDEX IF NOT EXISTS `quant_trade_plans_workshop_code_idx`
  ON `quant_trade_plans` (`workshop_id`, `code`, `plan_date`);
