CREATE TABLE IF NOT EXISTS "quant_trade_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "run_id" uuid,
  "loop_id" uuid,
  "loop_run_id" uuid,
  "source_event_id" uuid,
  "plan_date" varchar(20) NOT NULL,
  "horizon" varchar(40) DEFAULT 'next_day' NOT NULL,
  "status" varchar(30) DEFAULT 'active' NOT NULL,
  "code" varchar(32) NOT NULL,
  "name" text,
  "action" varchar(40) NOT NULL,
  "side" varchar(12),
  "quantity" integer,
  "target_price" real,
  "trigger_condition" text NOT NULL,
  "invalidation" text,
  "rationale" text NOT NULL,
  "priority" varchar(20) DEFAULT 'normal' NOT NULL,
  "execution_status" varchar(30) DEFAULT 'pending' NOT NULL,
  "order_id" text,
  "blocker_reason" text,
  "completion_note" text,
  "source_decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "planned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "due_at" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "superseded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "quant_trade_plans"
    ADD CONSTRAINT "quant_trade_plans_workshop_id_workshops_id_fk"
    FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "quant_trade_plans_workshop_plan_date_idx"
  ON "quant_trade_plans" ("workshop_id", "plan_date");
CREATE INDEX IF NOT EXISTS "quant_trade_plans_workshop_status_idx"
  ON "quant_trade_plans" ("workshop_id", "status", "execution_status");
CREATE INDEX IF NOT EXISTS "quant_trade_plans_workshop_code_idx"
  ON "quant_trade_plans" ("workshop_id", "code", "plan_date");
