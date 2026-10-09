import { describe, expect, it } from "vitest";
import { handleChatPost } from "@/lib/chat/handler";
import { MemoryStore } from "@/lib/store/memory";

async function read(response: Response) {
  return response.text();
}

describe("text chat", () => {
  it("refuses another user's conversation and retries the saved turn", async () => {
    const store = new MemoryStore();
    await store.createConversation("usr_owner", { id: "con_owner1", mode: "text" });
    const missing = await handleChatPost(
      { conversationId: "con_owner1", text: "Hi", userMessageId: "msg_user_01", assistantMessageId: "msg_asst_01" },
      {
        userId: "usr_other",
        store,
        apiKey: "sk-test",
        languageLabel: "English",
        generate: async function* () {
          yield "nope";
        },
      },
    );
    expect(missing.status).toBe(404);

    const response = await handleChatPost(
      { conversationId: "con_owner1", text: "Hi there", userMessageId: "msg_user_01", assistantMessageId: "msg_asst_01" },
      {
        userId: "usr_owner",
        store,
        apiKey: "sk-test",
        languageLabel: "English",
        generate: async function* () {
          yield "Hello";
          yield " there";
        },
      },
    );
    expect(await read(response)).toBe("Hello there");
    const first = await store.listMessages("usr_owner", "con_owner1");
    expect(first?.map((message) => message.text)).toEqual(["Hi there", "Hello there"]);

    const retried = await handleChatPost(
      { conversationId: "con_owner1", retry: true, assistantMessageId: "msg_asst_02" },
      {
        userId: "usr_owner",
        store,
        apiKey: "sk-test",
        languageLabel: "English",
        generate: async function* () {
          throw new Error("upstream");
        },
      },
    );
    await expect(read(retried)).rejects.toThrow();
    const after = await store.listMessages("usr_owner", "con_owner1");
    expect(after?.some((message) => message.id === "msg_asst_01")).toBe(false);
    expect(after?.find((message) => message.id === "msg_asst_02")?.status).toBe("error");
  });

  it("does not call the model without a key", async () => {
    const store = new MemoryStore();
    await store.createConversation("usr_owner", { id: "con_owner1", mode: "text" });
    let called = false;
    const response = await handleChatPost(
      { conversationId: "con_owner1", text: "Hi", userMessageId: "msg_user_01", assistantMessageId: "msg_asst_01" },
      {
        userId: "usr_owner",
        store,
        apiKey: null,
        languageLabel: "English",
        generate: async function* () {
          called = true;
          yield "x";
        },
      },
    );
    expect(response.status).toBe(503);
    expect(called).toBe(false);
  });
});
