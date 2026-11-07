"""SANSA speech engine: free, self-hosted Indian-language speech to text.

Open models behind one small HTTP API, for a free Hugging Face Space
(Docker, CPU basic). The web app sends <=25 s WAV pieces.

- Public Whisper fine-tunes per language (no login): Tamil, Telugu, Kannada,
  Hindi, Gujarati (IIT Madras SPRING Lab, vasista22), Malayalam, Bengali.
  Tamil is loaded at start; the others load on first use and stay cached.
- Every other scheduled Indian language: AI4Bharat IndicConformer 600M. This
  model is gated on Hugging Face: it loads only when HF_TOKEN is set, from an
  account that accepted its terms.
"""
import io
import logging
import os
import threading
from collections import OrderedDict

import numpy as np
import soundfile as sf
import torch
import torchaudio
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoModel, AutoProcessor, GenerationConfig, WhisperForConditionalGeneration

log = logging.getLogger("uvicorn.error")

CONFORMER_ID = os.environ.get("MODEL_ID", "ai4bharat/indic-conformer-600m-multilingual")
DECODER = os.environ.get("DECODER", "rnnt")  # "rnnt" is more accurate, "ctc" is faster
HF_TOKEN = os.environ.get("HF_TOKEN") or None
# language -> (fine-tuned Whisper model, base model whose generation config it needs)
WHISPER_MODELS = {
    "ta": (os.environ.get("TAMIL_MODEL", "vasista22/whisper-tamil-medium"), "openai/whisper-medium"),
    "te": ("vasista22/whisper-telugu-medium", "openai/whisper-medium"),
    "kn": ("vasista22/whisper-kannada-medium", "openai/whisper-medium"),
    "hi": ("vasista22/whisper-hindi-medium", "openai/whisper-medium"),
    "gu": ("vasista22/whisper-gujarati-medium", "openai/whisper-medium"),
    "ml": ("thennal/whisper-medium-ml", "openai/whisper-medium"),
    "bn": ("anuragshas/whisper-small-bn", "openai/whisper-small"),
}
PRELOAD = [x for x in os.environ.get("PRELOAD", "ta").split(",") if x]
MAX_LOADED = int(os.environ.get("MAX_LOADED", "3"))  # medium fp32 is ~3 GB of RAM each; free Space has 16 GB
MAX_SECONDS = 40
CONFORMER_LANGS = {
    "as", "bn", "brx", "doi", "gu", "hi", "kn", "kok", "ks", "mai", "ml",
    "mni", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur",
}
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://ss638345.github.io,https://voice.sansaai.in,http://localhost:5173,http://localhost:4173",
).split(",")

torch.set_num_threads(max(1, os.cpu_count() or 1))
model_lock = threading.Lock()  # one inference at a time; CPU is shared anyway
loaded: "OrderedDict[str, tuple]" = OrderedDict()


def get_whisper(lang: str):
    """Returns (model, processor), loading it on first use and evicting the least recently used."""
    if lang in loaded:
        loaded.move_to_end(lang)
        return loaded[lang]
    model_id, base_id = WHISPER_MODELS[lang]
    log.info("Loading %s for %s", model_id, lang)
    model = WhisperForConditionalGeneration.from_pretrained(model_id).eval()
    # Fine-tunes saved with old transformers lack language/task settings; borrow the base model's.
    model.generation_config = GenerationConfig.from_pretrained(base_id)
    loaded[lang] = (model, AutoProcessor.from_pretrained(model_id))
    while len(loaded) > MAX_LOADED:
        # Evict the least recently used model, but keep the preloaded (main) languages.
        old = next((k for k in loaded if k not in PRELOAD and k != lang), None)
        if old is None:
            break
        del loaded[old]
        log.info("Unloaded %s", old)
    return loaded[lang]


for lang in PRELOAD:
    get_whisper(lang)


def prefetch():
    """Download the other languages' weights in the background so their first use is quick."""
    from huggingface_hub import snapshot_download
    for model_id, base_id in WHISPER_MODELS.values():
        for repo in (model_id, base_id):
            try:
                snapshot_download(repo, allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model"])
            except Exception as e:
                log.warning("Prefetch of %s failed: %s", repo, e)


if os.environ.get("PREFETCH", "1") == "1":
    threading.Thread(target=prefetch, daemon=True).start()

conformer = None
if HF_TOKEN:
    try:
        conformer = AutoModel.from_pretrained(CONFORMER_ID, trust_remote_code=True, token=HF_TOKEN).eval()
    except Exception as e:  # keep serving the Whisper languages
        log.error("Could not load %s: %s", CONFORMER_ID, e)
else:
    log.warning("HF_TOKEN not set: %s (gated) is off.", CONFORMER_ID)

LANGS = set(WHISPER_MODELS) | (CONFORMER_LANGS if conformer is not None else set())


def run_whisper(lang: str, wav: torch.Tensor) -> str:
    model, proc = get_whisper(lang)
    feats = proc(wav[0].numpy(), sampling_rate=16000, return_tensors="pt").input_features
    ids = model.generate(feats, language=lang, task="transcribe", num_beams=1, max_new_tokens=440)
    return proc.batch_decode(ids, skip_special_tokens=True)[0]


def run_conformer(lang: str, wav: torch.Tensor) -> str:
    text = conformer(wav, lang, DECODER)
    if isinstance(text, (list, tuple)):
        text = " ".join(map(str, text))
    return str(text)


def is_silent(wav: torch.Tensor) -> bool:
    """Whisper invents text for silence; skip pieces with no speech-level energy."""
    frames = wav[0].numpy()
    n = len(frames) // 400
    if n == 0:
        return True
    rms = np.sqrt((frames[: n * 400].reshape(n, 400) ** 2).mean(axis=1))
    return float(np.percentile(rms, 95)) < 0.003


app = FastAPI(title="SANSA speech engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {
        "ok": True,
        "whisper": {k: v[0] for k, v in WHISPER_MODELS.items()},
        "loaded": list(loaded),
        "conformer": CONFORMER_ID if conformer is not None else None,
        "languages": sorted(LANGS),
    }


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), language: str = Form(...)):
    # A plain def runs in a worker thread, so health checks stay answered during long pieces.
    lang = language.split("-")[0].lower()
    if lang == "od":
        lang = "or"
    if lang not in LANGS:
        hint = " Set HF_TOKEN on the engine to turn on all Indian languages." if lang in CONFORMER_LANGS else ""
        raise HTTPException(400, f"Language '{language}' is not available on this SANSA engine.{hint}")
    data = file.file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Audio piece too large; send pieces of 25 seconds or less.")
    try:
        samples, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    except Exception:
        raise HTTPException(400, "Could not read the audio. Send 16-bit WAV.")
    wav = torch.from_numpy(samples.T.copy()).mean(dim=0, keepdim=True)
    if sr != 16000:
        wav = torchaudio.functional.resample(wav, sr, 16000)
    if wav.shape[1] > MAX_SECONDS * 16000:
        raise HTTPException(413, f"Audio piece longer than {MAX_SECONDS} s.")
    if wav.shape[1] < 1600 or is_silent(wav):
        return {"transcript": "", "language": lang}
    with model_lock, torch.inference_mode():
        try:
            text = run_whisper(lang, wav) if lang in WHISPER_MODELS else run_conformer(lang, wav)
        except Exception as e:
            log.exception("Transcription failed for %s", lang)
            raise HTTPException(500, f"The engine could not convert this piece ({type(e).__name__}). Try again.")
    return {"transcript": text.strip(), "language": lang}
