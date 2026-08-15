-- Persist trend-following state estimates for replay and strategy statistics.

CREATE TABLE IF NOT EXISTS "quant_trend_state_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "run_id" uuid,
  "loop_id" uuid,
  "loop_run_id" uuid,
  "source_event_id" uuid,
  "code" varchar(32) NOT NULL,
  "name" text,
  "trade_date" varchar(20),
  "benchmark_code" varchar(32),
  "lifecycle_state" varchar(40) DEFAULT 'unknown' NOT NULL,
  "trend_phase" varchar(40),
  "trend_score" real,
  "rs_rank" integer,
  "rs_percentile" real,
  "rs_score" real,
  "relative_return_60d" real,
  "trailing_stop" real,
  "hard_stop" real,
  "stop_action" varchar(40),
  "control_action" varchar(40),
  "trade_allowed" boolean DEFAULT false NOT NULL,
  "data_quality_status" varchar(30) DEFAULT 'unknown' NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quant_trend_state_snapshots" ADD CONSTRAINT "quant_trend_state_snapshots_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quant_trend_state_snapshots_workshop_code_created_at_idx"
  ON "quant_trend_state_snapshots" USING btree ("workshop_id", "code", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quant_trend_state_snapshots_workshop_trade_date_idx"
  ON "quant_trend_state_snapshots" USING btree ("workshop_id", "trade_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quant_trend_state_snapshots_source_event_code_idx"
  ON "quant_trend_state_snapshots" USING btree ("source_event_id", "code");
