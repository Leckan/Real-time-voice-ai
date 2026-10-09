import { rateLimit } from "@/lib/auth/rate-limit";
import {
  buildRealtimeSession,
  createRealtimeCall,
  isSameOrigin,
  publicProviderError,
  realtimeModel,
  validateSdp,
} from "@/lib/providers/openai-server";

export type RealtimeRequestBody = {
  sdp?: unknown;
  voice?: string;
  language?: string;
  vadEnabled?: boolean;
  vadEagerness?: string;
  audioEnabled?: boolean;
};

export async function handleRealtimePost(
  request: Request,
  body: RealtimeRequestBody,
  deps: {
    userId: string;
    apiKey: string | null;
    safetyIdentifier: string;
    createCall?: typeof createRealtimeCall;
    limit?: typeof rateLimit;
  },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "This call cannot be started from another site." }, { status: 403 });
  }
  if (!deps.apiKey) {
    return Response.json(
      { error: "Voice is not configured. Add OPENAI_API_KEY on the server." },
      { status: 503 },
    );
  }

  const limit = (deps.limit ?? rateLimit)(`realtime:${deps.userId}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many voice sessions were started. Wait a while and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const sdp = validateSdp(body.sdp);
  if (!sdp) {
    return Response.json({ error: "A valid connection offer is required." }, { status: 400 });
  }

  const session = buildRealtimeSession(body);
  const createCall = deps.createCall ?? createRealtimeCall;
  const result = await createCall({
    apiKey: deps.apiKey,
    sdp,
    session,
    safetyIdentifier: deps.safetyIdentifier,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    sdp: result.sdp,
    model: realtimeModel(),
  });
}

export { publicProviderError };
