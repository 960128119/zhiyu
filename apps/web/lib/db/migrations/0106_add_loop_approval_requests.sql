-- Add persistent loop approval requests.

CREATE TABLE IF NOT EXISTS "loop_approval_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "loop_id" uuid NOT NULL,
  "loop_run_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "source" varchar(30) DEFAULT 'tool_gate' NOT NULL,
  "action_name" varchar(255) NOT NULL,
  "capability" varchar(50),
  "reason" text,
  "message" text,
  "tool_input" jsonb,
  "action_payload" jsonb,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "resolution_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loop_approval_requests" ADD CONSTRAINT "loop_approval_requests_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loop_approval_requests" ADD CONSTRAINT "loop_approval_requests_loop_run_id_loop_runs_id_fk" FOREIGN KEY ("loop_run_id") REFERENCES "public"."loop_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loop_approval_requests" ADD CONSTRAINT "loop_approval_requests_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loop_approval_requests" ADD CONSTRAINT "loop_approval_requests_resolved_by_User_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_approval_requests_user_status_idx" ON "loop_approval_requests" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_approval_requests_loop_idx" ON "loop_approval_requests" USING btree ("loop_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_approval_requests_run_idx" ON "loop_approval_requests" USING btree ("loop_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_approval_requests_created_at_idx" ON "loop_approval_requests" USING btree ("created_at");
