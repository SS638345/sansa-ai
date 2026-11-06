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

Free, self-hosted speech to text for all 22 scheduled Indian languages using
[AI4Bharat IndicConformer](https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual) (MIT).

- `GET /` health check, lists languages.
- `POST /transcribe` multipart: `file` (WAV, ≤25 s recommended) and `language` (`ta`, `hi`, `te`, … or `ta-IN`).
  Returns `{"transcript": "..."}`.

## Deploy on a free Hugging Face Space

1. Create a Hugging Face account, then **New Space** → SDK **Docker** → hardware **CPU basic (free)**.
2. Upload `app.py`, `requirements.txt`, `Dockerfile` and this `README.md` to the Space.
3. Open https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual and accept the terms if asked.
   If the model is gated, add a Space secret `HF_TOKEN` with a read token from Settings → Access Tokens.
4. Wait for the build (first start downloads ~2.5 GB, a few minutes). The Space URL looks like
   `https://<user>-<space>.hf.space`.
5. Paste that URL into the app (Speech engine → SANSA engine), or set the repo variable
   `VITE_SANSA_ENGINE_URL` so every visitor uses it.

Env vars: `DECODER` (`rnnt` default, `ctc` faster), `ALLOWED_ORIGINS` (comma list).
Free CPU Spaces sleep after ~48 h without use; the first request then takes 1–2 minutes.
