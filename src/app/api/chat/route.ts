import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { rateLimit } from "@/lib/auth/rate-limit";
import { withUser } from "@/lib/auth/current-user";
import { languageByCode } from "@/lib/config";
import { handleChatPost, type ChatRequest } from "@/lib/chat/handler";
import { getOpenAIKey, textModel } from "@/lib/providers/openai-server";
import { getStore } from "@/lib/store";

export async function POST(request: Request) {
  return withUser(async ({ user, settings }) => {
    const limited = rateLimit(`chat:${user.id}`, 30, 10 * 60 * 1000);
    if (!limited.ok) {
      return Response.json(
        { error: "Too many messages. Wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
      );
    }

    const body = (await request.json().catch(() => null)) as ChatRequest | null;
    if (!body) return Response.json({ error: "The message could not be read." }, { status: 400 });

    const apiKey = getOpenAIKey();
    return handleChatPost(body, {
      userId: user.id,
      store: getStore(),
      apiKey,
      languageLabel: languageByCode(settings.preferredLanguage).label,
      generate: async function* (args) {
        const openai = createOpenAI({
          apiKey: apiKey ?? "",
          baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
        });
        const result = streamText({
          model: openai.chat(textModel() as "gpt-5.4-mini"),
          system: args.system,
          messages: args.messages,
          maxRetries: 0,
        });
        for await (const chunk of result.textStream) yield chunk;
      },
    });
  });
}
