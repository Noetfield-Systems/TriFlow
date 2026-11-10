# TriFlow — Multilingual Voice Studio

[Live product](https://triflow-app-production.up.railway.app/) · Independently built by Noetfield Systems

TriFlow lets a user select three languages, practice spoken conversations, view translations and use browser-generated speech. The flagship feature is **automatic mid-sentence code switching with one uninterrupted streaming transcription session** when a supported multilingual speech provider is configured.

## What works without credentials
- No signup, invite code or payment to open the application.
- Premium mobile-responsive UI; three configurable languages, language-learning modes, session export and saved phrases.
- Free browser speech-recognition mode in supported browsers (one selected recognition language at a time).
- Browser speech synthesis, and optional browser-local translation when supported.
- Sample lab, explicitly labeled as illustrative.

## What requires credentials
- `DEEPGRAM_API_KEY`: automatic 3-language speech recognition using Nova-3 `language=multi`, language hints, interim captions and word-level language tags.
- `CF_ACCOUNT_ID` and `CF_AI_API_TOKEN`: Cloudflare Workers AI similar to the LLM provider pattern used by SourceB (free tier is limited, not unlimited).
- `OPENAI_API_KEY`: optional LLM fallback.
- `SESSION_SECRET`: required for durable signed sessions between deploys. Set a random value at least 32 bytes.
All keys are supplied only via Railway environment variables. Never commit keys.

**SourceB's Retell receptionist is not a free multilingual streaming provider.** We do not proxy its customer conversations or business credentials.

## Deploy
The runnable source is the single self-contained `index.ts` Bun distribution, embedding the frontend; no external packages or build steps. Deploy with Railway as a repo-backed service, start command `bun index.ts`, healthcheck `/api/health`. `PORT` is read from Railway.

Local: install [Bun](https://bun.sh), run `bun index.ts`, visit `http://localhost:3000`. Run `node --test tests/*.test.mjs` for HTTP smoke tests (starts the Bun app itself).

## Important acceptance boundary
An Online deployment is not proof of three-language speech recognition. Complete provider E2E requires real keys and a real mixed-language microphone recording. Test the sample **“I think que podemos parler demain”** as natural speech on a real device. Confirm the whole utterance is detected in one open WebSocket, word language tags where available, timely translation and audible response.

The free Web Speech API mode requires manual language selection and must not be represented as full automatic code switching. Transcript processing depends on third-party service availability and privacy terms. See /privacy and /terms.

## Routes
- `/` main PWA
- `/api/health` and `/api/config` non-sensitive status
- `POST /api/session` issues signed session; no invite code
- `POST /api/stt-token` ephemeral Deepgram access token, if configured
- `POST /api/turn` LLM translation/chat/coach, if configured
- `/privacy`, `/terms`

## CI
`node --test tests/*.test.mjs` (Bun required) checks that the server serves assets, issues a session without invite, guards provider endpoints, exposes truthful configuration, and supplies legal pages. A real-provider acceptance test must be performed with the provider's credentials and microphone access.

TriFlow is independent from SourceB. No customer data is shared between them.
