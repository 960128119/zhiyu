-- Add durable processing jobs for interaction understanding.

CREATE TABLE IF NOT EXISTS "interaction_processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "event_id" uuid REFERENCES "interaction_events"("id") ON DELETE set null,
  "thread_id" uuid REFERENCES "interaction_threads"("id") ON DELETE set null,
  "event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "processing_mode" varchar(30) DEFAULT 'full' NOT NULL,
  "job_type" varchar(40) DEFAULT 'summarize_thread' NOT NULL,
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_processing_jobs_user_status_scheduled_idx"
  ON "interaction_processing_jobs" ("user_id", "status", "scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_processing_jobs_event_idx"
  ON "interaction_processing_jobs" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_processing_jobs_thread_idx"
  ON "interaction_processing_jobs" ("thread_id");
