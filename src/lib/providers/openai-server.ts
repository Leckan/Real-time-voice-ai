import { createHash } from "crypto";
import { fetch as undiciFetch } from "undici";
import {
  languageByCode,
  voiceInstructions,
  VAD_EAGERNESS,
  VOICES,
  type VadEagerness,
  type VoiceName,
} from "@/lib/config";

const DEFAULT_REALTIME_URL = "https://api.openai.com/v1/realtime/calls";

export function realtimeEndpoint() {
  return process.env.OPENAI_REALTIME_BASE_URL?.trim() || DEFAULT_REALTIME_URL;
}

export type RealtimeSessionInput = {
  voice?: string;
  language?: string;
  vadEnabled?: boolean;
  vadEagerness?: string;
  audioEnabled?: boolean;
};

export function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.startsWith("NEXT_PUBLIC_")) return null;
  return key;
}

export function realtimeModel() {
  return process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2.1";
}

export function textModel() {
  return process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.4-mini";
}

export function safetyIdentifier(userId: string, secret: string) {
  return createHash("sha256").update(`${secret}:${userId}`).digest("hex");
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function validateSdp(sdp: unknown) {
  if (typeof sdp !== "string") return null;
  const trimmed = sdp.trim();
  if (trimmed.length < 20 || trimmed.length > 100_000) return null;
  if (!trimmed.startsWith("v=")) return null;
  // trim() removes the terminating CRLF. The Realtime parser treats an
  // unterminated last line as an empty offer.
  return trimmed.endsWith("\n") ? trimmed : `${trimmed}\r\n`;
}

export function buildRealtimeSession(input: RealtimeSessionInput) {
  const voice: VoiceName = VOICES.includes(input.voice as VoiceName)
    ? (input.voice as VoiceName)
    : "marin";
  const language = languageByCode(input.language ?? "en");
  const eagerness: VadEagerness = VAD_EAGERNESS.includes(input.vadEagerness as VadEagerness)
    ? (input.vadEagerness as VadEagerness)
    : "medium";
  const vadEnabled = input.vadEnabled !== false;
  const audioEnabled = input.audioEnabled !== false;

  return {
    type: "realtime" as const,
    model: realtimeModel(),
    instructions: voiceInstructions(language.label),
    output_modalities: audioEnabled ? ["audio"] : ["text"],
    audio: {
      input: {
        transcription: {
          model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe",
          language: language.code,
        },
        turn_detection: vadEnabled
          ? { type: "semantic_vad", eagerness }
          : null,
      },
      output: { voice },
    },
  };
}

export function publicProviderError(status: number, body: string) {
  if (status === 401) {
    return "The OpenAI API key was rejected. Check OPENAI_API_KEY on the server.";
  }
  if (status === 429) {
    return "The voice service rate limit or quota was reached. Try again shortly.";
  }
  if (status >= 500) return "The voice service is unavailable right now.";
  const scrubbed = body
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/ek_[A-Za-z0-9_-]+/g, "[redacted]");
  try {
    const json = JSON.parse(scrubbed) as { error?: { message?: string }; message?: string };
    const message = json.error?.message || json.message;
    if (typeof message === "string" && message.trim()) return message.slice(0, 240);
  } catch {
    return "Could not start the voice session.";
  }
  return "Could not start the voice session.";
}

/**
 * Encode the offer as a finished multipart body and send those bytes directly.
 * This keeps the SDP, including its terminating line break, intact on the way to OpenAI.
 */
async function encodeRealtimeCall(sdp: string, session: unknown) {
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));
  const encoded = new Request("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    body: form,
  });
  const contentType = encoded.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    throw new Error("Could not encode the connection offer.");
  }
  return {
    contentType,
    body: new Uint8Array(await encoded.arrayBuffer()),
  };
}

export async function createRealtimeCall(args: {
  apiKey: string;
  sdp: string;
  session: unknown;
  safetyIdentifier: string;
  fetchImpl?: typeof fetch;
}): Promise<{ sdp: string } | { error: string; status: number }> {
  const fetchImpl = args.fetchImpl ?? (undiciFetch as unknown as typeof fetch);
  let encoded: { contentType: string; body: Uint8Array };
  try {
    encoded = await encodeRealtimeCall(args.sdp, args.session);
  } catch {
    return { error: "Could not encode the connection offer.", status: 500 };
  }

  const payload = new TextDecoder().decode(encoded.body);
  if (!payload.includes(args.sdp.slice(0, 12))) {
    return { error: "The connection offer was dropped before it was sent.", status: 500 };
  }

  let response: Response;
  try {
    response = await fetchImpl(realtimeEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": encoded.contentType,
        "OpenAI-Safety-Identifier": args.safetyIdentifier,
      },
      body: encoded.body as unknown as BodyInit,
    });
  } catch {
    return { error: "Could not reach the voice service.", status: 502 };
  }

  const text = await response.text();
  if (!response.ok) {
    const status = response.status === 401 || response.status === 429 ? response.status : 502;
    return { error: publicProviderError(response.status, text), status };
  }
  if (!text.includes("v=")) {
    return { error: "The voice service returned an unexpected response.", status: 502 };
  }
  return { sdp: text };
}
