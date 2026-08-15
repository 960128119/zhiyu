ALTER TABLE "loops"
  ADD COLUMN IF NOT EXISTS "workshop_id" uuid;

DO $$ BEGIN
  ALTER TABLE "loops"
    ADD CONSTRAINT "loops_workshop_id_workshops_id_fk"
    FOREIGN KEY ("workshop_id")
    REFERENCES "public"."workshops"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "loops_workshop_idx"
  ON "loops" USING btree ("workshop_id");

CREATE INDEX IF NOT EXISTS "loops_workshop_status_idx"
  ON "loops" USING btree ("workshop_id", "status");

ALTER TABLE "workshop_events"
  ADD COLUMN IF NOT EXISTS "loop_id" uuid;

ALTER TABLE "workshop_events"
  ADD COLUMN IF NOT EXISTS "loop_run_id" uuid;

DO $$ BEGIN
  ALTER TABLE "workshop_events"
    ADD CONSTRAINT "workshop_events_loop_id_loops_id_fk"
    FOREIGN KEY ("loop_id")
    REFERENCES "public"."loops"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "workshop_events"
    ADD CONSTRAINT "workshop_events_loop_run_id_loop_runs_id_fk"
    FOREIGN KEY ("loop_run_id")
    REFERENCES "public"."loop_runs"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "workshop_events_loop_idx"
  ON "workshop_events" USING btree ("loop_id");

CREATE INDEX IF NOT EXISTS "workshop_events_loop_run_idx"
  ON "workshop_events" USING btree ("loop_run_id");
