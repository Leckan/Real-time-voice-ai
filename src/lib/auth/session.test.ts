import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session";
import { rateLimit, resetRateLimits } from "@/lib/auth/rate-limit";

describe("session credentials", () => {
  it("round-trips a user id and rejects tampering", () => {
    const token = signSession("usr_12345678", "test-secret-value");
    expect(verifySession(token, "test-secret-value")).toBe("usr_12345678");
    expect(verifySession(token, "other-secret-value")).toBeNull();
    expect(verifySession(`${token}x`, "test-secret-value")).toBeNull();
    const [payload, signature] = token.split(".");
    expect(verifySession(`${payload}.${signature.slice(0, -1)}a`, "test-secret-value")).toBeNull();
  });
});

describe("rate limit", () => {
  it("blocks the next request inside the window", () => {
    resetRateLimits();
    expect(rateLimit("chat:user", 2, 1000, 0).ok).toBe(true);
    expect(rateLimit("chat:user", 2, 1000, 10).ok).toBe(true);
    const blocked = rateLimit("chat:user", 2, 1000, 20);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(rateLimit("chat:user", 2, 1000, 2000).ok).toBe(true);
  });
});
