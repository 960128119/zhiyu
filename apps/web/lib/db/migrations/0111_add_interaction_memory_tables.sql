-- Add interaction memory tables for external message streams such as WeChat.

CREATE TABLE IF NOT EXISTS "interaction_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "platform" varchar(40) NOT NULL,
  "source" varchar(80) NOT NULL,
  "conversation_id" text,
  "conversation_name" text NOT NULL,
  "conversation_type" varchar(30) DEFAULT 'unknown' NOT NULL,
  "sender_id" text,
  "sender_name" text,
  "sender_display_name" text,
  "direction" varchar(20) DEFAULT 'unknown' NOT NULL,
  "content_type" varchar(40) DEFAULT 'unknown' NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "content_preview" text DEFAULT '' NOT NULL,
  "message_time" timestamp with time zone NOT NULL,
  "collected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_message_id" text,
  "source_sequence" text,
  "source_raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "processed_status" varchar(30) DEFAULT 'new' NOT NULL,
  "importance" varchar(30) DEFAULT 'unknown' NOT NULL,
  "requires_reply" boolean,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interaction_events_user_platform_dedupe_idx"
  ON "interaction_events" ("user_id", "platform", "dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_events_user_message_time_idx"
  ON "interaction_events" ("user_id", "message_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_events_user_status_idx"
  ON "interaction_events" ("user_id", "processed_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_events_conversation_idx"
  ON "interaction_events" ("user_id", "platform", "conversation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interaction_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE cascade,
  "platform" varchar(40) NOT NULL,
  "conversation_id" text NOT NULL,
  "conversation_name" text NOT NULL,
  "conversation_type" varchar(30) DEFAULT 'unknown' NOT NULL,
  "last_message_at" timestamp with time zone NOT NULL,
  "last_collected_at" timestamp with time zone NOT NULL,
  "unread_count" integer DEFAULT 0 NOT NULL,
  "pending_reply_count" integer DEFAULT 0 NOT NULL,
  "last_event_id" uuid REFERENCES "interaction_events"("id") ON DELETE set null,
  "summary" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interaction_threads_user_conversation_idx"
  ON "interaction_threads" ("user_id", "platform", "conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_threads_user_last_message_idx"
  ON "interaction_threads" ("user_id", "last_message_at");
