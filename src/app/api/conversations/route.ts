import { z } from "zod";
import { withUser } from "@/lib/auth/current-user";
import { createId, isSafeId } from "@/lib/id";
import { getStore } from "@/lib/store";

const createSchema = z.object({
  mode: z.enum(["voice", "text"]),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).optional(),
});

export async function GET() {
  return withUser(async ({ user }) => {
    const conversations = await getStore().listConversations(user.id);
    return Response.json({ conversations });
  });
}

export async function POST(request: Request) {
  return withUser(async ({ user }) => {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "A conversation could not be created." }, { status: 400 });
    }
    const conversation = await getStore().createConversation(user.id, {
      id: parsed.data.id && isSafeId(parsed.data.id) ? parsed.data.id : createId("con"),
      mode: parsed.data.mode,
    });
    return Response.json(conversation, { status: 201 });
  });
}
