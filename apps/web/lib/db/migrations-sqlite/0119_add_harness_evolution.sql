CREATE TABLE IF NOT EXISTS `harness_components` (
  `id` text PRIMARY KEY NOT NULL,
  `scope_type` text NOT NULL,
  `scope_id` text DEFAULT 'platform' NOT NULL,
  `component_key` text NOT NULL,
  `component_type` text NOT NULL,
  `source_kind` text NOT NULL,
  `source_ref` text NOT NULL,
  `owner` text NOT NULL,
  `mutability` text NOT NULL,
  `risk_level` text NOT NULL,
  `current_revision_id` text,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `harness_components_scope_key_idx`
  ON `harness_components` (`scope_type`, `scope_id`, `component_key`);
CREATE INDEX IF NOT EXISTS `harness_components_scope_type_idx`
  ON `harness_components` (`scope_type`, `scope_id`, `component_type`);

CREATE TABLE IF NOT EXISTS `harness_component_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `component_id` text NOT NULL REFERENCES `harness_components`(`id`) ON DELETE cascade,
  `revision` integer NOT NULL,
  `schema_version` text DEFAULT 'harness-component.v1' NOT NULL,
  `parent_revision_id` text,
  `content` text DEFAULT '{}' NOT NULL,
  `checksum` text NOT NULL,
  `source_version` text NOT NULL,
  `source_work_version_id` text REFERENCES `workshop_work_versions`(`id`) ON DELETE set null,
  `platform_version` text,
  `created_by` text DEFAULT 'system' NOT NULL,
  `change_proposal_id` text,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `harness_component_revisions_component_revision_idx`
  ON `harness_component_revisions` (`component_id`, `revision`);
CREATE UNIQUE INDEX IF NOT EXISTS `harness_component_revisions_component_checksum_idx`
  ON `harness_component_revisions` (`component_id`, `checksum`);
CREATE INDEX IF NOT EXISTS `harness_component_revisions_proposal_idx`
  ON `harness_component_revisions` (`change_proposal_id`);

CREATE TABLE IF NOT EXISTS `work_harness_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL REFERENCES `workshops`(`id`) ON DELETE cascade,
  `work_version_id` text NOT NULL REFERENCES `workshop_work_versions`(`id`) ON DELETE cascade,
  `platform_version` text NOT NULL,
  `component_set_hash` text NOT NULL,
  `model_runtime` text DEFAULT '{}' NOT NULL,
  `policy_summary` text DEFAULT '{}' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `resolved_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_harness_snapshots_identity_idx`
  ON `work_harness_snapshots` (`workshop_id`, `work_version_id`, `platform_version`, `component_set_hash`);
CREATE INDEX IF NOT EXISTS `work_harness_snapshots_workshop_resolved_idx`
  ON `work_harness_snapshots` (`workshop_id`, `resolved_at`);

CREATE TABLE IF NOT EXISTS `work_harness_snapshot_items` (
  `id` text PRIMARY KEY NOT NULL,
  `snapshot_id` text NOT NULL REFERENCES `work_harness_snapshots`(`id`) ON DELETE cascade,
  `component_id` text NOT NULL REFERENCES `harness_components`(`id`) ON DELETE restrict,
  `revision_id` text NOT NULL REFERENCES `harness_component_revisions`(`id`) ON DELETE restrict,
  `component_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_harness_snapshot_items_snapshot_component_idx`
  ON `work_harness_snapshot_items` (`snapshot_id`, `component_id`);
CREATE INDEX IF NOT EXISTS `work_harness_snapshot_items_revision_idx`
  ON `work_harness_snapshot_items` (`revision_id`);

CREATE TABLE IF NOT EXISTS `work_run_evidence_bundles` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `User`(`id`) ON DELETE cascade,
  `workshop_id` text NOT NULL REFERENCES `workshops`(`id`) ON DELETE cascade,
  `workshop_run_id` text REFERENCES `workshop_runs`(`id`) ON DELETE set null,
  `loop_id` text REFERENCES `loops`(`id`) ON DELETE set null,
  `loop_run_id` text REFERENCES `loop_runs`(`id`) ON DELETE set null,
  `work_version_id` text NOT NULL REFERENCES `workshop_work_versions`(`id`) ON DELETE restrict,
  `harness_snapshot_id` text NOT NULL REFERENCES `work_harness_snapshots`(`id`) ON DELETE restrict,
  `component_set_hash` text NOT NULL,
  `runtime_summary` text DEFAULT '{}' NOT NULL,
  `observation_summary` text DEFAULT '{}' NOT NULL,
  `action_summary` text DEFAULT '{}' NOT NULL,
  `outcome_summary` text DEFAULT '{}' NOT NULL,
  `evidence_refs` text DEFAULT '[]' NOT NULL,
  `capture_status` text DEFAULT 'capturing' NOT NULL,
  `completeness` text DEFAULT 'partial' NOT NULL,
  `warnings` text DEFAULT '[]' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_run_evidence_bundles_loop_run_idx`
  ON `work_run_evidence_bundles` (`loop_run_id`, `harness_snapshot_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `work_run_evidence_bundles_workshop_run_idx`
  ON `work_run_evidence_bundles` (`workshop_run_id`, `harness_snapshot_id`);
CREATE INDEX IF NOT EXISTS `work_run_evidence_bundles_workshop_created_idx`
  ON `work_run_evidence_bundles` (`workshop_id`, `created_at`);

CREATE TABLE IF NOT EXISTS `work_run_diagnostics` (
  `id` text PRIMARY KEY NOT NULL,
  `evidence_bundle_id` text NOT NULL REFERENCES `work_run_evidence_bundles`(`id`) ON DELETE cascade,
  `analyzer_version` text NOT NULL,
  `failure_classes` text DEFAULT '[]' NOT NULL,
  `symptoms` text DEFAULT '[]' NOT NULL,
  `root_cause_candidates` text DEFAULT '[]' NOT NULL,
  `target_component_types` text DEFAULT '[]' NOT NULL,
  `confidence` integer DEFAULT 0 NOT NULL,
  `evidence_refs` text DEFAULT '[]' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE INDEX IF NOT EXISTS `work_run_diagnostics_evidence_idx`
  ON `work_run_diagnostics` (`evidence_bundle_id`);

CREATE TABLE IF NOT EXISTS `work_evaluation_suites` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text REFERENCES `User`(`id`) ON DELETE cascade,
  `owner_type` text NOT NULL,
  `work_role` text NOT NULL,
  `name` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `metric_policy` text DEFAULT '{}' NOT NULL,
  `holdout_policy` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_evaluation_suites_role_version_idx`
  ON `work_evaluation_suites` (`user_id`, `work_role`, `version`);

CREATE TABLE IF NOT EXISTS `work_evaluation_scenarios` (
  `id` text PRIMARY KEY NOT NULL,
  `suite_id` text NOT NULL REFERENCES `work_evaluation_suites`(`id`) ON DELETE cascade,
  `scenario_key` text NOT NULL,
  `name` text NOT NULL,
  `mode` text NOT NULL,
  `tags` text DEFAULT '[]' NOT NULL,
  `risk_tier` text DEFAULT 'normal' NOT NULL,
  `fixture_ref` text NOT NULL,
  `preconditions` text DEFAULT '{}' NOT NULL,
  `task_intent` text NOT NULL,
  `expected_artifacts` text DEFAULT '[]' NOT NULL,
  `hard_invariants` text DEFAULT '[]' NOT NULL,
  `forbidden_actions` text DEFAULT '[]' NOT NULL,
  `metrics` text DEFAULT '[]' NOT NULL,
  `repetitions` integer DEFAULT 1 NOT NULL,
  `timeout_ms` integer DEFAULT 60000 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_evaluation_scenarios_suite_key_idx`
  ON `work_evaluation_scenarios` (`suite_id`, `scenario_key`);

CREATE TABLE IF NOT EXISTS `work_evaluation_campaigns` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL REFERENCES `workshops`(`id`) ON DELETE cascade,
  `suite_id` text NOT NULL REFERENCES `work_evaluation_suites`(`id`) ON DELETE restrict,
  `baseline_work_version_id` text NOT NULL REFERENCES `workshop_work_versions`(`id`) ON DELETE restrict,
  `candidate_work_version_id` text REFERENCES `workshop_work_versions`(`id`) ON DELETE set null,
  `baseline_harness_snapshot_id` text NOT NULL REFERENCES `work_harness_snapshots`(`id`) ON DELETE restrict,
  `candidate_harness_snapshot_id` text NOT NULL REFERENCES `work_harness_snapshots`(`id`) ON DELETE restrict,
  `change_proposal_id` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `runtime_contract` text DEFAULT '{}' NOT NULL,
  `budget` text DEFAULT '{}' NOT NULL,
  `summary` text DEFAULT '{}' NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE INDEX IF NOT EXISTS `work_evaluation_campaigns_workshop_created_idx`
  ON `work_evaluation_campaigns` (`workshop_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `work_evaluation_campaigns_proposal_idx`
  ON `work_evaluation_campaigns` (`change_proposal_id`);

CREATE TABLE IF NOT EXISTS `work_evaluation_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL REFERENCES `work_evaluation_campaigns`(`id`) ON DELETE cascade,
  `scenario_id` text NOT NULL REFERENCES `work_evaluation_scenarios`(`id`) ON DELETE restrict,
  `cohort` text NOT NULL,
  `repetition` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `score` real,
  `metrics` text DEFAULT '{}' NOT NULL,
  `evidence_bundle_id` text REFERENCES `work_run_evidence_bundles`(`id`) ON DELETE set null,
  `error` text,
  `started_at` integer,
  `completed_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_evaluation_runs_campaign_scenario_idx`
  ON `work_evaluation_runs` (`campaign_id`, `scenario_id`, `cohort`, `repetition`);

CREATE TABLE IF NOT EXISTS `work_harness_change_proposals` (
  `id` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL REFERENCES `workshops`(`id`) ON DELETE cascade,
  `scope` text DEFAULT 'work' NOT NULL,
  `affected_work_ids` text DEFAULT '[]' NOT NULL,
  `base_work_version_id` text NOT NULL REFERENCES `workshop_work_versions`(`id`) ON DELETE restrict,
  `base_harness_snapshot_id` text NOT NULL REFERENCES `work_harness_snapshots`(`id`) ON DELETE restrict,
  `base_component_set_hash` text NOT NULL,
  `proposed_by` text NOT NULL,
  `status` text DEFAULT 'proposed' NOT NULL,
  `risk_level` text NOT NULL,
  `failure_pattern` text NOT NULL,
  `evidence_refs` text DEFAULT '[]' NOT NULL,
  `root_cause_hypothesis` text NOT NULL,
  `predicted_fixes` text DEFAULT '[]' NOT NULL,
  `predicted_regressions` text DEFAULT '[]' NOT NULL,
  `success_metrics` text DEFAULT '[]' NOT NULL,
  `evaluation_suite_id` text REFERENCES `work_evaluation_suites`(`id`) ON DELETE set null,
  `evaluation_scenario_ids` text DEFAULT '[]' NOT NULL,
  `evaluation_window` text DEFAULT '{}' NOT NULL,
  `rollback_plan` text DEFAULT '{}' NOT NULL,
  `attribution_limited` integer DEFAULT 0 NOT NULL,
  `expires_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE INDEX IF NOT EXISTS `work_harness_change_proposals_workshop_status_idx`
  ON `work_harness_change_proposals` (`workshop_id`, `status`, `created_at`);

CREATE TABLE IF NOT EXISTS `work_harness_change_items` (
  `id` text PRIMARY KEY NOT NULL,
  `proposal_id` text NOT NULL REFERENCES `work_harness_change_proposals`(`id`) ON DELETE cascade,
  `component_id` text NOT NULL REFERENCES `harness_components`(`id`) ON DELETE restrict,
  `component_type` text NOT NULL,
  `before_revision_id` text NOT NULL REFERENCES `harness_component_revisions`(`id`) ON DELETE restrict,
  `after_revision_id` text REFERENCES `harness_component_revisions`(`id`) ON DELETE set null,
  `patch` text DEFAULT '{}' NOT NULL,
  `rationale` text NOT NULL,
  `group_key` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE INDEX IF NOT EXISTS `work_harness_change_items_proposal_idx`
  ON `work_harness_change_items` (`proposal_id`);

CREATE TABLE IF NOT EXISTS `work_evolution_verdicts` (
  `id` text PRIMARY KEY NOT NULL,
  `proposal_id` text NOT NULL REFERENCES `work_harness_change_proposals`(`id`) ON DELETE cascade,
  `campaign_id` text NOT NULL REFERENCES `work_evaluation_campaigns`(`id`) ON DELETE cascade,
  `status` text NOT NULL,
  `fixed_scenarios` text DEFAULT '[]' NOT NULL,
  `regressed_scenarios` text DEFAULT '[]' NOT NULL,
  `unexpected_changes` text DEFAULT '[]' NOT NULL,
  `prediction_accuracy` text DEFAULT '{}' NOT NULL,
  `recommended_action` text NOT NULL,
  `evidence_refs` text DEFAULT '[]' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_evolution_verdicts_proposal_campaign_idx`
  ON `work_evolution_verdicts` (`proposal_id`, `campaign_id`);
