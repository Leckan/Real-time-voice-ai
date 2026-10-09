import { levelFromTimeDomain } from "@/lib/audio/levels";
import { mapRealtimeEvent } from "@/lib/providers/map-events";
import { voiceInstructions } from "@/lib/config";
import type { HistoryTurn, VoiceEvent, VoiceSessionSettings } from "@/lib/providers/types";

type ConnectOptions = {
  stream: MediaStream;
  history: HistoryTurn[];
  settings: VoiceSessionSettings;
};

function waitForIce(pc: RTCPeerConnection, timeoutMs: number) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    }, timeoutMs);
    function done() {
      if (pc.iceGatheringState !== "complete") return;
      window.clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    }
    pc.addEventListener("icegatheringstatechange", done);
  });
}

/**
 * Browser-side OpenAI Realtime session over WebRTC.
 * The permanent API key never enters this class. The server exchanges SDP.
 */
export class OpenAIRealtimeProvider {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private listeners = new Set<(event: VoiceEvent) => void>();
  private settings: VoiceSessionSettings | null = null;
  private history: HistoryTurn[] = [];
  private ready = false;
  private closing = false;
  private restoring = false;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private speakerMuted = false;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private captureResponseId: string | null = null;
  private disconnectTimer: number | null = null;
  private readyTimer: number | null = null;
  onResponseAudio: ((responseId: string, blob: Blob) => void) | null = null;

  subscribe(listener: (event: VoiceEvent) => void) {
    this.listeners.add(listener);
  return () => {
    this.listeners.delete(listener);
  };
  }

  isConnected() {
    return this.ready && this.dc?.readyState === "open";
  }

  prepareAudio() {
    const context = this.ensureContext();
    void context.resume();
    this.ensureAudioElement();
  }

  async connect(options: ConnectOptions) {
    this.closing = false;
    this.restoring = false;
    this.mic = options.stream;
    this.history = options.history.filter((turn) => turn.text.trim()).slice(-20);
    this.settings = options.settings;
    this.speakerMuted = !options.settings.audioEnabled;
    this.attachInputAnalyser(options.stream);
    await this.negotiate(false);
  }

  async reconnect(history: HistoryTurn[]) {
    if (!this.mic || this.mic.getAudioTracks().every((track) => track.readyState === "ended")) {
      throw new Error("The microphone is no longer available.");
    }
    this.history = history.filter((turn) => turn.text.trim()).slice(-20);
    this.restoring = true;
    this.ready = false;
    await this.negotiate(true);
  }

  sendText(text: string) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.send({
      type: "response.create",
      response: {
        output_modalities: this.settings?.audioEnabled === false ? ["text"] : ["audio"],
      },
    });
  }

  interrupt() {
    this.stopCapture(this.captureResponseId);
    if (this.audio) this.audio.pause();
    this.send({ type: "response.cancel" });
    this.send({ type: "output_audio_buffer.clear" });
  }

  updateSettings(settings: VoiceSessionSettings) {
    this.settings = settings;
    if (!settings.audioEnabled) this.speakerMuted = true;
    this.applyVolume();
    if (this.audio) this.audio.autoplay = settings.autoplayEnabled && settings.audioEnabled;
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: voiceInstructions(settings.languageLabel),
        output_modalities: settings.audioEnabled ? ["audio"] : ["text"],
        audio: {
          input: {
            turn_detection: settings.vadEnabled
              ? { type: "semantic_vad", eagerness: settings.vadEagerness }
              : null,
          },
        },
      },
    });
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.mic?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    if (!enabled) this.send({ type: "input_audio_buffer.clear" });
  }

  beginPushToTalk() {
    this.send({ type: "input_audio_buffer.clear" });
    this.interrupt();
    this.setMicrophoneEnabled(true);
  }

  endPushToTalk() {
    this.send({ type: "input_audio_buffer.commit" });
    this.send({ type: "response.create" });
  }

  setVolume(volume: number) {
    if (this.settings) this.settings.volume = volume;
    this.applyVolume();
  }

  setSpeakerMuted(muted: boolean) {
    this.speakerMuted = muted;
    this.applyVolume();
  }

  setAutoplay(enabled: boolean) {
    if (this.settings) this.settings.autoplayEnabled = enabled;
    if (!enabled) this.audio?.pause();
    else if (this.audio && !this.speakerMuted) void this.audio.play().catch(() => undefined);
  }

  pausePlayback() {
    this.audio?.pause();
  }

  async resumePlayback() {
    await this.audio?.play();
  }

  getLevels() {
    return {
      input: this.readLevel(this.inputAnalyser),
      output: this.readLevel(this.outputAnalyser),
    };
  }

  disconnect() {
    this.closing = true;
    this.ready = false;
    if (this.disconnectTimer) window.clearTimeout(this.disconnectTimer);
    if (this.readyTimer) window.clearTimeout(this.readyTimer);
    this.stopCapture(null);
    this.mic?.getTracks().forEach((track) => track.stop());
    this.mic = null;
    this.closePeer();
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio.remove();
      this.audio = null;
    }
    void this.audioContext?.close();
    this.audioContext = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
  }

  private async negotiate(restoring: boolean) {
    this.closePeer();
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.ready = false;
    const mic = this.mic;
    if (!mic) throw new Error("The microphone is not available.");

    pc.addEventListener("track", (event) => {
      if (this.pc !== pc) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.attachRemote(stream);
    });
    pc.addEventListener("connectionstatechange", () => {
      if (this.closing || this.pc !== pc) return;
      if (pc.connectionState === "connected" && this.disconnectTimer) {
        window.clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
      }
      if (pc.connectionState === "failed") {
        this.emit({ type: "connection_interrupted" });
        return;
      }
      if (pc.connectionState === "disconnected") {
        this.disconnectTimer = window.setTimeout(() => {
          if (this.pc === pc && (pc.connectionState === "disconnected" || pc.connectionState === "failed")) {
            this.emit({ type: "connection_interrupted" });
          }
        }, 1500);
      }
    });

    for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.addEventListener("message", (event) => {
      this.onData(event.data);
    });
    const readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = () => {
        if (this.readyTimer) window.clearTimeout(this.readyTimer);
        resolve();
      };
      this.rejectReady = reject;
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc, 2500);
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("Could not create a connection offer.");

    const settings = this.settings;
    const response = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp,
        voice: settings?.voice,
        language: settings?.language,
        vadEnabled: settings?.vadEnabled,
        vadEagerness: settings?.vadEagerness,
        audioEnabled: settings?.audioEnabled,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { sdp?: string; error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Could not start the voice session.");
    }
    if (!payload.sdp || !payload.sdp.includes("v=")) {
      throw new Error("The voice service returned an unusable connection answer.");
    }
    await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });

    if (!this.ready) {
      this.readyTimer = window.setTimeout(() => this.markReady(restoring), 4000);
    }
    const fail = window.setTimeout(() => {
      this.rejectReady?.(new Error("The voice service did not become ready."));
    }, 15000);
    try {
      await readyPromise;
    } finally {
      window.clearTimeout(fail);
    }
  }

  private onData(data: unknown) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }
    const event = mapRealtimeEvent(parsed);
    if (!event) return;
    if (event.type === "session_ready") {
      this.markReady(this.restoring);
      return;
    }
    if (event.type === "assistant_response_started") {
      this.captureResponseId = event.responseId;
      this.startCapture();
    }
    if (
      event.type === "assistant_response_completed" ||
      event.type === "assistant_response_interrupted"
    ) {
      this.stopCapture(event.responseId);
    }
    this.emit(event);
  }

  private markReady(restoring: boolean) {
    if (this.ready || this.closing) return;
    this.ready = true;
    if (this.readyTimer) window.clearTimeout(this.readyTimer);
    this.seedHistory();
    this.emit(restoring ? { type: "connection_restored" } : { type: "connection_established" });
    this.restoring = false;
    this.resolveReady?.();
    this.resolveReady = null;
  }

  private seedHistory() {
    for (const turn of this.history) {
      this.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: turn.role,
          content: [
            {
              type: turn.role === "user" ? "input_text" : "output_text",
              text: turn.text.slice(0, 2000),
            },
          ],
        },
      });
    }
  }

  private send(event: unknown) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  private emit(event: VoiceEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private ensureContext() {
    if (!this.audioContext) this.audioContext = new AudioContext();
    return this.audioContext;
  }

  private ensureAudioElement() {
    if (this.audio) return this.audio;
    const audio = document.createElement("audio");
    audio.autoplay = this.settings?.autoplayEnabled !== false;
    audio.setAttribute("playsinline", "true");
    audio.dataset.auric = "remote";
    document.body.appendChild(audio);
    this.audio = audio;
    this.applyVolume();
    return audio;
  }

  private attachInputAnalyser(stream: MediaStream) {
    const context = this.ensureContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    this.inputAnalyser = analyser;
  }

  private attachRemote(stream: MediaStream) {
    const audio = this.ensureAudioElement();
    audio.srcObject = stream;
    const context = this.ensureContext();
    if (!this.outputAnalyser) {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.outputAnalyser = analyser;
    }
    if (this.settings?.autoplayEnabled !== false && !this.speakerMuted) {
      void audio.play().catch(() => {
        this.emit({
          type: "provider_error",
          message: "Tap play to hear Auric. The browser blocked automatic playback.",
          code: "playback_blocked",
        });
      });
    }
  }

  private applyVolume() {
    if (!this.audio || !this.settings) return;
    this.audio.muted = this.speakerMuted || this.settings.audioEnabled === false;
    this.audio.volume = Math.min(1, Math.max(0, this.settings.volume));
  }

  private readLevel(analyser: AnalyserNode | null) {
    if (!analyser) return 0;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    return levelFromTimeDomain(samples);
  }

  private startCapture() {
    if (!this.audio?.srcObject || typeof MediaRecorder === "undefined") return;
    this.stopCapture(null);
    try {
      const stream = this.audio.srcObject;
      if (!(stream instanceof MediaStream)) return;
      this.chunks = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size) this.chunks.push(event.data);
      };
      recorder.start();
      this.recorder = recorder;
    } catch {
      this.recorder = null;
    }
  }

  private stopCapture(responseId: string | null) {
    const recorder = this.recorder;
    const chunks = this.chunks;
    this.recorder = null;
    this.chunks = [];
    if (!recorder || recorder.state === "inactive") return;
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (responseId && blob.size > 0) this.onResponseAudio?.(responseId, blob);
    };
    try {
      recorder.stop();
    } catch {
      /* The recorder can already be stopped during teardown. */
    }
  }

  private closePeer() {
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
  }
}
