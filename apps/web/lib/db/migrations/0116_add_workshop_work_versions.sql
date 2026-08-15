-- Add immutable Work configuration version snapshots.

CREATE TABLE IF NOT EXISTS "workshop_work_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL,
  "version" varchar(80) NOT NULL,
  "source" varchar(60) DEFAULT 'manual_update' NOT NULL,
  "change_event_id" uuid,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "patch" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" varchar(60) DEFAULT 'system' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_work_versions" ADD CONSTRAINT "workshop_work_versions_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workshop_work_versions_workshop_version_idx"
  ON "workshop_work_versions" USING btree ("workshop_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_work_versions_workshop_created_at_idx"
  ON "workshop_work_versions" USING btree ("workshop_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_work_versions_change_event_idx"
  ON "workshop_work_versions" USING btree ("change_event_id");
