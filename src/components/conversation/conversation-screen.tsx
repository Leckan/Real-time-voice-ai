"use client";

import { useEffect, useState } from "react";
import { History, Settings } from "lucide-react";
import { Composer } from "@/components/conversation/composer";
import { Controls } from "@/components/conversation/controls";
import { Toggle, VolumeSlider } from "@/components/conversation/fields";
import { SettingsDialog } from "@/components/conversation/settings-dialog";
import { Sidebar } from "@/components/conversation/sidebar";
import { Transcript } from "@/components/conversation/transcript";
import { VoiceOrb } from "@/components/conversation/voice-orb";
import { useAuric } from "@/hooks/use-auric";
import { PRIVACY_NOTICE, VOICES, type VoiceName } from "@/lib/config";
import { isTimerRunning, STATUS_LABELS } from "@/lib/session/machine";
import { formatClock, formatMs } from "@/lib/utils";

export function ConversationScreen() {
  const app = useAuric();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? app.user?.name ?? "";
  const settings = app.settings;
  const transcriptOn = settings?.transcriptEnabled ?? true;
  const level =
    app.status === "speaking"
      ? app.levels.output
      : app.userSpeaking || app.status === "listening"
        ? app.levels.input
        : 0;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.code === "Space" && !typing && (app.status === "speaking" || app.status === "processing")) {
        event.preventDefault();
        app.interrupt();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        conversations={app.conversations}
        activeId={app.conversationId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNew={() => {
          void app.newConversation();
          setHistoryOpen(false);
        }}
        onOpen={(id) => void app.openConversation(id)}
        onRename={(id, title) => void app.renameConversation(id, title)}
        onDelete={(id) => void app.deleteConversation(id)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-full border border-line p-2 lg:hidden" aria-label="Open conversation history" onClick={() => setHistoryOpen(true)}>
              <History size={16} />
            </button>
            <div>
              <p className="font-display text-3xl leading-none italic">Auric</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-mist uppercase">Live voice</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-xs" aria-live="polite">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
              {app.booting ? "Opening" : STATUS_LABELS[app.status]}
              {isTimerRunning(app.status) ? ` · ${formatClock(app.elapsedMs)}` : ""}
            </p>
            <button type="button" className="rounded-full border border-line p-2" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
              <Settings size={16} />
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col items-center px-4 pt-2 pb-4">
            <VoiceOrb status={app.status} level={level} userSpeaking={app.userSpeaking} onStart={() => void app.startCall()} />
            <p className="mt-4 text-center text-sm text-mist">
              {app.userSpeaking ? "Hearing you" : STATUS_LABELS[app.status]}
            </p>
            {app.banner ? (
              <div className="mt-4 flex max-w-lg items-start gap-3 rounded-2xl border border-danger/40 bg-panel px-4 py-3 text-sm" role="alert">
                <p className="flex-1">{app.banner}</p>
                <button type="button" className="text-xs text-mist" onClick={() => app.setBanner(null)}>
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>

          <Transcript
            messages={app.turn.messages}
            partial={app.turn.partialInput}
            visible={transcriptOn}
            clips={app.clips}
            canRetry={!app.sending}
            onReplay={(id) => {
              const url = app.clips[id];
              if (!url) return;
              const audio = new Audio(url);
              void audio.play();
            }}
            onRetry={() => void app.retryLast()}
          />

          {app.inputMode === "text" ? <Composer disabled={app.sending} onSend={(text) => void app.sendText(text)} /> : null}
          <Controls
            status={app.status}
            micMuted={app.micMuted}
            speakerMuted={app.speakerMuted}
            playbackPaused={app.playbackPaused}
            vadEnabled={settings?.vadEnabled ?? true}
            holding={app.holding}
            inputMode={app.inputMode}
            onStart={() => void app.startCall()}
            onEnd={() => void app.endCall()}
            onInterrupt={app.interrupt}
            onToggleMic={app.toggleMicrophone}
            onToggleSpeaker={app.toggleSpeaker}
            onTogglePlayback={app.togglePlayback}
            onToggleInput={() => app.setInputMode(app.inputMode === "text" ? "voice" : "text")}
            onHoldStart={app.beginHold}
            onHoldEnd={app.endHold}
          />
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        {settings ? (
          <div className="space-y-4">
            <label className="block text-sm">
              Your name
              <input
                value={name}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => {
                  if (name.trim() && name.trim() !== app.user?.name) void app.updateSettings({ displayName: name.trim() });
                  setNameDraft(null);
                }}
                className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Voice
              <select
                className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2"
                value={settings.preferredVoice}
                onChange={(event) => void app.setVoice(event.target.value as VoiceName)}
              >
                {VOICES.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                    {voice === "marin" || voice === "cedar" ? " · recommended" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-mist">A new voice is used the next time you start a call.</span>
            </label>
            <label className="block text-sm">
              Language
              <select
                className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2"
                value={settings.preferredLanguage}
                onChange={(event) => void app.setLanguage(event.target.value as typeof settings.preferredLanguage)}
              >
                {app.languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Turn detection
              <select
                className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2"
                value={settings.vadEagerness}
                disabled={!settings.vadEnabled}
                onChange={(event) => void app.updateSettings({ vadEagerness: event.target.value as typeof settings.vadEagerness })}
              >
                <option value="low">Patient</option>
                <option value="medium">Balanced</option>
                <option value="high">Eager</option>
              </select>
            </label>
            <div className="divide-y divide-line">
              <Toggle checked={settings.vadEnabled} onCheckedChange={(vadEnabled) => void app.updateSettings({ vadEnabled })} label="Voice activity detection" hint="When this is off, hold the microphone button to talk." />
              <Toggle checked={settings.audioEnabled} onCheckedChange={(audioEnabled) => void app.updateSettings({ audioEnabled })} label="Hear replies" hint="Text still appears when audio is off." />
              <Toggle checked={settings.autoplayEnabled} onCheckedChange={(autoplayEnabled) => void app.updateSettings({ autoplayEnabled })} label="Play replies automatically" />
              <Toggle checked={settings.transcriptEnabled} onCheckedChange={(transcriptEnabled) => void app.updateSettings({ transcriptEnabled })} label="Show transcript" />
              <Toggle checked={settings.theme === "light"} onCheckedChange={(light) => void app.updateSettings({ theme: light ? "light" : "dark" })} label="Light appearance" />
              <Toggle checked={settings.retainAudio} onCheckedChange={(retainAudio) => void app.updateSettings({ retainAudio })} label="Keep replay audio in this tab" hint="Auric still does not upload recordings." />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Volume</span>
                <span className="font-mono text-xs text-mist">{Math.round(settings.volume * 100)}</span>
              </div>
              <VolumeSlider value={settings.volume} onChange={(volume) => void app.updateSettings({ volume })} />
            </div>
            <div className="rounded-2xl bg-canvas p-4 text-sm">
              <p className="font-medium">This call</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs text-mist">
                <dt>Connection</dt>
                <dd>{formatMs(app.metrics.connectionMs)}</dd>
                <dt>Speech to text</dt>
                <dd>{formatMs(app.metrics.speechEndToFirstTextMs)}</dd>
                <dt>Speech to audio</dt>
                <dd>{formatMs(app.metrics.speechEndToFirstAudioMs)}</dd>
                <dt>Reply length</dt>
                <dd>{formatMs(app.metrics.responseDurationMs)}</dd>
                <dt>Interrupt</dt>
                <dd>{formatMs(app.metrics.interruptionMs)}</dd>
                <dt>Failed connections</dt>
                <dd>
                  {app.metrics.connectionFailures}/{app.metrics.connectionAttempts}
                </dd>
              </dl>
            </div>
            <p className="text-xs leading-5 text-mist">{PRIVACY_NOTICE}</p>
            <button type="button" className="text-sm text-danger" onClick={() => void app.resetConversation()}>
              Reset this conversation
            </button>
          </div>
        ) : (
          <p className="text-sm text-mist">Settings open after Auric finishes starting.</p>
        )}
      </SettingsDialog>
    </div>
  );
}
