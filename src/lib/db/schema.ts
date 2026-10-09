import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name").notNull(),
  ...timestamps,
});

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    ...timestamps,
  },
  (table) => [index("conversations_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    text: text("text").notNull(),
    status: text("status").notNull(),
    providerResponseId: text("provider_response_id"),
    // Metadata only. Raw microphone audio and reply bytes are never stored.
    audioMime: text("audio_mime"),
    audioByteLength: integer("audio_byte_length"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const userSettings = pgTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  preferredVoice: text("preferred_voice").notNull(),
  preferredLanguage: text("preferred_language").notNull(),
  audioEnabled: boolean("audio_enabled").notNull().default(true),
  autoplayEnabled: boolean("autoplay_enabled").notNull().default(true),
  transcriptEnabled: boolean("transcript_enabled").notNull().default(true),
  vadEnabled: boolean("vad_enabled").notNull().default(true),
  vadEagerness: text("vad_eagerness").notNull().default("medium"),
  volume: doublePrecision("volume").notNull().default(1),
  theme: text("theme").notNull().default("dark"),
  retainAudio: boolean("retain_audio").notNull().default(false),
  ...timestamps,
});
