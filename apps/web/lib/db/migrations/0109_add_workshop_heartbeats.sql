-- Add heartbeat scheduling state for Work Workshops.

CREATE TABLE IF NOT EXISTS "workshop_heartbeats" (
  "workshop_id" uuid PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "mode" varchar(30) DEFAULT 'suggested' NOT NULL,
  "next_wakeup_at" timestamp with time zone,
  "last_wakeup_at" timestamp with time zone,
  "last_heartbeat_at" timestamp with time zone,
  "scheduler_status" varchar(30) DEFAULT 'idle' NOT NULL,
  "scheduler_error" text,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "lease_until" timestamp with time zone,
  "heartbeat_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_heartbeats" ADD CONSTRAINT "workshop_heartbeats_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_heartbeats_enabled_next_wakeup_idx" ON "workshop_heartbeats" USING btree ("enabled", "next_wakeup_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_heartbeats_status_idx" ON "workshop_heartbeats" USING btree ("scheduler_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_heartbeats_lease_idx" ON "workshop_heartbeats" USING btree ("lease_until");
