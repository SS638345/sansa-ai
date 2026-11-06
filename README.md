# SANSA Voice to Text

Simple voice to text converter. Pesunga, text aagidum. Tamil + English.

## Features

- **Live mic (free):** words appear while you speak. Uses the browser's built-in speech engine (Chrome, Edge, Android Chrome, Safari). No API key, no cost.
- **Record & convert (AI):** record a clip, then the whole clip is converted with OpenAI `gpt-4o-mini-transcribe`. Better for long talks.
- **Upload audio (AI):** mp3, m4a, wav, ogg, webm, WhatsApp voice notes (up to 25 MB). Other formats are converted with ffmpeg.
- Languages: Tamil (`ta-IN`), English India (`en-IN`), English US (`en-US`).
- Edit the text, copy it, or download it as `.txt`. The text is kept in your browser if you reload.

## Run it

Needs Node.js 20+ (and ffmpeg only if you upload unusual formats).

```bash
npm install
cp .env.example .env    # optional: add OPENAI_API_KEY for the AI modes
npm run dev             # web on http://localhost:5173, API on :3001
```

Production:

```bash
npm run build
npm start               # serves the app + API on http://localhost:3001
```

## AI modes (optional, paid)

Live mic works without any key. To turn on Record & convert and Upload audio, put an OpenAI API key in `.env`:

```
OPENAI_API_KEY=sk-...
```

Cost is per minute of audio, billed by OpenAI. Without a key the AI tabs show a note and stay disabled.

## Project layout

```
server/index.js        Express API: GET /api/status, POST /api/transcribe?lang=ta|en
server/audio.js        Audio format detection + ffmpeg conversion
src/App.tsx            The UI
src/hooks/             useLiveDictation (browser speech), useVoiceRecorder (MediaRecorder)
```

The audio helpers and recorder hook are adapted from the earlier SANSA AI project.

## Launch

- **GitHub Pages (free):** `.github/workflows/pages.yml` builds and publishes the app on every push to `main`. Live mic works there; the AI tabs stay off because Pages has no server. In repo Settings → Pages, set Source to "GitHub Actions" if the first run asks for it.
- **With AI modes:** run `npm run build && npm start` on any Node host (Render, Railway, a VPS) and set `OPENAI_API_KEY`.
