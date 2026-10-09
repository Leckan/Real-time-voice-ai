import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { storageAudio, type StoredMessage } from "@/lib/store/types";

function message(id: string, role: "user" | "assistant", text: string): StoredMessage {
  return {
    id,
    conversationId: "conversation",
    role,
    text,
    status: "completed",
    providerResponseId: null,
    audioMime: "audio/webm",
    audioByteLength: 1200,
    createdAt: "2026-10-08T00:00:00.000Z",
    completedAt: "2026-10-08T00:00:01.000Z",
  };
}

describe("message persistence", () => {
  it("keeps conversations private to their owner", async () => {
    const store = new MemoryStore();
    const conversation = await store.createConversation("usr_owner", { id: "con_owner1", mode: "voice" });
    await store.upsertMessage("usr_owner", conversation.id, message("msg_owner1", "user", "Hello from me"));
    expect(await store.getConversation("usr_other", conversation.id)).toBeNull();
    expect(await store.listMessages("usr_other", conversation.id)).toBeNull();
    expect(await store.deleteConversation("usr_other", conversation.id)).toBe(false);
    expect(await store.listMessages("usr_owner", conversation.id)).toHaveLength(1);
  });

  it("names a conversation from the first user message and can reset it", async () => {
    const store = new MemoryStore();
    const conversation = await store.createConversation("usr_owner", { id: "con_owner1", mode: "text" });
    await store.upsertMessage("usr_owner", conversation.id, message("msg_owner1", "user", "What is a filament?"));
    expect((await store.getConversation("usr_owner", conversation.id))?.title).toBe("What is a filament?");
    expect(await store.resetConversation("usr_owner", conversation.id)).toBe(true);
    expect(await store.listMessages("usr_owner", conversation.id)).toEqual([]);
  });

  it("stores audio size only when retention is enabled", async () => {
    expect(storageAudio(false, 1200, "audio/webm")).toEqual({ audioMime: null, audioByteLength: null });
    const store = new MemoryStore();
    await store.createConversation("usr_owner", { id: "con_owner1", mode: "voice" });
    const hidden = await store.upsertMessage("usr_owner", "con_owner1", message("msg_owner1", "assistant", "Hi"));
    expect(hidden?.audioByteLength).toBeNull();
    await store.updateSettings("usr_owner", { retainAudio: true });
    const kept = await store.upsertMessage("usr_owner", "con_owner1", message("msg_owner2", "assistant", "Again"));
    expect(kept?.audioByteLength).toBe(1200);
    expect(kept?.audioMime).toBe("audio/webm");
  });
});
