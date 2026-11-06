"""SANSA speech engine: free, self-hosted Indian-language speech to text.

Two open models behind one small HTTP API, for a free Hugging Face Space
(Docker, CPU basic). The web app sends <=25 s WAV pieces.

- Tamil: vasista22/whisper-tamil-medium (IIT Madras SPRING Lab fine-tune of
  Whisper medium). Public, no login needed.
- All 22 scheduled Indian languages: AI4Bharat IndicConformer 600M. This model
  is gated on Hugging Face: it loads only when HF_TOKEN is set, from an account
  that accepted its terms. Without it, only the Whisper languages work.
"""
import io
import logging
import os

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
}
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

whisper = {}
for lang, (model_id, base_id) in WHISPER_MODELS.items():
    model = WhisperForConditionalGeneration.from_pretrained(model_id).eval()
    # Fine-tunes saved with old transformers lack language/task settings; borrow the base model's.
    model.generation_config = GenerationConfig.from_pretrained(base_id)
    whisper[lang] = (model, AutoProcessor.from_pretrained(model_id))

conformer = None
if HF_TOKEN:
    try:
        conformer = AutoModel.from_pretrained(CONFORMER_ID, trust_remote_code=True, token=HF_TOKEN).eval()
    except Exception as e:  # keep serving the Whisper languages
        log.error("Could not load %s: %s", CONFORMER_ID, e)
else:
    log.warning("HF_TOKEN not set: %s (gated) is off; only %s work.", CONFORMER_ID, sorted(whisper))

LANGS = set(whisper) | (CONFORMER_LANGS if conformer is not None else set())


def run_whisper(lang: str, wav: torch.Tensor) -> str:
    model, proc = whisper[lang]
    feats = proc(wav[0].numpy(), sampling_rate=16000, return_tensors="pt").input_features
    ids = model.generate(feats, language=lang, task="transcribe", num_beams=1, max_new_tokens=440)
    return proc.batch_decode(ids, skip_special_tokens=True)[0]


def run_conformer(lang: str, wav: torch.Tensor) -> str:
    text = conformer(wav, lang, DECODER)
    if isinstance(text, (list, tuple)):
        text = " ".join(map(str, text))
    return str(text)


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
        "conformer": CONFORMER_ID if conformer is not None else None,
        "languages": sorted(LANGS),
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form(...)):
    lang = language.split("-")[0].lower()
    if lang == "od":
        lang = "or"
    if lang not in LANGS:
        hint = " Set HF_TOKEN on the engine to turn on all Indian languages." if lang in CONFORMER_LANGS else ""
        raise HTTPException(400, f"Language '{language}' is not available on this SANSA engine.{hint}")
    data = await file.read()
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
    with torch.inference_mode():
        text = run_whisper(lang, wav) if lang in whisper else run_conformer(lang, wav)
    return {"transcript": text.strip(), "language": lang}
