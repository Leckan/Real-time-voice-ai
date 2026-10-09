import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { levelFromTimeDomain } from "@/lib/audio/levels";
import { toPublicMetrics, emptyMetrics } from "@/lib/telemetry";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("client secret boundary", () => {
  it("does not put the provider key in browser code", () => {
    const paths = [
      ...files("src/components"),
      ...files("src/hooks"),
      "src/lib/providers/openai-realtime.ts",
    ];
    const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_OPENAI");
    expect(source).not.toMatch(/sk-[A-Za-z0-9]/);
  });
});

describe("telemetry", () => {
  it("keeps only numeric session timings", () => {
    const metrics = toPublicMetrics({
      ...emptyMetrics(),
      connectionMs: 1200.4,
      connectionAttempts: 2,
      speechEndToFirstTextMs: Number.NaN,
    });
    expect(metrics.connectionMs).toBe(1200);
    expect(metrics.speechEndToFirstTextMs).toBeNull();
    expect(Object.values(metrics).every((value) => value === null || typeof value === "number")).toBe(true);
  });

  it("raises the level for a louder signal", () => {
    const silence = levelFromTimeDomain(new Uint8Array(32).fill(128));
    const loud = levelFromTimeDomain(Uint8Array.from({ length: 32 }, (_, index) => (index % 2 ? 255 : 0)));
    expect(silence).toBe(0);
    expect(loud).toBeGreaterThan(silence);
  });
});
