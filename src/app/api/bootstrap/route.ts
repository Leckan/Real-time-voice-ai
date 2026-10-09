import { withUser } from "@/lib/auth/current-user";
import { getStore } from "@/lib/store";

export async function GET() {
  return withUser(async ({ user, settings }) => {
    const store = getStore();
    const conversations = await store.listConversations(user.id);
    const latest = conversations[0];
    const messages = latest ? await store.listMessages(user.id, latest.id) : [];
    return Response.json({
      user,
      settings,
      conversations,
      active: latest ? { conversation: latest, messages } : null,
    });
  });
}
