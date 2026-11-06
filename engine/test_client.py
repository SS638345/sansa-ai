"""Sends an audio file to a running SANSA engine the way the web app does.

Usage: python test_client.py <audio file> [language] [engine url]
Splits into <=25 s 16 kHz mono WAV pieces with ffmpeg, posts each to /transcribe.
"""
import io
import subprocess
import sys
import time
import wave

import requests

path = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 else "ta"
url = (sys.argv[3] if len(sys.argv) > 3 else "http://localhost:7860").rstrip("/")

pcm = subprocess.run(
    ["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
    capture_output=True, check=True,
).stdout
step = 25 * 16000 * 2
texts = []
for n, start in enumerate(range(0, len(pcm), step), 1):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm[start:start + step])
    t0 = time.time()
    r = requests.post(f"{url}/transcribe", files={"file": ("piece.wav", buf.getvalue(), "audio/wav")},
                      data={"language": lang}, timeout=600)
    r.raise_for_status()
    text = r.json()["transcript"]
    print(f"[part {n}, {time.time() - t0:.1f} s] {text}", flush=True)
    texts.append(text)
print("FULL:", " ".join(texts))
