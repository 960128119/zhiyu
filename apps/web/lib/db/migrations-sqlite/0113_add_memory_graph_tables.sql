-- Add memory graph tables for Graph RAG over interaction understanding.

CREATE TABLE IF NOT EXISTS `memory_graph_entities` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `scope` text DEFAULT 'interaction' NOT NULL,
  `source` text DEFAULT 'interaction_processor' NOT NULL,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `entity_type` text DEFAULT 'other' NOT NULL,
  `aliases` text DEFAULT '[]' NOT NULL,
  `description` text,
  `metadata` text DEFAULT '{}' NOT NULL,
  `first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `memory_graph_entities_user_scope_name_idx`
  ON `memory_graph_entities` (`user_id`, `scope`, `entity_type`, `normalized_name`);
CREATE INDEX IF NOT EXISTS `memory_graph_entities_user_scope_type_idx`
  ON `memory_graph_entities` (`user_id`, `scope`, `entity_type`);

CREATE TABLE IF NOT EXISTS `memory_graph_relations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `scope` text DEFAULT 'interaction' NOT NULL,
  `source` text DEFAULT 'interaction_processor' NOT NULL,
  `subject_entity_id` text NOT NULL,
  `object_entity_id` text NOT NULL,
  `relation_type` text NOT NULL,
  `claim` text NOT NULL,
  `claim_hash` text NOT NULL,
  `confidence` integer DEFAULT 60 NOT NULL,
  `evidence_strength` text DEFAULT 'medium' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`subject_entity_id`) REFERENCES `memory_graph_entities`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`object_entity_id`) REFERENCES `memory_graph_entities`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `memory_graph_relations_user_scope_claim_idx`
  ON `memory_graph_relations` (`user_id`, `scope`, `subject_entity_id`, `object_entity_id`, `relation_type`, `claim_hash`);
CREATE INDEX IF NOT EXISTS `memory_graph_relations_user_scope_updated_idx`
  ON `memory_graph_relations` (`user_id`, `scope`, `updated_at`);
CREATE INDEX IF NOT EXISTS `memory_graph_relations_subject_idx`
  ON `memory_graph_relations` (`subject_entity_id`);
CREATE INDEX IF NOT EXISTS `memory_graph_relations_object_idx`
  ON `memory_graph_relations` (`object_entity_id`);

CREATE TABLE IF NOT EXISTS `memory_graph_evidence` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `relation_id` text NOT NULL,
  `source_type` text DEFAULT 'interaction_event' NOT NULL,
  `source_id` text NOT NULL,
  `event_id` text,
  `quote` text,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`relation_id`) REFERENCES `memory_graph_relations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`event_id`) REFERENCES `interaction_events`(`id`) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `memory_graph_evidence_relation_source_idx`
  ON `memory_graph_evidence` (`relation_id`, `source_type`, `source_id`);
CREATE INDEX IF NOT EXISTS `memory_graph_evidence_user_source_idx`
  ON `memory_graph_evidence` (`user_id`, `source_type`, `source_id`);
