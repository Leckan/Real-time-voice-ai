import type { MachineEvent } from "@/lib/session/machine";
import {
  isFatalProviderError,
  type VoiceEvent,
} from "@/lib/providers/types";

export type MessageRole = "user" | "assistant";
export type MessageStatus = "streaming" | "completed" | "interrupted" | "error";

export type ConversationMessage = {
  id: string;
  role: MessageRole;
  text: string;
  status: MessageStatus;
  providerResponseId: string | null;
  audioMime: string | null;
  audioByteLength: number | null;
  createdAt: string;
  completedAt: string | null;
  audioText: string;
  plainText: string;
};

export type TurnState = {
  messages: ConversationMessage[];
  partialInput: string;
  partialItemId: string | null;
  activeResponseId: string | null;
  cancelledIds: string[];
};

export type TurnAction =
  | { type: "reset" }
  | { type: "hydrate"; messages: ConversationMessage[] }
  | { type: "upsert"; message: ConversationMessage }
  | { type: "patch"; id: string; patch: Partial<ConversationMessage> }
  | { type: "remove"; id: string }
  | { type: "voice"; event: VoiceEvent };

type Clock = { now?: () => string; id?: () => string };

export function createTurnState(): TurnState {
  return {
    messages: [],
    partialInput: "",
    partialItemId: null,
    activeResponseId: null,
    cancelledIds: [],
  };
}

export function createMessage(
  input: Pick<ConversationMessage, "id" | "role" | "text" | "status"> &
    Partial<ConversationMessage>,
  now = new Date().toISOString(),
): ConversationMessage {
  return {
    providerResponseId: null,
    audioMime: null,
    audioByteLength: null,
    createdAt: now,
    completedAt: input.status === "streaming" ? null : now,
    audioText: "",
    plainText: input.text,
    ...input,
  };
}

function stamp(clock?: Clock) {
  return clock?.now?.() ?? new Date().toISOString();
}

function withDisplay(message: ConversationMessage): ConversationMessage {
  return { ...message, text: message.audioText || message.plainText };
}

function rememberCancel(ids: string[], id: string | null) {
  if (!id || ids.includes(id)) return ids;
  return [...ids, id].slice(-50);
}

export function machineEventForVoice(event: VoiceEvent): MachineEvent | null {
  switch (event.type) {
    case "connection_established":
      return "CONNECTED";
    case "connection_restored":
      return "RECONNECTED";
    case "connection_interrupted":
      return "CONNECTION_LOST";
    case "user_speech_started":
      return "SPEECH_STARTED";
    case "user_speech_ended":
      return "SPEECH_STOPPED";
    case "assistant_response_started":
      return "RESPONSE_CREATED";
    case "assistant_text_delta":
    case "assistant_audio_started":
      return "OUTPUT_STARTED";
    case "assistant_response_completed":
      return "RESPONSE_COMPLETED";
    case "assistant_response_interrupted":
      return "INTERRUPT";
    default:
      return null;
  }
}

export function reduceTurn(state: TurnState, action: TurnAction, clock?: Clock): TurnState {
  switch (action.type) {
    case "reset":
      return createTurnState();
    case "hydrate":
      return { ...createTurnState(), messages: action.messages };
    case "upsert": {
      const index = state.messages.findIndex((message) => message.id === action.message.id);
      const messages = [...state.messages];
      if (index >= 0) messages[index] = { ...messages[index], ...action.message };
      else messages.push(action.message);
      return { ...state, messages };
    }
    case "patch":
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id ? { ...message, ...action.patch } : message,
        ),
      };
    case "remove":
      return {
        ...state,
        messages: state.messages.filter((message) => message.id !== action.id),
        activeResponseId:
          state.activeResponseId === action.id ? null : state.activeResponseId,
      };
    case "voice":
      return applyVoiceEvent(state, action.event, clock);
    default:
      return state;
  }
}

function applyVoiceEvent(state: TurnState, event: VoiceEvent, clock?: Clock): TurnState {
  const now = stamp(clock);

  switch (event.type) {
    case "user_speech_started":
      return { ...interruptActive(state, state.activeResponseId, now), partialInput: "", partialItemId: null };
    case "input_transcript_delta": {
      const sameItem = state.partialItemId === event.itemId || !state.partialItemId;
      return {
        ...state,
        partialItemId: event.itemId || state.partialItemId,
        partialInput: sameItem ? state.partialInput + event.delta : event.delta,
      };
    }
    case "input_transcript_completed": {
      const text = (event.transcript || state.partialInput).trim();
      if (!text) {
        return { ...state, partialInput: "", partialItemId: null };
      }
      const id = event.itemId ? `user_${event.itemId}` : (clock?.id?.() ?? `user_${now}`);
      const existing = state.messages.find((message) => message.id === id);
      const message = withDisplay({
        ...(existing ??
          createMessage(
            {
              id,
              role: "user",
              text,
              status: "completed",
              providerResponseId: event.itemId || null,
            },
            now,
          )),
        text,
        plainText: text,
        status: "completed",
        completedAt: now,
      });
      const messages = existing
        ? state.messages.map((item) => (item.id === id ? message : item))
        : [...state.messages, message];
      return { ...state, messages, partialInput: "", partialItemId: null };
    }
    case "assistant_response_started": {
      if (!event.responseId || state.cancelledIds.includes(event.responseId)) return state;
      if (state.messages.some((message) => message.id === event.responseId)) {
        return { ...state, activeResponseId: event.responseId };
      }
      const messages = state.messages.map((message) =>
        message.role === "assistant" && message.status === "streaming"
          ? { ...message, status: "completed" as const, completedAt: now }
          : message,
      );
      messages.push(
        createMessage(
          {
            id: event.responseId,
            role: "assistant",
            text: "",
            status: "streaming",
            providerResponseId: event.responseId,
          },
          now,
        ),
      );
      return { ...state, messages, activeResponseId: event.responseId };
    }
    case "assistant_text_delta": {
      if (!event.delta || state.cancelledIds.includes(event.responseId)) return state;
      let messages = state.messages;
      let message = messages.find((item) => item.id === event.responseId);
      if (!message) {
        const started = applyVoiceEvent(
          state,
          { type: "assistant_response_started", responseId: event.responseId },
          clock,
        );
        messages = started.messages;
        message = messages.find((item) => item.id === event.responseId);
        if (!message) return state;
      }
      if (message.audioText && event.channel === "text") return state;
      const next = withDisplay({
        ...message,
        audioText: event.channel === "audio_transcript" ? message.audioText + event.delta : message.audioText,
        plainText: event.channel === "text" ? message.plainText + event.delta : message.plainText,
        status: "streaming",
      });
      return {
        ...state,
        activeResponseId: event.responseId,
        messages: messages.map((item) => (item.id === next.id ? next : item)),
      };
    }
    case "assistant_response_completed": {
      if (state.cancelledIds.includes(event.responseId)) return state;
      const messages = state.messages.map((message) => {
        if (message.id !== event.responseId) return message;
        const transcript = event.transcript.trim();
        const audioText =
          transcript.length >= message.audioText.length ? transcript : message.audioText;
        return withDisplay({
          ...message,
          audioText,
          status: "completed",
          completedAt: now,
        });
      });
      return {
        ...state,
        messages,
        activeResponseId:
          state.activeResponseId === event.responseId ? null : state.activeResponseId,
      };
    }
    case "assistant_response_interrupted":
      return interruptActive(state, event.responseId ?? state.activeResponseId, now);
    case "provider_error": {
      if (!isFatalProviderError(event.code, event.message)) return state;
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.status === "streaming"
            ? { ...message, status: "error" as const, completedAt: now }
            : message,
        ),
        activeResponseId: null,
      };
    }
    default:
      return state;
  }
}

function interruptActive(state: TurnState, responseId: string | null, now: string): TurnState {
  const cancelledIds = rememberCancel(state.cancelledIds, responseId);
  return {
    ...state,
    cancelledIds,
    activeResponseId: responseId && state.activeResponseId === responseId ? null : state.activeResponseId,
    messages: state.messages.map((message) => {
      const matches =
        message.role === "assistant" &&
        message.status === "streaming" &&
        (!responseId || message.id === responseId || message.providerResponseId === responseId);
      if (!matches) return message;
      return { ...message, status: "interrupted", completedAt: now };
    }),
  };
}
