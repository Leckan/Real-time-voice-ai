import { and, asc, desc, eq } from "drizzle-orm";
import {
  DEFAULT_SETTINGS,
  languageByCode,
  VAD_EAGERNESS,
  VOICES,
  type VadEagerness,
  type VoiceName,
} from "@/lib/config";
import type { Database } from "@/lib/db/client";
import { conversations, messages, userSettings, users } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { realtimeModel, textModel } from "@/lib/providers/openai-server";
import {
  storageAudio,
  type ConversationStore,
  type SettingsPatch,
  type StoredConversation,
  type StoredMessage,
  type StoredSettings,
  type StoredUser,
} from "@/lib/store/types";

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function asVoice(value: string): VoiceName {
  return VOICES.includes(value as VoiceName) ? (value as VoiceName) : "marin";
}

function asEagerness(value: string): VadEagerness {
  return VAD_EAGERNESS.includes(value as VadEagerness) ? (value as VadEagerness) : "medium";
}

function mapUser(row: typeof users.$inferSelect): StoredUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSettings(row: typeof userSettings.$inferSelect): StoredSettings {
  return {
    id: row.id,
    userId: row.userId,
    preferredVoice: asVoice(row.preferredVoice),
    preferredLanguage: languageByCode(row.preferredLanguage).code,
    audioEnabled: row.audioEnabled,
    autoplayEnabled: row.autoplayEnabled,
    transcriptEnabled: row.transcriptEnabled,
    vadEnabled: row.vadEnabled,
    vadEagerness: asEagerness(row.vadEagerness),
    volume: row.volume,
    theme: row.theme === "light" ? "light" : "dark",
    retainAudio: row.retainAudio,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapConversation(row: typeof conversations.$inferSelect): StoredConversation {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMessage(row: typeof messages.$inferSelect): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role === "assistant" ? "assistant" : "user",
    text: row.text,
    status:
      row.status === "streaming" ||
      row.status === "interrupted" ||
      row.status === "error"
        ? row.status
        : "completed",
    providerResponseId: row.providerResponseId,
    audioMime: row.audioMime,
    audioByteLength: row.audioByteLength,
    createdAt: row.createdAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

export class PostgresStore implements ConversationStore {
  constructor(private db: Database) {}

  async ensureUser(userId: string) {
    const now = new Date();
    await this.db.insert(users).values({ id: userId, name: "Guest", email: null, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await this.db
      .insert(userSettings)
      .values({
        id: createId("set"),
        userId,
        preferredVoice: DEFAULT_SETTINGS.preferredVoice,
        preferredLanguage: DEFAULT_SETTINGS.preferredLanguage,
        audioEnabled: DEFAULT_SETTINGS.audioEnabled,
        autoplayEnabled: DEFAULT_SETTINGS.autoplayEnabled,
        transcriptEnabled: DEFAULT_SETTINGS.transcriptEnabled,
        vadEnabled: DEFAULT_SETTINGS.vadEnabled,
        vadEagerness: DEFAULT_SETTINGS.vadEagerness,
        volume: DEFAULT_SETTINGS.volume,
        theme: DEFAULT_SETTINGS.theme,
        retainAudio: DEFAULT_SETTINGS.retainAudio,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const user = await this.requireUser(userId);
    const settings = await this.requireSettings(userId);
    return { user, settings };
  }

  async updateSettings(userId: string, patch: SettingsPatch) {
    await this.ensureUser(userId);
    const now = new Date();
    const current = await this.requireSettings(userId);
    await this.db
      .update(userSettings)
      .set({
        preferredVoice: patch.preferredVoice ?? current.preferredVoice,
        preferredLanguage: patch.preferredLanguage ?? current.preferredLanguage,
        audioEnabled: patch.audioEnabled ?? current.audioEnabled,
        autoplayEnabled: patch.autoplayEnabled ?? current.autoplayEnabled,
        transcriptEnabled: patch.transcriptEnabled ?? current.transcriptEnabled,
        vadEnabled: patch.vadEnabled ?? current.vadEnabled,
        vadEagerness: patch.vadEagerness ?? current.vadEagerness,
        volume: patch.volume ?? current.volume,
        theme: patch.theme ?? current.theme,
        retainAudio: patch.retainAudio ?? current.retainAudio,
        updatedAt: now,
      })
      .where(eq(userSettings.userId, userId));
    if (patch.displayName || patch.email !== undefined) {
      await this.db
        .update(users)
        .set({
          name: patch.displayName?.trim() || undefined,
          email: patch.email === undefined ? undefined : patch.email,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    }
    return { user: await this.requireUser(userId), settings: await this.requireSettings(userId) };
  }

  async listConversations(userId: string) {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
    return rows.map(mapConversation);
  }

  async createConversation(userId: string, input: { id: string; mode: "voice" | "text" }) {
    await this.ensureUser(userId);
    const now = new Date();
    const [row] = await this.db
      .insert(conversations)
      .values({
        id: input.id,
        userId,
        title: "New conversation",
        provider: "openai",
        model: input.mode === "voice" ? realtimeModel() : textModel(),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return mapConversation(row);
  }

  async getConversation(userId: string, conversationId: string) {
    const [row] = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
      .limit(1);
    return row ? mapConversation(row) : null;
  }

  async renameConversation(userId: string, conversationId: string, title: string) {
    const owned = await this.getConversation(userId, conversationId);
    if (!owned) return null;
    const [row] = await this.db
      .update(conversations)
      .set({ title: title.trim().slice(0, 80), updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .returning();
    return mapConversation(row);
  }

  async deleteConversation(userId: string, conversationId: string) {
    const owned = await this.getConversation(userId, conversationId);
    if (!owned) return false;
    await this.db.delete(conversations).where(eq(conversations.id, conversationId));
    return true;
  }

  async resetConversation(userId: string, conversationId: string) {
    const owned = await this.getConversation(userId, conversationId);
    if (!owned) return false;
    await this.db.delete(messages).where(eq(messages.conversationId, conversationId));
    await this.db
      .update(conversations)
      .set({ title: "New conversation", updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    return true;
  }

  async listMessages(userId: string, conversationId: string) {
    if (!(await this.getConversation(userId, conversationId))) return null;
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
    return rows.map(mapMessage);
  }

  async upsertMessage(userId: string, conversationId: string, message: StoredMessage) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;
    const settings = await this.requireSettings(userId);
    const audio = storageAudio(settings.retainAudio, message.audioByteLength, message.audioMime);
    const [existing] = await this.db.select().from(messages).where(eq(messages.id, message.id)).limit(1);
    if (existing && existing.conversationId !== conversationId) return null;
    const completedAt = message.completedAt ? new Date(message.completedAt) : null;
    const values = {
      conversationId,
      role: message.role,
      text: message.text.slice(0, 16_000),
      status: message.status,
      providerResponseId: message.providerResponseId,
      audioMime: audio.audioMime,
      audioByteLength: audio.audioByteLength,
      completedAt,
    };
    if (existing) {
      await this.db.update(messages).set(values).where(eq(messages.id, message.id));
    } else {
      await this.db.insert(messages).values({
        id: message.id,
        createdAt: new Date(message.createdAt),
        ...values,
      });
    }
    const title =
      conversation.title === "New conversation" && message.role === "user" && message.text.trim()
        ? message.text.trim().replace(/\s+/g, " ").slice(0, 60)
        : conversation.title;
    await this.db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    const [row] = await this.db.select().from(messages).where(eq(messages.id, message.id)).limit(1);
    return mapMessage(row);
  }

  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    if (!(await this.getConversation(userId, conversationId))) return false;
    const result = await this.db
      .delete(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .returning({ id: messages.id });
    return result.length > 0;
  }

  private async requireUser(userId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!row) throw new Error("User record was not created.");
    return mapUser(row);
  }

  private async requireSettings(userId: string) {
    const [row] = await this.db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (!row) throw new Error("Settings record was not created.");
    return mapSettings(row);
  }
}
