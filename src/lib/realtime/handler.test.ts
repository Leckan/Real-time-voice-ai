import { describe, expect, it } from "vitest";
import {
  buildRealtimeSession,
  createRealtimeCall,
  publicProviderError,
  validateSdp,
} from "@/lib/providers/openai-server";
import { handleRealtimePost } from "@/lib/realtime/handler";

const offer = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n";

describe("realtime session credentials", () => {
  it("sends the API key only to OpenAI and returns the SDP answer", async () => {
    let authorization = "";
    let contentType = "";
    let forwarded = "";
    const result = await createRealtimeCall({
      apiKey: "sk-test-secret-key",
      sdp: offer,
      session: { type: "realtime" },
      safetyIdentifier: "abc",
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        authorization = headers.get("authorization") ?? "";
        contentType = headers.get("content-type") ?? "";
        forwarded = new TextDecoder().decode(init?.body as Uint8Array);
        return new Response("v=0\r\nanswer", { status: 200 });
      },
    });
    expect(authorization).toBe("Bearer sk-test-secret-key");
    expect(contentType).toContain("multipart/form-data");
    expect(forwarded).toContain(offer);
    expect(forwarded).toContain('"type":"realtime"');
    expect(result).toEqual({ sdp: "v=0\r\nanswer" });
    expect(JSON.stringify(result)).not.toContain("sk-test-secret-key");
  });

  it("strips secrets from provider errors", () => {
    const message = publicProviderError(400, JSON.stringify({ error: { message: "bad key sk-live-secret and ek_secret" } }));
    expect(message).not.toContain("sk-live-secret");
    expect(message).not.toContain("ek_secret");
  });

  it("rejects a missing key without creating a call", async () => {
    let called = false;
    const response = await handleRealtimePost(
      new Request("http://localhost:3000/api/realtime/session", { headers: { origin: "http://localhost:3000", host: "localhost:3000" } }),
      { sdp: offer },
      {
        userId: "usr_12345678",
        apiKey: null,
        safetyIdentifier: "hash",
        createCall: async () => {
          called = true;
          return { sdp: offer };
        },
        limit: () => ({ ok: true, retryAfterMs: 0 }),
      },
    );
    expect(response.status).toBe(503);
    expect(called).toBe(false);
    expect(await response.text()).not.toContain("sk-");
  });

  it("does not echo the API key in a successful response", async () => {
    const response = await handleRealtimePost(
      new Request("http://localhost:3000/api/realtime/session", { headers: { origin: "http://localhost:3000", host: "localhost:3000" } }),
      { sdp: offer, voice: "not-a-voice" },
      {
        userId: "usr_12345678",
        apiKey: "sk-server-only",
        safetyIdentifier: "hash",
        createCall: async () => ({ sdp: "v=0\r\nanswer" }),
        limit: () => ({ ok: true, retryAfterMs: 0 }),
      },
    );
    const body = await response.json();
    expect(body.sdp).toContain("v=0");
    expect(JSON.stringify(body)).not.toContain("sk-server-only");
  });

  it("builds a session without embedding credentials", () => {
    const session = buildRealtimeSession({ voice: "nope", vadEnabled: false, audioEnabled: false });
    expect(session.audio.output.voice).toBe("marin");
    expect(session.audio.input.turn_detection).toBeNull();
    expect(session.output_modalities).toEqual(["text"]);
    expect(JSON.stringify(session)).not.toMatch(/sk-|OPENAI_API_KEY/);
    expect(validateSdp("hello")).toBeNull();
    expect(validateSdp("v=0\r\no=- 1 1 IN IP4 127.0.0.1")).toMatch(/\r\n$/);
  });
});
