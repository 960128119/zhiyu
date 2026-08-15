-- Add trend-following outcome samples linked to immutable state snapshots.

CREATE TABLE IF NOT EXISTS "quant_trend_strategy_samples" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "snapshot_id" uuid NOT NULL,
  "source_event_id" uuid,
  "code" varchar(32) NOT NULL,
  "name" text,
  "trade_date" varchar(20),
  "lifecycle_state" varchar(40) NOT NULL,
  "trend_phase" varchar(40),
  "control_action" varchar(40),
  "observed_price" real,
  "observed_at" timestamp with time zone NOT NULL,
  "evaluation_at" timestamp with time zone,
  "latest_price" real,
  "return_pct" real,
  "horizon_days" integer DEFAULT 0 NOT NULL,
  "holding_quantity" integer DEFAULT 0 NOT NULL,
  "realized_pnl" real DEFAULT 0 NOT NULL,
  "outcome_status" varchar(30) DEFAULT 'open' NOT NULL,
  "exit_reason" text,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quant_trend_strategy_samples" ADD CONSTRAINT "quant_trend_strategy_samples_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quant_trend_strategy_samples" ADD CONSTRAINT "quant_trend_strategy_samples_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."quant_trend_state_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quant_trend_strategy_samples_snapshot_idx"
  ON "quant_trend_strategy_samples" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quant_trend_strategy_samples_workshop_code_observed_at_idx"
  ON "quant_trend_strategy_samples" USING btree ("workshop_id", "code", "observed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quant_trend_strategy_samples_workshop_outcome_idx"
  ON "quant_trend_strategy_samples" USING btree ("workshop_id", "outcome_status");
