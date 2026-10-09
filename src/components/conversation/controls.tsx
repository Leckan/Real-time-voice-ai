"use client";

import { Mic, MicOff, PhoneOff, Square, Type, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isCallActive, type SessionStatus } from "@/lib/session/machine";

export function Controls({
  status,
  micMuted,
  speakerMuted,
  playbackPaused,
  vadEnabled,
  holding,
  inputMode,
  onStart,
  onEnd,
  onInterrupt,
  onToggleMic,
  onToggleSpeaker,
  onTogglePlayback,
  onToggleInput,
  onHoldStart,
  onHoldEnd,
}: {
  status: SessionStatus;
  micMuted: boolean;
  speakerMuted: boolean;
  playbackPaused: boolean;
  vadEnabled: boolean;
  holding: boolean;
  inputMode: "voice" | "text";
  onStart: () => void;
  onEnd: () => void;
  onInterrupt: () => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onTogglePlayback: () => void;
  onToggleInput: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  const live = isCallActive(status) && status !== "requesting_permission";
  const canInterrupt = status === "speaking" || status === "processing";
  const pushToTalk = live && !vadEnabled && !canInterrupt;

  let primaryLabel = "Start call";
  if (canInterrupt) primaryLabel = "Interrupt";
  else if (pushToTalk) primaryLabel = holding ? "Release to send" : "Hold to talk";
  else if (live) primaryLabel = micMuted ? "Unmute microphone" : "Mute microphone";

  function onPrimary() {
    if (!live) onStart();
    else if (canInterrupt) onInterrupt();
    else if (!pushToTalk) onToggleMic();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-[#1c130c] shadow-[var(--shadow)]"
        aria-label={primaryLabel}
        aria-pressed={live && !canInterrupt ? micMuted || holding : undefined}
        data-testid={canInterrupt ? "interrupt" : "primary-mic"}
        onClick={onPrimary}
        onPointerDown={(event) => {
          if (!pushToTalk) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          onHoldStart();
        }}
        onPointerUp={onHoldEnd}
        onPointerCancel={onHoldEnd}
      >
        {canInterrupt ? <Square size={18} /> : micMuted ? <MicOff size={22} /> : <Mic size={22} />}
      </button>
      <p className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">{primaryLabel}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="danger" size="sm" onClick={onEnd} disabled={!live}>
          <PhoneOff size={14} /> End call
        </Button>
        <Button type="button" size="sm" onClick={onToggleInput} aria-pressed={inputMode === "text"} data-testid="text-toggle">
          <Type size={14} /> {inputMode === "text" ? "Hide typing" : "Type instead"}
        </Button>
        <Button type="button" size="sm" onClick={onToggleSpeaker} aria-pressed={speakerMuted} disabled={!live}>
          {speakerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          {speakerMuted ? "Unmute Auric" : "Mute Auric"}
        </Button>
        <Button type="button" size="sm" onClick={onTogglePlayback} disabled={!live}>
          {playbackPaused ? "Resume" : "Pause"}
        </Button>
      </div>
    </div>
  );
}
