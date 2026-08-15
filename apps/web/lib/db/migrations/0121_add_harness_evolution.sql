CREATE TABLE IF NOT EXISTS "harness_components" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" varchar(20) NOT NULL,
  "scope_id" text DEFAULT 'platform' NOT NULL,
  "component_key" text NOT NULL,
  "component_type" varchar(40) NOT NULL,
  "source_kind" varchar(30) NOT NULL,
  "source_ref" text NOT NULL,
  "owner" varchar(20) NOT NULL,
  "mutability" varchar(30) NOT NULL,
  "risk_level" varchar(20) NOT NULL,
  "current_revision_id" uuid,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "harness_components_scope_key_idx"
  ON "harness_components" ("scope_type", "scope_id", "component_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "harness_components_scope_type_idx"
  ON "harness_components" ("scope_type", "scope_id", "component_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "harness_component_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "component_id" uuid NOT NULL REFERENCES "harness_components"("id") ON DELETE cascade,
  "revision" integer NOT NULL,
  "schema_version" varchar(40) DEFAULT 'harness-component.v1' NOT NULL,
  "parent_revision_id" uuid,
  "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "checksum" varchar(64) NOT NULL,
  "source_version" text NOT NULL,
  "source_work_version_id" uuid REFERENCES "workshop_work_versions"("id") ON DELETE set null,
  "platform_version" text,
  "created_by" varchar(60) DEFAULT 'system' NOT NULL,
  "change_proposal_id" uuid,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "harness_component_revisions_component_revision_idx"
  ON "harness_component_revisions" ("component_id", "revision");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "harness_component_revisions_component_checksum_idx"
  ON "harness_component_revisions" ("component_id", "checksum");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "harness_component_revisions_proposal_idx"
  ON "harness_component_revisions" ("change_proposal_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_harness_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL REFERENCES "workshops"("id") ON DELETE cascade,
  "work_version_id" uuid NOT NULL REFERENCES "workshop_work_versions"("id") ON DELETE cascade,
  "platform_version" text NOT NULL,
  "component_set_hash" varchar(64) NOT NULL,
  "model_runtime" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "policy_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_harness_snapshots_identity_idx"
  ON "work_harness_snapshots" ("workshop_id", "work_version_id", "platform_version", "component_set_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_harness_snapshots_workshop_resolved_idx"
  ON "work_harness_snapshots" ("workshop_id", "resolved_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_harness_snapshot_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_id" uuid NOT NULL REFERENCES "work_harness_snapshots"("id") ON DELETE cascade,
  "component_id" uuid NOT NULL REFERENCES "harness_components"("id") ON DELETE restrict,
  "revision_id" uuid NOT NULL REFERENCES "harness_component_revisions"("id") ON DELETE restrict,
  "component_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_harness_snapshot_items_snapshot_component_idx"
  ON "work_harness_snapshot_items" ("snapshot_id", "component_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_harness_snapshot_items_revision_idx"
  ON "work_harness_snapshot_items" ("revision_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_run_evidence_bundles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "workshop_id" uuid NOT NULL REFERENCES "workshops"("id") ON DELETE cascade,
  "workshop_run_id" uuid REFERENCES "workshop_runs"("id") ON DELETE set null,
  "loop_id" uuid REFERENCES "loops"("id") ON DELETE set null,
  "loop_run_id" uuid REFERENCES "loop_runs"("id") ON DELETE set null,
  "work_version_id" uuid NOT NULL REFERENCES "workshop_work_versions"("id") ON DELETE restrict,
  "harness_snapshot_id" uuid NOT NULL REFERENCES "work_harness_snapshots"("id") ON DELETE restrict,
  "component_set_hash" varchar(64) NOT NULL,
  "runtime_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "observation_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "action_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "outcome_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "capture_status" varchar(20) DEFAULT 'capturing' NOT NULL,
  "completeness" varchar(20) DEFAULT 'partial' NOT NULL,
  "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_run_evidence_bundles_loop_run_idx"
  ON "work_run_evidence_bundles" ("loop_run_id", "harness_snapshot_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_run_evidence_bundles_workshop_run_idx"
  ON "work_run_evidence_bundles" ("workshop_run_id", "harness_snapshot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_run_evidence_bundles_workshop_created_idx"
  ON "work_run_evidence_bundles" ("workshop_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_run_diagnostics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "evidence_bundle_id" uuid NOT NULL REFERENCES "work_run_evidence_bundles"("id") ON DELETE cascade,
  "analyzer_version" text NOT NULL,
  "failure_classes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "root_cause_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_component_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_run_diagnostics_evidence_idx"
  ON "work_run_diagnostics" ("evidence_bundle_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_evaluation_suites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "public"."User"("id") ON DELETE cascade,
  "owner_type" varchar(20) NOT NULL,
  "work_role" varchar(80) NOT NULL,
  "name" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "metric_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "holdout_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_evaluation_suites_role_version_idx"
  ON "work_evaluation_suites" ("user_id", "work_role", "version");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_evaluation_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "suite_id" uuid NOT NULL REFERENCES "work_evaluation_suites"("id") ON DELETE cascade,
  "scenario_key" text NOT NULL,
  "name" text NOT NULL,
  "mode" varchar(20) NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "risk_tier" varchar(20) DEFAULT 'normal' NOT NULL,
  "fixture_ref" text NOT NULL,
  "preconditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "task_intent" text NOT NULL,
  "expected_artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "hard_invariants" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "forbidden_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "repetitions" integer DEFAULT 1 NOT NULL,
  "timeout_ms" integer DEFAULT 60000 NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_evaluation_scenarios_suite_key_idx"
  ON "work_evaluation_scenarios" ("suite_id", "scenario_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_evaluation_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL REFERENCES "workshops"("id") ON DELETE cascade,
  "suite_id" uuid NOT NULL REFERENCES "work_evaluation_suites"("id") ON DELETE restrict,
  "baseline_work_version_id" uuid NOT NULL REFERENCES "workshop_work_versions"("id") ON DELETE restrict,
  "candidate_work_version_id" uuid REFERENCES "workshop_work_versions"("id") ON DELETE set null,
  "baseline_harness_snapshot_id" uuid NOT NULL REFERENCES "work_harness_snapshots"("id") ON DELETE restrict,
  "candidate_harness_snapshot_id" uuid NOT NULL REFERENCES "work_harness_snapshots"("id") ON DELETE restrict,
  "change_proposal_id" uuid,
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "runtime_contract" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "budget" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_evaluation_campaigns_workshop_created_idx"
  ON "work_evaluation_campaigns" ("workshop_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_evaluation_campaigns_proposal_idx"
  ON "work_evaluation_campaigns" ("change_proposal_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_evaluation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "work_evaluation_campaigns"("id") ON DELETE cascade,
  "scenario_id" uuid NOT NULL REFERENCES "work_evaluation_scenarios"("id") ON DELETE restrict,
  "cohort" varchar(20) NOT NULL,
  "repetition" integer DEFAULT 1 NOT NULL,
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "score" real,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence_bundle_id" uuid REFERENCES "work_run_evidence_bundles"("id") ON DELETE set null,
  "error" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_evaluation_runs_campaign_scenario_idx"
  ON "work_evaluation_runs" ("campaign_id", "scenario_id", "cohort", "repetition");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_harness_change_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workshop_id" uuid NOT NULL REFERENCES "workshops"("id") ON DELETE cascade,
  "scope" varchar(20) DEFAULT 'work' NOT NULL,
  "affected_work_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "base_work_version_id" uuid NOT NULL REFERENCES "workshop_work_versions"("id") ON DELETE restrict,
  "base_harness_snapshot_id" uuid NOT NULL REFERENCES "work_harness_snapshots"("id") ON DELETE restrict,
  "base_component_set_hash" varchar(64) NOT NULL,
  "proposed_by" varchar(30) NOT NULL,
  "status" varchar(30) DEFAULT 'proposed' NOT NULL,
  "risk_level" varchar(20) NOT NULL,
  "failure_pattern" text NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "root_cause_hypothesis" text NOT NULL,
  "predicted_fixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "predicted_regressions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "success_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evaluation_suite_id" uuid REFERENCES "work_evaluation_suites"("id") ON DELETE set null,
  "evaluation_scenario_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evaluation_window" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rollback_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attribution_limited" boolean DEFAULT false NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_harness_change_proposals_workshop_status_idx"
  ON "work_harness_change_proposals" ("workshop_id", "status", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_harness_change_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "proposal_id" uuid NOT NULL REFERENCES "work_harness_change_proposals"("id") ON DELETE cascade,
  "component_id" uuid NOT NULL REFERENCES "harness_components"("id") ON DELETE restrict,
  "component_type" varchar(40) NOT NULL,
  "before_revision_id" uuid NOT NULL REFERENCES "harness_component_revisions"("id") ON DELETE restrict,
  "after_revision_id" uuid REFERENCES "harness_component_revisions"("id") ON DELETE set null,
  "patch" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rationale" text NOT NULL,
  "group_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_harness_change_items_proposal_idx"
  ON "work_harness_change_items" ("proposal_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_evolution_verdicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "proposal_id" uuid NOT NULL REFERENCES "work_harness_change_proposals"("id") ON DELETE cascade,
  "campaign_id" uuid NOT NULL REFERENCES "work_evaluation_campaigns"("id") ON DELETE cascade,
  "status" varchar(20) NOT NULL,
  "fixed_scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "regressed_scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "unexpected_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prediction_accuracy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "recommended_action" varchar(30) NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_evolution_verdicts_proposal_campaign_idx"
  ON "work_evolution_verdicts" ("proposal_id", "campaign_id");
