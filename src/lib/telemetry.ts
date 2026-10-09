export type PublicMetrics = {
  connectionMs: number | null;
  speechEndToFirstTextMs: number | null;
  speechEndToFirstAudioMs: number | null;
  responseDurationMs: number | null;
  interruptionMs: number | null;
  connectionAttempts: number;
  connectionFailures: number;
  playbackFailures: number;
};

export function emptyMetrics(): PublicMetrics {
  return {
    connectionMs: null,
    speechEndToFirstTextMs: null,
    speechEndToFirstAudioMs: null,
    responseDurationMs: null,
    interruptionMs: null,
    connectionAttempts: 0,
    connectionFailures: 0,
    playbackFailures: 0,
  };
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

export function toPublicMetrics(input: PublicMetrics): PublicMetrics {
  return {
    connectionMs: finite(input.connectionMs),
    speechEndToFirstTextMs: finite(input.speechEndToFirstTextMs),
    speechEndToFirstAudioMs: finite(input.speechEndToFirstAudioMs),
    responseDurationMs: finite(input.responseDurationMs),
    interruptionMs: finite(input.interruptionMs),
    connectionAttempts: finite(input.connectionAttempts) ?? 0,
    connectionFailures: finite(input.connectionFailures) ?? 0,
    playbackFailures: finite(input.playbackFailures) ?? 0,
  };
}
