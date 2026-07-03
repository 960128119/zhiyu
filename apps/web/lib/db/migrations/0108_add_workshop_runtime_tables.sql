-- Add Work Workshop runtime tables.

CREATE TABLE IF NOT EXISTS "workshops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "mission" text NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "autonomy_level" varchar(20) DEFAULT 'draft' NOT NULL,
  "boundary_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "model_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'running' NOT NULL,
  "trigger_reason" jsonb,
  "cc_session_id" text,
  "input_snapshot" jsonb,
  "output_summary" text,
  "error" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "run_id" uuid,
  "seq" integer NOT NULL,
  "type" varchar(50) NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "visibility" varchar(20) DEFAULT 'user' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "type" varchar(30) NOT NULL,
  "name" text NOT NULL,
  "uri" text,
  "content" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_directives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "run_id" uuid,
  "content" text NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "scope" varchar(30) DEFAULT 'current_run' NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "kind" varchar(40) NOT NULL,
  "content" text NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "run_id" uuid,
  "channel" varchar(30) DEFAULT 'wechat_desktop' NOT NULL,
  "recipient_name" text,
  "message" text NOT NULL,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "risk_level" varchar(20) DEFAULT 'medium' NOT NULL,
  "source_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "boundary_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshops" ADD CONSTRAINT "workshops_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_runs" ADD CONSTRAINT "workshop_runs_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_events" ADD CONSTRAINT "workshop_events_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_events" ADD CONSTRAINT "workshop_events_run_id_workshop_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workshop_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_sources" ADD CONSTRAINT "workshop_sources_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_directives" ADD CONSTRAINT "workshop_directives_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_directives" ADD CONSTRAINT "workshop_directives_run_id_workshop_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workshop_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_memories" ADD CONSTRAINT "workshop_memories_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_outbox" ADD CONSTRAINT "workshop_outbox_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_outbox" ADD CONSTRAINT "workshop_outbox_run_id_workshop_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workshop_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshops_user_idx" ON "workshops" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshops_user_status_idx" ON "workshops" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshops_updated_at_idx" ON "workshops" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_runs_workshop_idx" ON "workshop_runs" USING btree ("workshop_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_runs_status_idx" ON "workshop_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_runs_started_at_idx" ON "workshop_runs" USING btree ("started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workshop_events_workshop_seq_idx" ON "workshop_events" USING btree ("workshop_id", "seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_events_workshop_created_at_idx" ON "workshop_events" USING btree ("workshop_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_events_run_idx" ON "workshop_events" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_sources_workshop_idx" ON "workshop_sources" USING btree ("workshop_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_sources_type_idx" ON "workshop_sources" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_directives_workshop_status_idx" ON "workshop_directives" USING btree ("workshop_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_directives_run_idx" ON "workshop_directives" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_memories_workshop_kind_idx" ON "workshop_memories" USING btree ("workshop_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_memories_created_at_idx" ON "workshop_memories" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_outbox_workshop_status_idx" ON "workshop_outbox" USING btree ("workshop_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_outbox_run_idx" ON "workshop_outbox" USING btree ("run_id");
