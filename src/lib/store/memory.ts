import { DEFAULT_SETTINGS } from "@/lib/config";
import { realtimeModel, textModel } from "@/lib/providers/openai-server";
import { createId } from "@/lib/id";
import {
  storageAudio,
  type ConversationStore,
  type SettingsPatch,
  type StoredConversation,
  type StoredMessage,
  type StoredSettings,
  type StoredUser,
} from "@/lib/store/types";

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryStore implements ConversationStore {
  private users = new Map<string, StoredUser>();
  private settings = new Map<string, StoredSettings>();
  private conversations = new Map<string, StoredConversation>();
  private messages = new Map<string, StoredMessage[]>();

  async ensureUser(userId: string) {
    const now = nowIso();
    let user = this.users.get(userId);
    if (!user) {
      user = { id: userId, email: null, name: "Guest", createdAt: now, updatedAt: now };
      this.users.set(userId, user);
    }
    let settings = this.settings.get(userId);
    if (!settings) {
      settings = {
        id: createId("set"),
        userId,
        ...DEFAULT_SETTINGS,
        createdAt: now,
        updatedAt: now,
      };
      this.settings.set(userId, settings);
    }
    return { user: clone(user), settings: clone(settings) };
  }

  async updateSettings(userId: string, patch: SettingsPatch) {
    const current = await this.ensureUser(userId);
    const now = nowIso();
    const { displayName, email, ...settingsPatch } = patch;
    const settings: StoredSettings = {
      ...current.settings,
      ...settingsPatch,
      updatedAt: now,
    };
    const user: StoredUser = {
      ...current.user,
      name: displayName?.trim() || current.user.name,
      email: email === undefined ? current.user.email : email,
      updatedAt: now,
    };
    this.users.set(userId, user);
    this.settings.set(userId, settings);
    return { user: clone(user), settings: clone(settings) };
  }

  async listConversations(userId: string) {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.userId === userId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map(clone);
  }

  async createConversation(userId: string, input: { id: string; mode: "voice" | "text" }) {
    await this.ensureUser(userId);
    const now = nowIso();
    const conversation: StoredConversation = {
      id: input.id,
      userId,
      title: "New conversation",
      provider: "openai",
      model: input.mode === "voice" ? realtimeModel() : textModel(),
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return clone(conversation);
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) return null;
    return clone(conversation);
  }

  async renameConversation(userId: string, conversationId: string, title: string) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) return null;
    conversation.title = title.trim().slice(0, 80);
    conversation.updatedAt = nowIso();
    return clone(conversation);
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) return false;
    this.conversations.delete(conversationId);
    this.messages.delete(conversationId);
    return true;
  }

  async resetConversation(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) return false;
    this.messages.set(conversationId, []);
    conversation.title = "New conversation";
    conversation.updatedAt = nowIso();
    return true;
  }

  async listMessages(userId: string, conversationId: string) {
    if (!(await this.getConversation(userId, conversationId))) return null;
    return (this.messages.get(conversationId) ?? []).map(clone);
  }

  async upsertMessage(userId: string, conversationId: string, message: StoredMessage) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) return null;
    const settings = this.settings.get(userId);
    const audio = storageAudio(
      settings?.retainAudio ?? false,
      message.audioByteLength,
      message.audioMime,
    );
    const stored: StoredMessage = {
      ...message,
      text: message.text.slice(0, 16_000),
      ...audio,
    };
    const list = this.messages.get(conversationId) ?? [];
    const index = list.findIndex((item) => item.id === message.id);
    if (index >= 0) {
      if (list[index].conversationId !== conversationId) return null;
      list[index] = { ...list[index], ...stored, createdAt: list[index].createdAt };
    } else {
      const ownedElsewhere = [...this.messages.entries()].some(
        ([id, items]) => id !== conversationId && items.some((item) => item.id === message.id),
      );
      if (ownedElsewhere) return null;
      list.push(stored);
    }
    this.messages.set(conversationId, list);
    if (conversation.title === "New conversation" && stored.role === "user" && stored.text.trim()) {
      conversation.title = stored.text.trim().replace(/\s+/g, " ").slice(0, 60);
    }
    conversation.updatedAt = nowIso();
    return clone(list.find((item) => item.id === message.id)!);
  }

  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    if (!(await this.getConversation(userId, conversationId))) return false;
    const list = this.messages.get(conversationId) ?? [];
    const next = list.filter((message) => message.id !== messageId);
    if (next.length === list.length) return false;
    this.messages.set(conversationId, next);
    return true;
  }
}
