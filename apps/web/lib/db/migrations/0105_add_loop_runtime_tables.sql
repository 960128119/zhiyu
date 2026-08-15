-- Add first-class Loop Runtime tables.
--
-- Loops are durable goal-driven runtime objects. Scheduled jobs will become one
-- trigger type in a later migration/bridge.

CREATE TABLE IF NOT EXISTS "loops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "goal" text NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "context_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "action_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "verification_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "approval_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "retry_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "escalation_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loop_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "loop_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'running' NOT NULL,
  "trigger_reason" jsonb,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "input_snapshot" jsonb,
  "output_summary" text,
  "verification_result" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loop_states" (
  "loop_id" uuid PRIMARY KEY NOT NULL,
  "current_phase" varchar(50) DEFAULT 'idle' NOT NULL,
  "memory_summary" text,
  "open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_observation" text,
  "next_action" text,
  "blocked_reason" text,
  "state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loops" ADD CONSTRAINT "loops_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loop_runs" ADD CONSTRAINT "loop_runs_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loop_states" ADD CONSTRAINT "loop_states_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loops_user_idx" ON "loops" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loops_status_idx" ON "loops" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loops_user_status_idx" ON "loops" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loops_updated_at_idx" ON "loops" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_runs_loop_idx" ON "loop_runs" USING btree ("loop_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_runs_status_idx" ON "loop_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_runs_started_at_idx" ON "loop_runs" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_runs_loop_started_at_idx" ON "loop_runs" USING btree ("loop_id", "started_at");
