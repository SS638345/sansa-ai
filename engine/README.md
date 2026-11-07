---
title: SANSA Speech Engine
emoji: 🎙️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# SANSA speech engine

Free, self-hosted speech to text for Indian languages:

- **Tamil** with [vasista22/whisper-tamil-medium](https://huggingface.co/vasista22/whisper-tamil-medium)
  (IIT Madras SPRING Lab fine-tune of Whisper medium). Public, works with no login.
- **All 22 scheduled languages** with [AI4Bharat IndicConformer](https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual) (MIT).
  This model is gated: it turns on only when the Space has an `HF_TOKEN` secret.

- `GET /` health check, lists languages.
- `POST /transcribe` multipart: `file` (WAV, ≤25 s recommended) and `language` (`ta`, `hi`, `te`, … or `ta-IN`).
  Returns `{"transcript": "..."}`.

## Deploy on a free Hugging Face Space (one file)

1. Create a free account at https://huggingface.co.
2. Open https://huggingface.co/new-space → name `sansa-engine` → SDK **Docker** (Blank) → hardware
   **CPU basic (free)** → **Create Space**.
3. In the Space: **Files** → **+ Add file** → **Create a new file**. Name it `Dockerfile`, paste the
   contents of [`engine/space/Dockerfile`](space/Dockerfile), and **Commit**.
   It pulls this repo's `engine/` folder, so later engine updates only need **Settings → Factory rebuild**.
4. Wait for the build (first start downloads the models, a few minutes). The Space URL looks like
   `https://<user>-sansa-engine.hf.space`.
5. Paste that URL into the app (Speech engine → SANSA engine), or set the repo variable
   `VITE_SANSA_ENGINE_URL` so every visitor uses it.
6. Optional, for languages other than Tamil: accept the terms at
   https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual, then add a Space secret `HF_TOKEN`
   with a read token from Settings → Access Tokens.

Env vars: `HF_TOKEN`, `TAMIL_MODEL`, `DECODER` (`rnnt` default, `ctc` faster), `ALLOWED_ORIGINS` (comma list).
Free CPU Spaces sleep after ~48 h without use; the first request then takes 1–2 minutes.
