import { withUser } from "@/lib/auth/current-user";
import { isSafeId } from "@/lib/id";
import { getStore } from "@/lib/store";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return withUser(async ({ user }) => {
    const { id } = await context.params;
    if (!isSafeId(id)) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    const reset = await getStore().resetConversation(user.id, id);
    if (!reset) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    return Response.json({ ok: true });
  });
}
