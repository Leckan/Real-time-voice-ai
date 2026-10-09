import { z } from "zod";
import { withUser } from "@/lib/auth/current-user";
import { VAD_EAGERNESS, VOICES } from "@/lib/config";
import { getStore } from "@/lib/store";

const LANGUAGE_CODES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "ja",
  "ko",
  "zh",
  "hi",
  "ar",
] as const;

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  preferredVoice: z.enum(VOICES).optional(),
  preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
  audioEnabled: z.boolean().optional(),
  autoplayEnabled: z.boolean().optional(),
  transcriptEnabled: z.boolean().optional(),
  vadEnabled: z.boolean().optional(),
  vadEagerness: z.enum(VAD_EAGERNESS).optional(),
  volume: z.number().min(0).max(1).optional(),
  theme: z.enum(["dark", "light"]).optional(),
  retainAudio: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  return withUser(async ({ user }) => {
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: "Check the settings and try again." }, { status: 400 });
    }
    const updated = await getStore().updateSettings(user.id, parsed.data);
    if (!updated) return Response.json({ error: "Settings could not be saved." }, { status: 404 });
    return Response.json(updated);
  });
}
