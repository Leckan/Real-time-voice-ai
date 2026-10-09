export const APP_NAME = "Auric";

export const VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

export type VoiceName = (typeof VOICES)[number];

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const VAD_EAGERNESS = ["low", "medium", "high"] as const;
export type VadEagerness = (typeof VAD_EAGERNESS)[number];

export const DEFAULT_SETTINGS = {
  preferredVoice: "marin" as VoiceName,
  preferredLanguage: "en" as LanguageCode,
  audioEnabled: true,
  autoplayEnabled: true,
  transcriptEnabled: true,
  vadEnabled: true,
  vadEagerness: "medium" as VadEagerness,
  volume: 1,
  theme: "dark" as "dark" | "light",
  retainAudio: false,
};

export function languageByCode(code: string) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

export function voiceInstructions(languageLabel: string) {
  return [
    "You are Auric, a voice assistant on a live call.",
    `Speak in ${languageLabel}.`,
    "Use natural spoken sentences that are easy to follow by ear.",
    "Be warm, direct, and concise.",
    "Do not use markdown, bullets, or emoji.",
    "If you do not know something, say so.",
    "Remember what has already been said in this conversation.",
  ].join(" ");
}

export function textInstructions(languageLabel: string) {
  return [
    "You are Auric, a concise assistant.",
    `Reply in ${languageLabel}.`,
    "Use Markdown when it helps, including fenced code blocks for code.",
    "Do not invent personal facts about the user.",
    "If you are unsure, say so.",
  ].join(" ");
}

export const PRIVACY_NOTICE =
  "Auric does not store microphone recordings. Your voice is streamed to OpenAI to produce a reply, and OpenAI may retain audio under your API organization's data controls. Replay audio stays in this browser tab and is not uploaded.";
