CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY,
  "email" text,
  "name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversations_user_updated_idx" ON "conversations" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" text PRIMARY KEY,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "text" text NOT NULL,
  "status" text NOT NULL,
  "provider_response_id" text,
  "audio_mime" text,
  "audio_byte_length" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "preferred_voice" text NOT NULL,
  "preferred_language" text NOT NULL,
  "audio_enabled" boolean NOT NULL DEFAULT true,
  "autoplay_enabled" boolean NOT NULL DEFAULT true,
  "transcript_enabled" boolean NOT NULL DEFAULT true,
  "vad_enabled" boolean NOT NULL DEFAULT true,
  "vad_eagerness" text NOT NULL DEFAULT 'medium',
  "volume" double precision NOT NULL DEFAULT 1,
  "theme" text NOT NULL DEFAULT 'dark',
  "retain_audio" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
