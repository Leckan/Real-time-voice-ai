export type TextChannel = "audio_transcript" | "text";

export type VoiceEvent =
  | { type: "session_ready" }
  | { type: "connection_established" }
  | { type: "connection_restored" }
  | { type: "connection_interrupted" }
  | { type: "user_speech_started" }
  | { type: "user_speech_ended" }
  | { type: "input_transcript_delta"; itemId: string; delta: string }
  | { type: "input_transcript_completed"; itemId: string; transcript: string }
  | { type: "assistant_response_started"; responseId: string }
  | {
      type: "assistant_text_delta";
      responseId: string;
      delta: string;
      channel: TextChannel;
    }
  | { type: "assistant_audio_started"; responseId: string | null }
  | { type: "assistant_response_completed"; responseId: string; transcript: string }
  | { type: "assistant_response_interrupted"; responseId: string | null }
  | { type: "provider_error"; message: string; code?: string };

export type HistoryTurn = {
  role: "user" | "assistant";
  text: string;
};

export type VoiceSessionSettings = {
  voice: string;
  language: string;
  languageLabel: string;
  vadEnabled: boolean;
  vadEagerness: "low" | "medium" | "high";
  audioEnabled: boolean;
  autoplayEnabled: boolean;
  volume: number;
};

export function isFatalProviderError(code: string | undefined, message: string) {
  if (
    code &&
    [
      "invalid_api_key",
      "insufficient_quota",
      "server_error",
      "session_expired",
      "rate_limit_exceeded",
    ].includes(code)
  ) {
    return true;
  }
  return /incorrect api key|invalid api key|insufficient quota|billing|session expired/i.test(
    message,
  );
}

export function isBenignProviderError(code: string | undefined, message: string) {
  if (code && ["response_cancel_not_active"].includes(code)) return true;
  return /no active response|cancellation failed|no response to cancel/i.test(message);
}
