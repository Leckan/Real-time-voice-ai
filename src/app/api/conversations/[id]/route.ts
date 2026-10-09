import { z } from "zod";
import { withUser } from "@/lib/auth/current-user";
import { isSafeId } from "@/lib/id";
import { getStore } from "@/lib/store";

const renameSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return withUser(async ({ user }) => {
    const { id } = await context.params;
    if (!isSafeId(id)) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    const store = getStore();
    const conversation = await store.getConversation(user.id, id);
    if (!conversation) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    const messages = await store.listMessages(user.id, id);
    return Response.json({ conversation, messages });
  });
}

export async function PATCH(request: Request, context: Context) {
  return withUser(async ({ user }) => {
    const { id } = await context.params;
    const parsed = renameSchema.safeParse(await request.json().catch(() => null));
    if (!isSafeId(id) || !parsed.success) {
      return Response.json({ error: "The name could not be saved." }, { status: 400 });
    }
    const conversation = await getStore().renameConversation(user.id, id, parsed.data.title);
    if (!conversation) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    return Response.json(conversation);
  });
}

export async function DELETE(_request: Request, context: Context) {
  return withUser(async ({ user }) => {
    const { id } = await context.params;
    if (!isSafeId(id)) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    const removed = await getStore().deleteConversation(user.id, id);
    if (!removed) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    return Response.json({ ok: true });
  });
}
