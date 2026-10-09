import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import {
  SESSION_COOKIE,
  authSecret,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth/session";
import { getStore } from "@/lib/store";
import { createId } from "@/lib/id";

export async function getOrCreateUser() {
  const jar = await cookies();
  const secret = authSecret();
  const existing = jar.get(SESSION_COOKIE)?.value;
  let userId = existing ? verifySession(existing, secret) : null;
  if (!userId) {
    userId = createId("usr");
    jar.set(SESSION_COOKIE, signSession(userId, secret), sessionCookieOptions());
  }
  return getStore().ensureUser(userId);
}

export async function withUser(
  run: (session: Awaited<ReturnType<typeof getOrCreateUser>>) => Promise<Response>,
) {
  try {
    return await run(await getOrCreateUser());
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Error && error.message.includes("AUTH_SECRET")) {
      return Response.json({ error: "Server authentication is not configured." }, { status: 500 });
    }
    console.error("Request failed");
    return Response.json({ error: "The request could not be completed." }, { status: 500 });
  }
}
