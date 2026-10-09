import { withUser } from "@/lib/auth/current-user";
import { isSafeId } from "@/lib/id";
import { getStore } from "@/lib/store";

type Context = { params: Promise<{ id: string; messageId: string }> };

export async function DELETE(_request: Request, context: Context) {
  return withUser(async ({ user }) => {
    const { id, messageId } = await context.params;
    if (!isSafeId(id) || !isSafeId(messageId)) {
      return Response.json({ error: "That message could not be found." }, { status: 404 });
    }
    const removed = await getStore().deleteMessage(user.id, id, messageId);
    if (!removed) return Response.json({ error: "That message could not be found." }, { status: 404 });
    return Response.json({ ok: true });
  });
}
