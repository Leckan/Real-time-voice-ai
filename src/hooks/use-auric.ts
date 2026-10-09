"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { languageByCode, LANGUAGES, type LanguageCode, type VoiceName } from "@/lib/config";
import { createId } from "@/lib/id";
import { OpenAIRealtimeProvider } from "@/lib/providers/openai-realtime";
import {
  isBenignProviderError,
  isFatalProviderError,
  type VoiceEvent,
  type VoiceSessionSettings,
} from "@/lib/providers/types";
import { isCallActive, isTimerRunning, transition, type MachineEvent, type SessionStatus } from "@/lib/session/machine";
import {
  createMessage,
  createTurnState,
  machineEventForVoice,
  reduceTurn,
  type ConversationMessage,
  type TurnState,
} from "@/lib/session/turn";
import type { StoredConversation, StoredMessage, StoredSettings, StoredUser } from "@/lib/store/types";
import { emptyMetrics, toPublicMetrics, type PublicMetrics } from "@/lib/telemetry";

type Levels = { input: number; output: number };

function fromStored(message: StoredMessage): ConversationMessage {
  return {
    ...message,
    audioText: "",
    plainText: message.text,
  };
}

function toStored(conversationId: string, message: ConversationMessage): StoredMessage {
  return {
    id: message.id,
    conversationId,
    role: message.role,
    text: message.text,
    status: message.status,
    providerResponseId: message.providerResponseId,
    audioMime: message.audioMime,
    audioByteLength: message.audioByteLength,
    createdAt: message.createdAt,
    completedAt: message.completedAt,
  };
}

async function readError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error || `Request failed (${response.status})`;
}

export function useAuric() {
  const providerRef = useRef<OpenAIRealtimeProvider | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [turn, setTurn] = useState<TurnState>(createTurnState);
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [levels, setLevels] = useState<Levels>({ input: 0, output: 0 });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [metrics, setMetrics] = useState<PublicMetrics>(emptyMetrics);
  const [clips, setClips] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);

  const statusRef = useRef(status);
  const turnRef = useRef(turn);
  const settingsRef = useRef(settings);
  const conversationRef = useRef(conversationId);
  const userSpeakingRef = useRef(false);
  const speakerMutedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const reconnectsRef = useRef(0);
  const savedRef = useRef(new Map<string, string>());
  const connectedAtRef = useRef<number | null>(null);
  const marksRef = useRef({
    connectStarted: 0,
    speechEnded: 0,
    responseStarted: 0,
    interruptRequested: 0,
    sawText: false,
    sawAudio: false,
  });
  const onVoiceRef = useRef<(event: VoiceEvent) => void>(() => undefined);

  const applyTurn = useCallback((action: Parameters<typeof reduceTurn>[1]) => {
    const next = reduceTurn(turnRef.current, action);
    turnRef.current = next;
    setTurn(next);
    return next;
  }, []);

  const sendMachine = useCallback((event: MachineEvent) => {
    const next = transition(statusRef.current, event);
    statusRef.current = next;
    setStatus(next);
    return next;
  }, []);

  const sessionSettings = useCallback((): VoiceSessionSettings => {
    const current = settingsRef.current;
    const language = languageByCode(current?.preferredLanguage ?? "en");
    return {
      voice: current?.preferredVoice ?? "marin",
      language: language.code,
      languageLabel: language.label,
      vadEnabled: current?.vadEnabled ?? true,
      vadEagerness: current?.vadEagerness ?? "medium",
      audioEnabled: current?.audioEnabled ?? true,
      autoplayEnabled: current?.autoplayEnabled ?? true,
      volume: current?.volume ?? 1,
    };
  }, []);

  const provider = useCallback(() => {
    if (!providerRef.current) providerRef.current = new OpenAIRealtimeProvider();
    return providerRef.current;
  }, []);

  const clearClips = useCallback((revoke: boolean) => {
    if (revoke) {
      setClips((current) => {
        Object.values(current).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
    }
  }, []);

  useEffect(() => {
    const voice = provider();
    voice.onResponseAudio = (id, blob) => {
      const url = URL.createObjectURL(blob);
      setClips((current) => {
        if (current[id]) URL.revokeObjectURL(current[id]);
        return { ...current, [id]: url };
      });
      if (settingsRef.current?.retainAudio) {
        applyTurn({
          type: "patch",
          id,
          patch: { audioByteLength: blob.size, audioMime: blob.type || "audio/webm" },
        });
      }
    };
    return voice.subscribe((event) => onVoiceRef.current(event));
  }, [applyTurn, provider]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await fetch("/api/bootstrap");
        if (!response.ok) throw new Error(await readError(response));
        const data = (await response.json()) as {
          user: StoredUser;
          settings: StoredSettings;
          conversations: StoredConversation[];
          active: { conversation: StoredConversation; messages: StoredMessage[] } | null;
        };
        if (ignore) return;
        setUser(data.user);
        setSettings(data.settings);
        settingsRef.current = data.settings;
        setConversations(data.conversations);
        document.documentElement.dataset.theme = data.settings.theme;
        localStorage.setItem("auric-theme", data.settings.theme);
        if (data.active) {
          conversationRef.current = data.active.conversation.id;
          setConversationId(data.active.conversation.id);
          const messages = data.active.messages.map(fromStored);
          savedRef.current = new Map(messages.map((message) => [message.id, signature(message)]));
          applyTurn({ type: "hydrate", messages });
        }
      } catch (error) {
        if (!ignore) setBanner(error instanceof Error ? error.message : "Auric could not open.");
      } finally {
        if (!ignore) setBooting(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [applyTurn]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    for (const message of turn.messages) {
      if (message.status === "streaming" || !message.text.trim()) continue;
      const sig = signature(message);
      if (savedRef.current.get(message.id) === sig) continue;
      savedRef.current.set(message.id, sig);
      void fetch(`/api/conversations/${conversation}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toStored(conversation, message)),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(await readError(response));
          if (message.role === "user") {
            const title = message.text.trim().replace(/\s+/g, " ").slice(0, 60);
            setConversations((list) =>
              list.map((item) =>
                item.id === conversation
                  ? {
                      ...item,
                      title: item.title === "New conversation" ? title : item.title,
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            );
          }
        })
        .catch(() => {
          savedRef.current.delete(message.id);
        });
    }
  }, [turn.messages]);

  useEffect(() => {
    if (!isTimerRunning(status)) return;
    const timer = window.setInterval(() => {
      if (connectedAtRef.current) setElapsedMs(Date.now() - connectedAtRef.current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!isCallActive(status) || status === "requesting_permission" || status === "ending") return;
    let frame = 0;
    const tick = () => {
      setLevels(provider().getLevels());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [provider, status]);

  useEffect(() => {
    if (status !== "interrupted" || userSpeaking) return;
    const timer = window.setTimeout(() => {
      if (statusRef.current === "interrupted" && !userSpeakingRef.current) {
        sendMachine("INTERRUPT_SETTLED");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [sendMachine, status, userSpeaking]);

  useEffect(() => {
    return () => {
      providerRef.current?.disconnect();
    };
  }, []);

  const noteMetrics = useCallback((patch: Partial<PublicMetrics>) => {
    setMetrics((current) => toPublicMetrics({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    onVoiceRef.current = (event) => {
    if (event.type === "provider_error") {
      if (isBenignProviderError(event.code, event.message)) return;
      if (event.code === "playback_blocked") {
        noteMetrics({ playbackFailures: metrics.playbackFailures + 1 });
      }
      setBanner(event.message);
      if (isFatalProviderError(event.code, event.message)) {
        applyTurn({ type: "voice", event });
        noteMetrics({ connectionFailures: metrics.connectionFailures + 1 });
        sendMachine("FAIL");
        provider().disconnect();
      }
      return;
    }

    const previous = turnRef.current;
    if (
      event.type === "assistant_response_completed" &&
      previous.cancelledIds.includes(event.responseId)
    ) {
      return;
    }

    applyTurn({ type: "voice", event });

    if (event.type === "user_speech_started") {
      userSpeakingRef.current = true;
      setUserSpeaking(true);
      if (statusRef.current === "speaking" || statusRef.current === "processing") {
        provider().interrupt();
        marksRef.current.interruptRequested = performance.now();
      }
    }
    if (event.type === "user_speech_ended") {
      userSpeakingRef.current = false;
      setUserSpeaking(false);
      marksRef.current.speechEnded = performance.now();
      marksRef.current.sawText = false;
      marksRef.current.sawAudio = false;
    }
    if (event.type === "assistant_response_started") {
      marksRef.current.responseStarted = performance.now();
    }
    if (event.type === "assistant_text_delta" && !marksRef.current.sawText && marksRef.current.speechEnded) {
      marksRef.current.sawText = true;
      noteMetrics({
        speechEndToFirstTextMs: Math.round(performance.now() - marksRef.current.speechEnded),
      });
    }
    if (event.type === "assistant_audio_started" && !marksRef.current.sawAudio && marksRef.current.speechEnded) {
      marksRef.current.sawAudio = true;
      noteMetrics({
        speechEndToFirstAudioMs: Math.round(performance.now() - marksRef.current.speechEnded),
      });
    }
    if (event.type === "assistant_response_completed" && marksRef.current.responseStarted) {
      noteMetrics({
        responseDurationMs: Math.round(performance.now() - marksRef.current.responseStarted),
      });
    }
    if (event.type === "assistant_response_interrupted" && marksRef.current.interruptRequested) {
      noteMetrics({
        interruptionMs: Math.round(performance.now() - marksRef.current.interruptRequested),
      });
      marksRef.current.interruptRequested = 0;
      if (!userSpeakingRef.current) sendMachine("INTERRUPT_SETTLED");
    }
    if (event.type === "connection_established") {
      connectedAtRef.current = Date.now();
      noteMetrics({
        connectionMs: Math.round(performance.now() - marksRef.current.connectStarted),
      });
    }

    const machineEvent = machineEventForVoice(event);
    if (machineEvent) sendMachine(machineEvent);

    if (event.type === "connection_interrupted") {
      const live = ["listening", "processing", "speaking", "interrupted"].includes(statusRef.current);
      if (!live || reconnectingRef.current) return;
      if (reconnectsRef.current >= 1) {
        noteMetrics({ connectionFailures: metrics.connectionFailures + 1 });
        sendMachine("RECONNECT_FAILED");
        setBanner("The call dropped. Try the call again, or continue by typing.");
        return;
      }
      reconnectsRef.current += 1;
      reconnectingRef.current = true;
      sendMachine("CONNECTION_LOST");
      void provider()
        .reconnect(turnRef.current.messages.filter((message) => message.text.trim()).map((message) => ({
          role: message.role,
          text: message.text,
        })))
        .catch(() => {
          noteMetrics({ connectionFailures: metrics.connectionFailures + 1 });
          sendMachine("RECONNECT_FAILED");
          setBanner("The call dropped and could not be restored. You can try again, or continue by typing.");
        })
        .finally(() => {
          reconnectingRef.current = false;
        });
    }
    };
  });

  async function ensureConversation(mode: "voice" | "text") {
    if (conversationRef.current) return conversationRef.current;
    const id = createId("con");
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, id }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const conversation = (await response.json()) as StoredConversation;
    conversationRef.current = conversation.id;
    setConversationId(conversation.id);
    setConversations((list) => [conversation, ...list.filter((item) => item.id !== conversation.id)]);
    return conversation.id;
  }

  async function startCall() {
    if (statusRef.current !== "idle" && statusRef.current !== "error") return;
    setBanner(null);
    reconnectsRef.current = 0;
    marksRef.current.connectStarted = performance.now();
    noteMetrics({ connectionAttempts: metrics.connectionAttempts + 1 });
    sendMachine("START");
    provider().prepareAudio();

    if (!navigator.mediaDevices?.getUserMedia) {
      sendMachine("PERMISSION_DENIED");
      setBanner("This browser cannot open a microphone. You can continue by typing.");
      setInputMode("text");
      return;
    }
    if (!window.isSecureContext) {
      sendMachine("PERMISSION_DENIED");
      setBanner("Voice calls need HTTPS or localhost. You can continue by typing.");
      setInputMode("text");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      sendMachine("PERMISSION_DENIED");
      setBanner("Microphone access is off. Allow it in the browser settings, or continue by typing.");
      setInputMode("text");
      return;
    }

    sendMachine("PERMISSION_GRANTED");
    try {
      await ensureConversation("voice");
      const history = turnRef.current.messages
        .filter((message) => message.text.trim() && message.status !== "streaming")
        .map((message) => ({ role: message.role, text: message.text }));
      await provider().connect({ stream, history, settings: sessionSettings() });
      setMicMuted(false);
      setSpeakerMuted(!(settingsRef.current?.audioEnabled ?? true));
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      provider().disconnect();
      noteMetrics({ connectionFailures: metrics.connectionFailures + 1 });
      sendMachine("CONNECT_FAILED");
      setBanner(error instanceof Error ? error.message : "The call could not be started.");
      setInputMode("text");
    }
  }

  function interrupt() {
    marksRef.current.interruptRequested = performance.now();
    provider().interrupt();
    applyTurn({
      type: "voice",
      event: { type: "assistant_response_interrupted", responseId: turnRef.current.activeResponseId },
    });
    sendMachine("INTERRUPT");
  }

  function toggleMicrophone() {
    const next = !micMuted;
    setMicMuted(next);
    provider().setMicrophoneEnabled(!next);
  }

  function toggleSpeaker() {
    const next = !speakerMutedRef.current;
    speakerMutedRef.current = next;
    setSpeakerMuted(next);
    provider().setSpeakerMuted(next);
  }

  function togglePlayback() {
    if (playbackPaused) {
      void provider().resumePlayback().catch(() => {
        noteMetrics({ playbackFailures: metrics.playbackFailures + 1 });
        setBanner("Playback could not resume.");
      });
      setPlaybackPaused(false);
    } else {
      provider().pausePlayback();
      setPlaybackPaused(true);
    }
  }

  async function endCall() {
    if (!isCallActive(statusRef.current) && statusRef.current !== "error") return;
    sendMachine("END");
    provider().disconnect();
    if (!settingsRef.current?.retainAudio) clearClips(true);
    connectedAtRef.current = null;
    setUserSpeaking(false);
    holdingRef.current = false;
    setHolding(false);
    setMicMuted(false);
    sendMachine("ENDED");
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setBanner(null);
    const userMessage = createMessage({
      id: createId("msg"),
      role: "user",
      text: trimmed,
      status: "completed",
    });
    applyTurn({ type: "upsert", message: userMessage });

    if (provider().isConnected()) {
      if (statusRef.current === "speaking" || statusRef.current === "processing") interrupt();
      provider().sendText(trimmed);
      return;
    }

    const assistantId = createId("msg");
    applyTurn({
      type: "upsert",
      message: createMessage({ id: assistantId, role: "assistant", text: "", status: "streaming" }),
    });
    setSending(true);
    try {
      const conversation = await ensureConversation("text");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation,
          text: trimmed,
          userMessageId: userMessage.id,
          assistantMessageId: assistantId,
        }),
      });
      if (!response.ok || !response.body) throw new Error(await readError(response));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        applyTurn({ type: "patch", id: assistantId, patch: { text: full, plainText: full, status: "streaming" } });
      }
      applyTurn({
        type: "patch",
        id: assistantId,
        patch: { text: full, plainText: full, status: "completed", completedAt: new Date().toISOString() },
      });
    } catch (error) {
      applyTurn({
        type: "patch",
        id: assistantId,
        patch: {
          status: "error",
          completedAt: new Date().toISOString(),
          text: turnRef.current.messages.find((message) => message.id === assistantId)?.text || "The reply stopped before it finished.",
        },
      });
      setBanner(error instanceof Error ? error.message : "The message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function retryLast() {
    const messages = turnRef.current.messages;
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    const userMessage = [...messages].reverse().find((message) => message.role === "user" && message.text.trim());
    if (!assistant || !userMessage) return;
    applyTurn({ type: "remove", id: assistant.id });
    const conversation = conversationRef.current;
    if (conversation) {
      void fetch(`/api/conversations/${conversation}/messages/${assistant.id}`, { method: "DELETE" });
    }
    if (provider().isConnected()) {
      provider().sendText(userMessage.text);
      return;
    }
    const assistantId = createId("msg");
    applyTurn({
      type: "upsert",
      message: createMessage({ id: assistantId, role: "assistant", text: "", status: "streaming" }),
    });
    setSending(true);
    try {
      const id = await ensureConversation("text");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: id,
          retry: true,
          assistantMessageId: assistantId,
        }),
      });
      if (!response.ok || !response.body) throw new Error(await readError(response));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        applyTurn({ type: "patch", id: assistantId, patch: { text: full, plainText: full, status: "streaming" } });
      }
      applyTurn({
        type: "patch",
        id: assistantId,
        patch: { text: full, plainText: full, status: "completed", completedAt: new Date().toISOString() },
      });
    } catch (error) {
      applyTurn({
        type: "patch",
        id: assistantId,
        patch: { status: "error", text: "The reply could not be retried.", completedAt: new Date().toISOString() },
      });
      setBanner(error instanceof Error ? error.message : "The reply could not be retried.");
    } finally {
      setSending(false);
    }
  }

  async function openConversation(id: string) {
    if (id === conversationRef.current) return;
    if (isCallActive(statusRef.current)) await endCall();
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    const data = (await response.json()) as { messages: StoredMessage[] };
    const messages = data.messages.map(fromStored);
    savedRef.current = new Map(messages.map((message) => [message.id, signature(message)]));
    conversationRef.current = id;
    setConversationId(id);
    clearClips(true);
    applyTurn({ type: "hydrate", messages });
    setBanner(null);
  }

  async function newConversation() {
    if (isCallActive(statusRef.current)) await endCall();
    conversationRef.current = null;
    setConversationId(null);
    savedRef.current.clear();
    clearClips(true);
    applyTurn({ type: "reset" });
    setElapsedMs(0);
    setBanner(null);
  }

  async function renameConversation(id: string, title: string) {
    const response = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    const updated = (await response.json()) as StoredConversation;
    setConversations((list) => list.map((item) => (item.id === id ? updated : item)));
  }

  async function deleteConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setConversations((list) => list.filter((item) => item.id !== id));
    if (conversationRef.current === id) await newConversation();
  }

  async function resetConversation() {
    if (isCallActive(statusRef.current)) await endCall();
    const id = conversationRef.current;
    if (id) {
      const response = await fetch(`/api/conversations/${id}/reset`, { method: "POST" });
      if (!response.ok) {
        setBanner(await readError(response));
        return;
      }
      setConversations((list) =>
        list.map((item) => (item.id === id ? { ...item, title: "New conversation" } : item)),
      );
    }
    savedRef.current.clear();
    clearClips(true);
    applyTurn({ type: "reset" });
  }

  async function updateSettings(patch: Partial<StoredSettings> & { displayName?: string }) {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    const data = (await response.json()) as { user: StoredUser; settings: StoredSettings };
    setUser(data.user);
    setSettings(data.settings);
    settingsRef.current = data.settings;
    document.documentElement.dataset.theme = data.settings.theme;
    localStorage.setItem("auric-theme", data.settings.theme);
    const next = sessionSettings();
    provider().updateSettings(next);
    provider().setVolume(data.settings.volume);
    provider().setAutoplay(data.settings.autoplayEnabled);
    if (!data.settings.audioEnabled) {
      speakerMutedRef.current = true;
      setSpeakerMuted(true);
      provider().setSpeakerMuted(true);
    }
  }

  function beginHold() {
    if (settingsRef.current?.vadEnabled !== false) return;
    if (!["listening", "interrupted", "speaking", "processing"].includes(statusRef.current)) return;
    holdingRef.current = true;
    setHolding(true);
    provider().beginPushToTalk();
  }

  function endHold() {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    provider().endPushToTalk();
  }

  return {
    status,
    turn,
    settings,
    user,
    conversations,
    conversationId,
    banner,
    setBanner,
    booting,
    inputMode,
    setInputMode,
    micMuted,
    speakerMuted,
    playbackPaused,
    userSpeaking,
    levels,
    elapsedMs,
    metrics,
    clips,
    sending,
    holding,
    languages: LANGUAGES,
    startCall,
    endCall,
    interrupt,
    toggleMicrophone,
    toggleSpeaker,
    togglePlayback,
    sendText,
    retryLast,
    openConversation,
    newConversation,
    renameConversation,
    deleteConversation,
    resetConversation,
    updateSettings,
    beginHold,
    endHold,
    setVoice: (preferredVoice: VoiceName) => updateSettings({ preferredVoice }),
    setLanguage: (preferredLanguage: LanguageCode) => updateSettings({ preferredLanguage }),
  };
}

function signature(message: ConversationMessage) {
  return `${message.status}|${message.text}|${message.audioByteLength ?? ""}`;
}
