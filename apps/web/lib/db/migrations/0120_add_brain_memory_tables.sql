CREATE TABLE IF NOT EXISTS "brain_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "source_type" varchar(60) NOT NULL,
  "source_id" text NOT NULL,
  "source_event_id" text,
  "observed_at" timestamp with time zone NOT NULL,
  "content" text NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "trust_level" varchar(30) DEFAULT 'raw' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_observations_user_observed_idx"
  ON "brain_observations" ("user_id", "observed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brain_observations_source_unique_idx"
  ON "brain_observations" ("user_id", "source_type", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_observations_content_hash_idx"
  ON "brain_observations" ("user_id", "content_hash");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "brain_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "scope_type" varchar(40) NOT NULL,
  "scope_id" text,
  "owner_type" varchar(40) NOT NULL,
  "owner_id" text NOT NULL,
  "memory_type" varchar(40) NOT NULL,
  "subject" text NOT NULL,
  "content" text NOT NULL,
  "status" varchar(30) DEFAULT 'candidate' NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "supersedes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_memories_user_scope_status_idx"
  ON "brain_memories" ("user_id", "scope_type", "scope_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_memories_owner_idx"
  ON "brain_memories" ("user_id", "owner_type", "owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_memories_subject_idx"
  ON "brain_memories" ("user_id", "memory_type", "subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_memories_updated_idx"
  ON "brain_memories" ("user_id", "updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "brain_memory_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "memory_id" uuid NOT NULL REFERENCES "brain_memories"("id") ON DELETE cascade,
  "reviewer_type" varchar(40) NOT NULL,
  "reviewer_id" text,
  "decision" varchar(30) NOT NULL,
  "reason" text,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_memory_reviews_memory_idx"
  ON "brain_memory_reviews" ("memory_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_memory_reviews_user_created_idx"
  ON "brain_memory_reviews" ("user_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "brain_state_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "scope_type" varchar(40) NOT NULL,
  "scope_id" text,
  "snapshot_type" varchar(40) NOT NULL,
  "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_memory_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_state_snapshots_scope_created_idx"
  ON "brain_state_snapshots" ("user_id", "scope_type", "scope_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "brain_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "subject_type" varchar(40) NOT NULL,
  "subject_id" text,
  "scope_type" varchar(40) NOT NULL,
  "scope_id" text,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "memory_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reason" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_access_grants_subject_scope_idx"
  ON "brain_access_grants" ("user_id", "subject_type", "subject_id", "scope_type", "scope_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "brain_context_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "requester_type" varchar(40) NOT NULL,
  "requester_id" text,
  "task_intent" text,
  "selected_memory_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "denied" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "omitted" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_context_logs_requester_created_idx"
  ON "brain_context_logs" ("user_id", "requester_type", "requester_id", "created_at");
