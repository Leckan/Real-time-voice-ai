export const SESSION_STATES = [
  "idle",
  "requesting_permission",
  "connecting",
  "listening",
  "processing",
  "speaking",
  "interrupted",
  "reconnecting",
  "ending",
  "error",
] as const;

export type SessionStatus = (typeof SESSION_STATES)[number];

export const MACHINE_EVENTS = [
  "START",
  "PERMISSION_GRANTED",
  "PERMISSION_DENIED",
  "CONNECTED",
  "CONNECT_FAILED",
  "SPEECH_STARTED",
  "SPEECH_STOPPED",
  "RESPONSE_CREATED",
  "OUTPUT_STARTED",
  "RESPONSE_COMPLETED",
  "INTERRUPT",
  "INTERRUPT_SETTLED",
  "CONNECTION_LOST",
  "RECONNECTED",
  "RECONNECT_FAILED",
  "FAIL",
  "END",
  "ENDED",
  "RETRY",
  "RESET",
] as const;

export type MachineEvent = (typeof MACHINE_EVENTS)[number];

const transitions: Record<
  SessionStatus,
  Partial<Record<MachineEvent, SessionStatus>>
> = {
  idle: {
    START: "requesting_permission",
  },
  requesting_permission: {
    PERMISSION_GRANTED: "connecting",
    PERMISSION_DENIED: "error",
    END: "idle",
  },
  connecting: {
    CONNECTED: "listening",
    CONNECT_FAILED: "error",
    FAIL: "error",
    END: "ending",
  },
  listening: {
    SPEECH_STOPPED: "processing",
    RESPONSE_CREATED: "processing",
    OUTPUT_STARTED: "speaking",
    CONNECTION_LOST: "reconnecting",
    FAIL: "error",
    END: "ending",
  },
  processing: {
    OUTPUT_STARTED: "speaking",
    RESPONSE_COMPLETED: "listening",
    SPEECH_STARTED: "interrupted",
    INTERRUPT: "interrupted",
    CONNECTION_LOST: "reconnecting",
    FAIL: "error",
    END: "ending",
  },
  speaking: {
    RESPONSE_COMPLETED: "listening",
    SPEECH_STARTED: "interrupted",
    INTERRUPT: "interrupted",
    CONNECTION_LOST: "reconnecting",
    FAIL: "error",
    END: "ending",
  },
  interrupted: {
    SPEECH_STOPPED: "processing",
    RESPONSE_CREATED: "processing",
    OUTPUT_STARTED: "speaking",
    INTERRUPT_SETTLED: "listening",
    RESPONSE_COMPLETED: "listening",
    CONNECTION_LOST: "reconnecting",
    FAIL: "error",
    END: "ending",
  },
  reconnecting: {
    RECONNECTED: "listening",
    RECONNECT_FAILED: "error",
    FAIL: "error",
    END: "ending",
  },
  ending: {
    ENDED: "idle",
  },
  error: {
    START: "requesting_permission",
    RETRY: "requesting_permission",
    RESET: "idle",
    END: "idle",
  },
};

export function transition(status: SessionStatus, event: MachineEvent): SessionStatus {
  return transitions[status][event] ?? status;
}

export function isCallActive(status: SessionStatus) {
  return (
    status === "connecting" ||
    status === "listening" ||
    status === "processing" ||
    status === "speaking" ||
    status === "interrupted" ||
    status === "reconnecting" ||
    status === "ending" ||
    status === "requesting_permission"
  );
}

export function isTimerRunning(status: SessionStatus) {
  return (
    status === "listening" ||
    status === "processing" ||
    status === "speaking" ||
    status === "interrupted" ||
    status === "reconnecting"
  );
}

export const STATUS_LABELS: Record<SessionStatus, string> = {
  idle: "Ready",
  requesting_permission: "Asking for the microphone",
  connecting: "Connecting",
  listening: "Listening",
  processing: "Thinking",
  speaking: "Speaking",
  interrupted: "Interrupted",
  reconnecting: "Reconnecting",
  ending: "Ending the call",
  error: "Connection problem",
};
