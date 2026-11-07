"""Benchmarks engine options on the runner: which public Indian-language Whisper
fine-tunes exist, and fp32 vs CTranslate2 int8 speed/accuracy for Tamil."""
import json
import subprocess
import time
import urllib.request

import numpy as np

# 1. Public fine-tunes per language
for q in ["vasista22", "whisper-medium-ml", "whisper-small-bn", "whisper-medium-mr", "whisper-medium-gu"]:
    url = f"https://huggingface.co/api/models?search={q}&limit=40&sort=downloads"
    try:
        rows = json.load(urllib.request.urlopen(url, timeout=30))
        print(f"## {q}:", [(r["id"], r.get("downloads"), r.get("gated", False)) for r in rows][:25], flush=True)
    except Exception as e:
        print(q, "error", e)

# 2. Speed: fp32 transformers vs faster-whisper int8
def load(path):
    pcm = subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype=np.float32).copy()

audio = load("/tmp/audio/long.mp3")
print("long.mp3 seconds:", len(audio) / 16000, flush=True)
expected = open("/tmp/audio/long.txt").read()
print("EXPECTED:", expected, flush=True)

import torch
from transformers import AutoProcessor, GenerationConfig, WhisperForConditionalGeneration
torch.set_num_threads(2)  # like a free CPU basic Space
m = WhisperForConditionalGeneration.from_pretrained("vasista22/whisper-tamil-medium").eval()
m.generation_config = GenerationConfig.from_pretrained("openai/whisper-medium")
p = AutoProcessor.from_pretrained("vasista22/whisper-tamil-medium")
t0 = time.time(); out = []
for s in range(0, len(audio), 25 * 16000):
    f = p(audio[s:s + 25 * 16000], sampling_rate=16000, return_tensors="pt").input_features
    with torch.inference_mode():
        ids = m.generate(f, language="ta", task="transcribe", num_beams=1, max_new_tokens=440)
    out.append(p.batch_decode(ids, skip_special_tokens=True)[0])
print(f"FP32 2 threads: {time.time() - t0:.1f} s ::", " ".join(out), flush=True)

q = torch.quantization.quantize_dynamic(m, {torch.nn.Linear}, dtype=torch.qint8)
t0 = time.time(); out = []
for s in range(0, len(audio), 25 * 16000):
    f = p(audio[s:s + 25 * 16000], sampling_rate=16000, return_tensors="pt").input_features
    with torch.inference_mode():
        ids = q.generate(f, language="ta", task="transcribe", num_beams=1, max_new_tokens=440)
    out.append(p.batch_decode(ids, skip_special_tokens=True)[0])
print(f"TORCH INT8 2 threads: {time.time() - t0:.1f} s ::", " ".join(out), flush=True)

subprocess.run(["ct2-transformers-converter", "--model", "vasista22/whisper-tamil-medium", "--output_dir", "/tmp/ct2",
                "--quantization", "int8", "--copy_files", "tokenizer.json", "preprocessor_config.json"], check=False)
import shutil, os
if not os.path.exists("/tmp/ct2/tokenizer.json"):
    from huggingface_hub import hf_hub_download
    for fn in ["tokenizer.json"]:
        try:
            shutil.copy(hf_hub_download("openai/whisper-medium", fn), "/tmp/ct2/" + fn)
        except Exception as e:
            print("tokenizer copy", e)
from faster_whisper import WhisperModel
fw = WhisperModel("/tmp/ct2", device="cpu", compute_type="int8", cpu_threads=2)
t0 = time.time()
segs, _ = fw.transcribe(audio, language="ta", beam_size=1, vad_filter=True)
text = " ".join(s.text.strip() for s in segs)
print(f"CT2 INT8 2 threads: {time.time() - t0:.1f} s ::", text, flush=True)
t0 = time.time()
segs, _ = fw.transcribe(audio, language="ta", beam_size=5, vad_filter=True)
text = " ".join(s.text.strip() for s in segs)
print(f"CT2 INT8 beam5 2 threads: {time.time() - t0:.1f} s ::", text, flush=True)
