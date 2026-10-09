"use client";

import type { SessionStatus } from "@/lib/session/machine";
import { STATUS_LABELS } from "@/lib/session/machine";

export function VoiceOrb({
  status,
  level,
  userSpeaking,
  onStart,
}: {
  status: SessionStatus;
  level: number;
  userSpeaking: boolean;
  onStart: () => void;
}) {
  const state = userSpeaking && status === "listening" ? "listening" : status;
  const style = { ["--level" as string]: String(level) };
  const label = status === "idle" || status === "error" ? "Start call" : STATUS_LABELS[status];

  if (status === "idle" || status === "error") {
    return (
      <button
        type="button"
        className="orb"
        data-state={state}
        style={style}
        onClick={onStart}
        aria-label="Start call"
        data-testid="start-call"
      >
        <span className="orb-ring outer" />
        <span className="orb-ring" />
        <span className="orb-core" />
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <div className="orb" data-state={state} style={style} aria-hidden="true">
      <span className="orb-ring outer" />
      <span className="orb-ring" />
      <span className="orb-core" />
    </div>
  );
}
