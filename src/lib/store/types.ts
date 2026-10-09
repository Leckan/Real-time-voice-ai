import type { VadEagerness, VoiceName, LanguageCode } from "@/lib/config";

export type StoredUser = {
  id: string;
  email: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredSettings = {
  id: string;
  userId: string;
  preferredVoice: VoiceName;
  preferredLanguage: LanguageCode;
  audioEnabled: boolean;
  autoplayEnabled: boolean;
  transcriptEnabled: boolean;
  vadEnabled: boolean;
  vadEagerness: VadEagerness;
  volume: number;
  theme: "dark" | "light";
  retainAudio: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredConversation = {
  id: string;
  userId: string;
  title: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "completed" | "interrupted" | "error";
  providerResponseId: string | null;
  audioMime: string | null;
  audioByteLength: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type SettingsPatch = Partial<
  Pick<
    StoredSettings,
    | "preferredVoice"
    | "preferredLanguage"
    | "audioEnabled"
    | "autoplayEnabled"
    | "transcriptEnabled"
    | "vadEnabled"
    | "vadEagerness"
    | "volume"
    | "theme"
    | "retainAudio"
  >
> & { displayName?: string; email?: string | null };

export function storageAudio(
  retainAudio: boolean,
  audioByteLength: number | null | undefined,
  audioMime: string | null | undefined,
) {
  if (!retainAudio || !audioByteLength || audioByteLength < 1) {
    return { audioMime: null, audioByteLength: null };
  }
  return {
    audioMime: audioMime || "audio/webm",
    audioByteLength,
  };
}

export interface ConversationStore {
  ensureUser(userId: string): Promise<{ user: StoredUser; settings: StoredSettings }>;
  updateSettings(
    userId: string,
    patch: SettingsPatch,
  ): Promise<{ user: StoredUser; settings: StoredSettings } | null>;
  listConversations(userId: string): Promise<StoredConversation[]>;
  createConversation(
    userId: string,
    input: { id: string; mode: "voice" | "text" },
  ): Promise<StoredConversation>;
  getConversation(userId: string, conversationId: string): Promise<StoredConversation | null>;
  renameConversation(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<StoredConversation | null>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  resetConversation(userId: string, conversationId: string): Promise<boolean>;
  listMessages(userId: string, conversationId: string): Promise<StoredMessage[] | null>;
  upsertMessage(
    userId: string,
    conversationId: string,
    message: StoredMessage,
  ): Promise<StoredMessage | null>;
  deleteMessage(userId: string, conversationId: string, messageId: string): Promise<boolean>;
}
