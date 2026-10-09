import { describe, expect, it } from "vitest";
import { SESSION_STATES, STATUS_LABELS, transition } from "@/lib/session/machine";

describe("conversation state machine", () => {
  it("follows a normal spoken turn", () => {
    let status = transition("idle", "START");
    status = transition(status, "PERMISSION_GRANTED");
    status = transition(status, "CONNECTED");
    status = transition(status, "SPEECH_STOPPED");
    status = transition(status, "OUTPUT_STARTED");
    status = transition(status, "RESPONSE_COMPLETED");
    expect(status).toBe("listening");
  });

  it("interrupts speech and returns to listening", () => {
    expect(transition("speaking", "INTERRUPT")).toBe("interrupted");
    expect(transition("interrupted", "INTERRUPT_SETTLED")).toBe("listening");
    expect(transition("speaking", "SPEECH_STARTED")).toBe("interrupted");
    expect(transition("interrupted", "SPEECH_STOPPED")).toBe("processing");
  });

  it("reconnects or offers an error", () => {
    expect(transition("listening", "CONNECTION_LOST")).toBe("reconnecting");
    expect(transition("speaking", "CONNECTION_LOST")).toBe("reconnecting");
    expect(transition("reconnecting", "RECONNECTED")).toBe("listening");
    expect(transition("reconnecting", "RECONNECT_FAILED")).toBe("error");
  });

  it("ignores contradictory events", () => {
    expect(transition("idle", "RESPONSE_COMPLETED")).toBe("idle");
    expect(transition("listening", "CONNECTED")).toBe("listening");
    expect(transition("error", "SPEECH_STARTED")).toBe("error");
  });

  it("labels every state", () => {
    for (const state of SESSION_STATES) {
      expect(STATUS_LABELS[state].length).toBeGreaterThan(0);
    }
  });
});
