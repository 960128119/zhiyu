-- Add interaction understanding tables used to materialize raw events into wiki candidates.

CREATE TABLE IF NOT EXISTS "interaction_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "event_id" uuid REFERENCES "interaction_events"("id") ON DELETE set null,
  "thread_id" uuid REFERENCES "interaction_threads"("id") ON DELETE set null,
  "note_type" varchar(40) NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "model" text,
  "source_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_notes_user_created_at_idx"
  ON "interaction_notes" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_notes_user_type_idx"
  ON "interaction_notes" ("user_id", "note_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_notes_event_idx"
  ON "interaction_notes" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_notes_thread_idx"
  ON "interaction_notes" ("thread_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interaction_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "event_id" uuid REFERENCES "interaction_events"("id") ON DELETE set null,
  "thread_id" uuid REFERENCES "interaction_threads"("id") ON DELETE set null,
  "title" text NOT NULL,
  "description" text,
  "status" varchar(30) DEFAULT 'candidate' NOT NULL,
  "due_at" timestamp with time zone,
  "assignee_name" text,
  "requester_name" text,
  "source_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_tasks_user_status_idx"
  ON "interaction_tasks" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_tasks_user_created_at_idx"
  ON "interaction_tasks" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_tasks_event_idx"
  ON "interaction_tasks" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_tasks_thread_idx"
  ON "interaction_tasks" ("thread_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interaction_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "memory_type" varchar(40) NOT NULL,
  "subject" text NOT NULL,
  "content" text NOT NULL,
  "status" varchar(30) DEFAULT 'candidate' NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_verified_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_memories_user_status_idx"
  ON "interaction_memories" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_memories_user_subject_idx"
  ON "interaction_memories" ("user_id", "subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_memories_user_type_idx"
  ON "interaction_memories" ("user_id", "memory_type");
