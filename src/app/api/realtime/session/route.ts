import { withUser } from "@/lib/auth/current-user";
import { authSecret } from "@/lib/auth/session";
import { handleRealtimePost, type RealtimeRequestBody } from "@/lib/realtime/handler";
import { getOpenAIKey, safetyIdentifier } from "@/lib/providers/openai-server";

export async function POST(request: Request) {
  return withUser(async ({ user }) => {
    const body = (await request.json().catch(() => null)) as RealtimeRequestBody | null;
    if (!body) return Response.json({ error: "The connection offer could not be read." }, { status: 400 });
    return handleRealtimePost(request, body, {
      userId: user.id,
      apiKey: getOpenAIKey(),
      safetyIdentifier: safetyIdentifier(user.id, authSecret()),
    });
  });
}
