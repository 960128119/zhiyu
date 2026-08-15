-- Add memory graph tables for Graph RAG over interaction understanding.

CREATE TABLE IF NOT EXISTS "memory_graph_entities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "scope" varchar(40) DEFAULT 'interaction' NOT NULL,
  "source" varchar(80) DEFAULT 'interaction_processor' NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "entity_type" varchar(40) DEFAULT 'other' NOT NULL,
  "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memory_graph_entities_user_scope_name_idx"
  ON "memory_graph_entities" ("user_id", "scope", "entity_type", "normalized_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_graph_entities_user_scope_type_idx"
  ON "memory_graph_entities" ("user_id", "scope", "entity_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "memory_graph_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "scope" varchar(40) DEFAULT 'interaction' NOT NULL,
  "source" varchar(80) DEFAULT 'interaction_processor' NOT NULL,
  "subject_entity_id" uuid NOT NULL REFERENCES "memory_graph_entities"("id") ON DELETE cascade,
  "object_entity_id" uuid NOT NULL REFERENCES "memory_graph_entities"("id") ON DELETE cascade,
  "relation_type" varchar(60) NOT NULL,
  "claim" text NOT NULL,
  "claim_hash" varchar(64) NOT NULL,
  "confidence" integer DEFAULT 60 NOT NULL,
  "evidence_strength" varchar(20) DEFAULT 'medium' NOT NULL,
  "status" varchar(30) DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memory_graph_relations_user_scope_claim_idx"
  ON "memory_graph_relations" ("user_id", "scope", "subject_entity_id", "object_entity_id", "relation_type", "claim_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_graph_relations_user_scope_updated_idx"
  ON "memory_graph_relations" ("user_id", "scope", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_graph_relations_subject_idx"
  ON "memory_graph_relations" ("subject_entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_graph_relations_object_idx"
  ON "memory_graph_relations" ("object_entity_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "memory_graph_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "relation_id" uuid NOT NULL REFERENCES "memory_graph_relations"("id") ON DELETE cascade,
  "source_type" varchar(60) DEFAULT 'interaction_event' NOT NULL,
  "source_id" text NOT NULL,
  "event_id" uuid REFERENCES "interaction_events"("id") ON DELETE set null,
  "quote" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memory_graph_evidence_relation_source_idx"
  ON "memory_graph_evidence" ("relation_id", "source_type", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_graph_evidence_user_source_idx"
  ON "memory_graph_evidence" ("user_id", "source_type", "source_id");
