# Auric

Auric is a real-time voice conversation app. You speak through the microphone, a live model answers in audio, and the transcript appears as the reply is generated. You can interrupt, mute, switch to typing, and keep the same conversation.

The voice path uses the OpenAI Realtime API over WebRTC. The browser sends a session description to this app. The server attaches the session configuration and calls OpenAI with `OPENAI_API_KEY`. That key never ships to the browser.

## What you can do

- Start and end a live call
- Talk continuously, with semantic voice activity detection, or hold to talk when detection is off
- Hear a reply start before the full response is finished
- Read the transcript while audio plays
- Interrupt by speaking or with the interrupt control
- Mute the microphone, mute Auric, pause or resume playback, and replay a reply in the current tab
- Switch to text without clearing history, including Markdown and code blocks
- Copy or retry a reply
- Search, rename, delete, and reset conversations
- Choose voice, language, volume, theme, and whether replay audio stays in the tab

## Requirements

- Node.js 22 or newer
- A browser that supports microphone capture and WebRTC (current Chrome, Edge, Safari, or Firefox)
- An OpenAI API key with access to the Realtime API
- HTTPS, or `localhost`, for microphone access

Postgres is optional. Without `DATABASE_URL`, conversations stay in memory for the life of one server process.

## Setup

```bash
npm install
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`. In production, also set `AUTH_SECRET` to a random string of at least 16 characters. Development uses a built-in fallback and prints no secret to the browser.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), choose **Start call**, and allow the microphone.

### Environment

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only key for Realtime and text chat |
| `OPENAI_REALTIME_MODEL` | Realtime model. Default `gpt-realtime-2.1` |
| `OPENAI_TEXT_MODEL` | Typed-chat model. Default `gpt-5.4-mini` |
| `OPENAI_TRANSCRIBE_MODEL` | Input transcript model. Default `gpt-4o-mini-transcribe` |
| `AUTH_SECRET` | Signs the httpOnly session cookie. Required in production |
| `DATABASE_URL` | Postgres connection string. Optional locally |
| `OPENAI_BASE_URL` | Optional API root. Default `https://api.openai.com/v1` |
| `OPENAI_REALTIME_BASE_URL` | Optional Realtime calls URL |
| `NEXT_PUBLIC_APP_URL` | Public origin, used in documentation and deployment |

Do not create a `NEXT_PUBLIC_` variable for the API key.

### Database

The schema is in `src/lib/db/schema.ts`, with SQL in `drizzle/0000_init.sql`.

```bash
# apply the checked-in SQL
psql "$DATABASE_URL" -f drizzle/0000_init.sql

# or push the Drizzle schema directly
npm run db:push
```

Tables: `users`, `conversations`, `messages`, `user_settings`. Deleting a user or conversation cascades. Message rows can store an audio MIME type and byte length. They do not store audio bytes or microphone recordings.

Auric identifies a browser with a signed httpOnly cookie and creates a guest user. Conversation routes only read and write that user's rows.

### Production

Deploy the Next.js app to Vercel or another Node.js host. Set the environment variables above in the host, not in client code. Use a managed Postgres database if more than one server process will run; the in-memory store is not shared across instances.

Realtime media flows directly between the browser and OpenAI after the server completes the SDP exchange. The host must allow outbound HTTPS to `https://api.openai.com`. The browser needs microphone permission on your origin.

Rate limits are enforced per server instance: 10 voice sessions per hour and 30 typed messages per 10 minutes for each guest user.

## Scripts

```bash
npm run dev
npm run test
npm run lint
npm run typecheck
npm run build
npm start
```

## Tests

Automated tests cover:

- Session state transitions, including interrupt and reconnect
- Realtime event mapping and stale-delta cancellation
- Session cookie signing
- Rate limiting
- Conversation ownership, reset, and audio metadata
- Voice-session creation without leaking the API key
- Typed chat authorization, streaming, and retry
- A source scan that browser files do not reference `OPENAI_API_KEY`

These need a person and a real key:

- Allow, then deny, microphone permission
- A multi-turn spoken conversation
- Interrupt Auric while audio is playing
- Drop the network during a call and confirm reconnect or the text fallback
- End the call and confirm the microphone indicator turns off
- Phone-width and desktop layouts

## Privacy

Auric does not store raw microphone audio. Replay clips stay in the browser tab and are discarded when you reset the conversation, switch calls, or leave, unless **Keep replay audio in this tab** is on. Even then, the audio is not uploaded. If that option is on, the database may store the clip's MIME type and size.

OpenAI receives the live audio in order to answer. How long OpenAI keeps that audio depends on your API organization's data controls, including any zero-retention setting on the account. Auric cannot override those provider settings. Session tokens and API keys are not written to the database.

Performance timings in Voice settings are durations and counts only. They do not include what was said.

## Architecture

- `src/lib/session/machine.ts` is the call state machine.
- `src/lib/session/turn.ts` applies transcripts, interruptions, and cancellation.
- `src/lib/providers/openai-realtime.ts` is the browser WebRTC provider.
- `src/lib/providers/openai-server.ts` exchanges SDP with OpenAI.
- `src/app/api/realtime/session/route.ts` is the only voice entry point and keeps the API key on the server.
- `src/app/api/chat/route.ts` streams typed replies.
- `src/lib/store` persists guests, settings, conversations, and messages in Postgres or memory.

The provider interface is the browser class: `connect`, `sendText`, `interrupt`, `updateSettings`, `disconnect`, and `subscribe`. Server session creation is `createRealtimeCall`. A later provider can implement the same browser methods and map its own events in `mapRealtimeEvent`.

## Known limitations

- Voice and typed chat both require `OPENAI_API_KEY`. Typed chat uses a separate text model. Saved messages are sent as context, but a typed reply is not generated inside the live Realtime session unless the call is already connected.
- The Realtime voice cannot be changed after the model has spoken in that session. The setting applies on the next call.
- OpenAI does not provide exact word-to-audio alignment. The transcript grows as transcript events arrive. Auric does not pretend that highlight is word-level.
- Pausing live WebRTC audio can skip ahead when you resume, because the call is live. Replay uses the in-memory recording of that reply when the browser can record the remote stream.
- With voice activity detection off, the call is hold-to-talk. Barge-in while Auric is speaking is reliable when detection is on, which is the default.
- A dropped call is retried once. If that fails, the error offers another call or typing.
- Realtime sessions end at the provider's session limit (currently 60 minutes).
- Rate limits and the guest session are per server process when Postgres is not configured.
- Guest identity is a signed cookie, not an email login. Add an auth provider later if accounts need email verification.
- `OPENAI_TRANSCRIBE_MODEL` must be a model your key can call. If user captions never appear, the model still hears the audio; check that transcription model name.
