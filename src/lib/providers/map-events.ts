import type { VoiceEvent } from "@/lib/providers/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function responseIdOf(event: Record<string, unknown>) {
  if (typeof event.response_id === "string") return event.response_id;
  if (isRecord(event.response) && typeof event.response.id === "string") return event.response.id;
  return "";
}

function itemIdOf(event: Record<string, unknown>) {
  if (typeof event.item_id === "string") return event.item_id;
  if (isRecord(event.item) && typeof event.item.id === "string") return event.item.id;
  return "";
}

function transcriptFromResponse(response: unknown) {
  if (!isRecord(response) || !Array.isArray(response.output)) return "";
  const parts: string[] = [];
  for (const item of response.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!isRecord(part)) continue;
      if (typeof part.transcript === "string") parts.push(part.transcript);
      else if (typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("");
}

export function mapRealtimeEvent(raw: unknown): VoiceEvent | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;
  const type = raw.type;

  if (type === "session.created") return { type: "session_ready" };
  if (type === "input_audio_buffer.speech_started") return { type: "user_speech_started" };
  if (type === "input_audio_buffer.speech_stopped") return { type: "user_speech_ended" };

  if (type === "conversation.item.input_audio_transcription.delta") {
    return {
      type: "input_transcript_delta",
      itemId: itemIdOf(raw),
      delta: asString(raw.delta),
    };
  }

  if (type === "conversation.item.input_audio_transcription.completed") {
    return {
      type: "input_transcript_completed",
      itemId: itemIdOf(raw),
      transcript: asString(raw.transcript),
    };
  }

  if (type === "response.created") {
    return { type: "assistant_response_started", responseId: responseIdOf(raw) };
  }

  if (
    type === "response.output_audio_transcript.delta" ||
    type === "response.audio_transcript.delta"
  ) {
    return {
      type: "assistant_text_delta",
      responseId: responseIdOf(raw),
      delta: asString(raw.delta),
      channel: "audio_transcript",
    };
  }

  if (type === "response.output_text.delta" || type === "response.text.delta") {
    return {
      type: "assistant_text_delta",
      responseId: responseIdOf(raw),
      delta: asString(raw.delta),
      channel: "text",
    };
  }

  if (
    type === "output_audio_buffer.started" ||
    type === "response.output_audio.delta" ||
    type === "response.audio.delta"
  ) {
    return { type: "assistant_audio_started", responseId: responseIdOf(raw) || null };
  }

  if (type === "response.cancelled" || type === "response.canceled") {
    return { type: "assistant_response_interrupted", responseId: responseIdOf(raw) || null };
  }

  if (type === "response.done") {
    const response = isRecord(raw.response) ? raw.response : raw;
    const status = asString(response.status);
    const id = responseIdOf(raw);
    if (status === "cancelled" || status === "canceled") {
      return { type: "assistant_response_interrupted", responseId: id || null };
    }
    if (status === "failed") {
      const details = isRecord(response.status_details) ? response.status_details : {};
      const error = isRecord(details.error) ? details.error : {};
      return {
        type: "provider_error",
        message: asString(error.message) || "The voice service failed to finish a reply.",
        code: asString(error.code) || undefined,
      };
    }
    return {
      type: "assistant_response_completed",
      responseId: id,
      transcript: transcriptFromResponse(response) || asString(raw.transcript),
    };
  }

  if (type === "error") {
    const error = isRecord(raw.error) ? raw.error : raw;
    const message = asString(error.message) || "The voice service reported an error.";
    return {
      type: "provider_error",
      message: message.slice(0, 240),
      code: asString(error.code) || undefined,
    };
  }

  return null;
}
