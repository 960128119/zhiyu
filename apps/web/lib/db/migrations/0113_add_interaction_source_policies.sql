-- Store per-user source policies for long-running interaction ingestion.

CREATE TABLE IF NOT EXISTS "interaction_source_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "platform" varchar(40) NOT NULL,
  "source_id" text NOT NULL,
  "source_name" text NOT NULL,
  "source_type" varchar(40) DEFAULT 'unknown' NOT NULL,
  "policy" varchar(30) DEFAULT 'sync' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "last_seen_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interaction_source_policies_user_platform_source_idx"
  ON "interaction_source_policies" ("user_id", "platform", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_source_policies_user_platform_policy_idx"
  ON "interaction_source_policies" ("user_id", "platform", "policy");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_source_policies_user_updated_at_idx"
  ON "interaction_source_policies" ("user_id", "updated_at");
