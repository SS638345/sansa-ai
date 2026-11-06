"""SANSA speech engine: free, self-hosted Indian-language speech to text.

Runs AI4Bharat's open IndicConformer (600M, multilingual, all 22 scheduled
Indian languages) behind a small HTTP API. Designed for a free Hugging Face
Space (Docker, CPU basic). The web app sends <=25 s WAV pieces.
"""
import io
import os

import soundfile as sf
import torch
import torchaudio
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoModel

MODEL_ID = os.environ.get("MODEL_ID", "ai4bharat/indic-conformer-600m-multilingual")
DECODER = os.environ.get("DECODER", "rnnt")  # "rnnt" is more accurate, "ctc" is faster
MAX_SECONDS = 40
LANGS = {
    "as", "bn", "brx", "doi", "gu", "hi", "kn", "kok", "ks", "mai", "ml",
    "mni", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur",
}
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://ss638345.github.io,https://voice.sansaai.in,http://localhost:5173,http://localhost:4173",
).split(",")

torch.set_num_threads(max(1, os.cpu_count() or 1))
model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True, token=os.environ.get("HF_TOKEN"))
model.eval()

app = FastAPI(title="SANSA speech engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {"ok": True, "model": MODEL_ID, "decoder": DECODER, "languages": sorted(LANGS)}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form(...)):
    lang = language.split("-")[0].lower()
    if lang == "od":
        lang = "or"
    if lang not in LANGS:
        raise HTTPException(400, f"Language '{language}' is not supported by the SANSA engine.")
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
        text = model(wav, lang, DECODER)
    if isinstance(text, (list, tuple)):
        text = " ".join(map(str, text))
    return {"transcript": str(text).strip(), "language": lang}
