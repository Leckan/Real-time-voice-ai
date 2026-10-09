import { describe, expect, it } from "vitest";
import { mapRealtimeEvent } from "@/lib/providers/map-events";
import { isBenignProviderError, isFatalProviderError } from "@/lib/providers/types";
import { createTurnState, reduceTurn } from "@/lib/session/turn";

const now = () => "2026-10-08T00:00:00.000Z";

describe("provider events", () => {
  it("maps transcripts, audio, and cancellation", () => {
    expect(mapRealtimeEvent({ type: "input_audio_buffer.speech_started" })?.type).toBe("user_speech_started");
    expect(
      mapRealtimeEvent({
        type: "response.output_audio_transcript.delta",
        response_id: "resp_1",
        delta: "Hello",
      }),
    ).toMatchObject({ type: "assistant_text_delta", channel: "audio_transcript", delta: "Hello" });
    expect(
      mapRealtimeEvent({
        type: "response.done",
        response: { id: "resp_1", status: "cancelled", output: [] },
      })?.type,
    ).toBe("assistant_response_interrupted");
    expect(mapRealtimeEvent({ type: "response.output_text.delta", response_id: "resp_2", delta: "Hi" })).toMatchObject({
      channel: "text",
    });
  });

  it("classifies provider failures", () => {
    expect(isFatalProviderError("insufficient_quota", "quota")).toBe(true);
    expect(isBenignProviderError("response_cancel_not_active", "no active response")).toBe(true);
    expect(isFatalProviderError(undefined, "tap play")).toBe(false);
  });
});

describe("turn interruption", () => {
  it("keeps heard text and drops stale deltas", () => {
    let state = createTurnState();
    state = reduceTurn(state, { type: "voice", event: { type: "assistant_response_started", responseId: "resp_1" } }, { now });
    state = reduceTurn(
      state,
      { type: "voice", event: { type: "assistant_text_delta", responseId: "resp_1", delta: "Hello ", channel: "audio_transcript" } },
      { now },
    );
    state = reduceTurn(state, { type: "voice", event: { type: "user_speech_started" } }, { now });
    state = reduceTurn(
      state,
      { type: "voice", event: { type: "assistant_text_delta", responseId: "resp_1", delta: "there", channel: "audio_transcript" } },
      { now },
    );
    expect(state.messages[0]).toMatchObject({ status: "interrupted", text: "Hello " });

    state = reduceTurn(state, { type: "voice", event: { type: "assistant_response_started", responseId: "resp_2" } }, { now });
    state = reduceTurn(
      state,
      { type: "voice", event: { type: "assistant_text_delta", responseId: "resp_2", delta: "Sure", channel: "audio_transcript" } },
      { now },
    );
    expect(state.messages.map((message) => message.text)).toEqual(["Hello ", "Sure"]);
  });

  it("prefers the spoken transcript over a parallel text channel", () => {
    let state = reduceTurn(createTurnState(), {
      type: "voice",
      event: { type: "assistant_response_started", responseId: "resp_1" },
    });
    state = reduceTurn(state, {
      type: "voice",
      event: { type: "assistant_text_delta", responseId: "resp_1", delta: "typed", channel: "text" },
    });
    state = reduceTurn(state, {
      type: "voice",
      event: { type: "assistant_text_delta", responseId: "resp_1", delta: "spoken", channel: "audio_transcript" },
    });
    state = reduceTurn(state, {
      type: "voice",
      event: { type: "assistant_text_delta", responseId: "resp_1", delta: " more typed", channel: "text" },
    });
    expect(state.messages[0].text).toBe("spoken");
  });

  it("completes a user transcript once", () => {
    let state = reduceTurn(createTurnState(), {
      type: "voice",
      event: { type: "input_transcript_delta", itemId: "item_1", delta: "Hel" },
    });
    state = reduceTurn(state, {
      type: "voice",
      event: { type: "input_transcript_completed", itemId: "item_1", transcript: "Hello" },
    });
    state = reduceTurn(state, {
      type: "voice",
      event: { type: "input_transcript_completed", itemId: "item_1", transcript: "Hello" },
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({ role: "user", text: "Hello", status: "completed" });
    expect(state.partialInput).toBe("");
  });
});
