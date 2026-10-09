import { z } from "zod";
import { withUser } from "@/lib/auth/current-user";
import { isSafeId } from "@/lib/id";
import { getStore } from "@/lib/store";
import { storageAudio } from "@/lib/store/types";

const messageSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(16_000),
  status: z.enum(["streaming", "completed", "interrupted", "error"]),
  providerResponseId: z.string().max(120).nullable().optional(),
  audioMime: z.string().max(80).nullable().optional(),
  audioByteLength: z.number().int().min(0).max(50_000_000).nullable().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return withUser(async ({ user, settings }) => {
    const { id } = await context.params;
    if (!isSafeId(id)) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    const parsed = messageSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "The message could not be saved." }, { status: 400 });
    const audio = storageAudio(
      settings.retainAudio,
      parsed.data.audioByteLength,
      parsed.data.audioMime,
    );
    const message = await getStore().upsertMessage(user.id, id, {
      id: parsed.data.id,
      conversationId: id,
      role: parsed.data.role,
      text: parsed.data.text,
      status: parsed.data.status,
      providerResponseId: parsed.data.providerResponseId ?? null,
      audioMime: audio.audioMime,
      audioByteLength: audio.audioByteLength,
      createdAt: parsed.data.createdAt ?? new Date().toISOString(),
      completedAt: parsed.data.completedAt ?? null,
    });
    if (!message) return Response.json({ error: "That conversation could not be found." }, { status: 404 });
    return Response.json(message);
  });
}
