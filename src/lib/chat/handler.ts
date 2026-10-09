import { textInstructions, languageByCode } from "@/lib/config";
import { isSafeId } from "@/lib/id";
import type { ConversationStore, StoredMessage } from "@/lib/store/types";

export type ChatRequest = {
  conversationId?: string;
  text?: string;
  retry?: boolean;
  userMessageId?: string;
  assistantMessageId?: string;
};

type ModelMessage = { role: "user" | "assistant"; content: string };

export async function handleChatPost(
  body: ChatRequest,
  deps: {
    userId: string;
    store: ConversationStore;
    apiKey: string | null;
    languageLabel: string;
    generate: (args: { system: string; messages: ModelMessage[] }) => AsyncIterable<string>;
  },
) {
  if (!deps.apiKey) {
    return Response.json(
      { error: "Text chat is not configured. Add OPENAI_API_KEY on the server." },
      { status: 503 },
    );
  }
  if (!body.conversationId || !isSafeId(body.conversationId)) {
    return Response.json({ error: "A conversation is required." }, { status: 400 });
  }
  if (!body.assistantMessageId || !isSafeId(body.assistantMessageId)) {
    return Response.json({ error: "A reply id is required." }, { status: 400 });
  }

  const conversation = await deps.store.getConversation(deps.userId, body.conversationId);
  if (!conversation) {
    return Response.json({ error: "That conversation could not be found." }, { status: 404 });
  }

  const settings = await deps.store.ensureUser(deps.userId);
  let history = (await deps.store.listMessages(deps.userId, conversation.id)) ?? [];
  const now = new Date().toISOString();

  if (body.retry) {
    const lastAssistant = [...history].reverse().find((message) => message.role === "assistant");
    if (lastAssistant) {
      await deps.store.deleteMessage(deps.userId, conversation.id, lastAssistant.id);
      history = history.filter((message) => message.id !== lastAssistant.id);
    }
  } else {
    const text = body.text?.trim() ?? "";
    if (!text || text.length > 8000) {
      return Response.json({ error: "Write a message under 8000 characters." }, { status: 400 });
    }
    if (!body.userMessageId || !isSafeId(body.userMessageId)) {
      return Response.json({ error: "A message id is required." }, { status: 400 });
    }
    const userMessage: StoredMessage = {
      id: body.userMessageId,
      conversationId: conversation.id,
      role: "user",
      text,
      status: "completed",
      providerResponseId: null,
      audioMime: null,
      audioByteLength: null,
      createdAt: now,
      completedAt: now,
    };
    const saved = await deps.store.upsertMessage(deps.userId, conversation.id, userMessage);
    if (!saved) {
      return Response.json({ error: "The message could not be saved." }, { status: 400 });
    }
    history = [...history.filter((message) => message.id !== saved.id), saved];
  }

  const latestUser = [...history].reverse().find((message) => message.role === "user" && message.text.trim());
  if (!latestUser) {
    return Response.json({ error: "There is no message to retry." }, { status: 400 });
  }

  const messages: ModelMessage[] = history
    .filter((message) => message.text.trim() && message.status !== "streaming")
    .slice(-40)
    .map((message) => ({
      role: message.role,
      content: message.text.slice(0, 4000),
    }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of deps.generate({
          system: textInstructions(deps.languageLabel || languageByCode(settings.settings.preferredLanguage).label),
          messages,
        })) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        await deps.store.upsertMessage(deps.userId, conversation.id, {
          id: body.assistantMessageId!,
          conversationId: conversation.id,
          role: "assistant",
          text: full,
          status: "completed",
          providerResponseId: null,
          audioMime: null,
          audioByteLength: null,
          createdAt: now,
          completedAt: new Date().toISOString(),
        });
        controller.close();
      } catch {
        await deps.store.upsertMessage(deps.userId, conversation.id, {
          id: body.assistantMessageId!,
          conversationId: conversation.id,
          role: "assistant",
          text: full || "The reply stopped before it finished.",
          status: "error",
          providerResponseId: null,
          audioMime: null,
          audioByteLength: null,
          createdAt: now,
          completedAt: new Date().toISOString(),
        });
        controller.error(new Error("stream failed"));
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
