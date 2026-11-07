"""Exports a Whisper fine-tune to ONNX files that transformers.js can run in the browser,
using transformers.js's own conversion scripts, then uploads them as a (free) model repo on
the token owner's Hugging Face account.

Usage: python webmodel/export.py <source model> <base model for generation config> <target repo name>
Run from a checkout of huggingface/transformers.js (v3) with its scripts/requirements.txt installed.
"""
import json
import os
import shutil
import subprocess
import sys

from huggingface_hub import HfApi, hf_hub_download

src, base, name = sys.argv[1:4]
# The scripts pick Whisper export settings by matching the base name (e.g. "whisper-medium")
# inside the model path, so convert a local copy whose path contains it.
from huggingface_hub import snapshot_download
local = f"sansa/{base.split('/')[-1]}-{name}"
snapshot_download(src, local_dir=local, allow_patterns=["*.json", "*.txt", "*.safetensors", "*.bin", "*.model"])
shutil.copy(hf_hub_download(base, "generation_config.json"), f"{local}/generation_config.json")
help_text = subprocess.run([sys.executable, "-m", "scripts.convert", "--help"], capture_output=True, text=True).stdout
# onnxslim turns the positions Slice's start into a scalar, which onnxruntime rejects at run time.
slim = ["--skip_onnxslim"] if "skip_onnxslim" in help_text else []
print("convert options:", slim, flush=True)
subprocess.run([sys.executable, "-m", "scripts.convert", "--quantize", "--model_id", local, *slim,
                "--task", "automatic-speech-recognition-with-past", "--modes", "fp16", "q8", "q4"], check=True)
out = os.path.join("models", local)
print("exported:", sorted(os.listdir(f"{out}/onnx")), flush=True)

# Fine-tunes saved with old transformers lack language/task tokens; use the base model's.
shutil.copy(hf_hub_download(base, "generation_config.json"), f"{out}/generation_config.json")
for f in ["tokenizer.json", "tokenizer_config.json", "preprocessor_config.json", "special_tokens_map.json",
          "added_tokens.json", "normalizer.json", "vocab.json", "merges.txt"]:
    if not os.path.exists(f"{out}/{f}"):
        try:
            shutil.copy(hf_hub_download(base, f), f"{out}/{f}")
            print("copied from base:", f)
        except Exception:
            pass

api = HfApi(token=os.environ["HF_TOKEN"])
info = api.model_info(src)
license_ = info.card_data.get("license", "unknown") if info.card_data else "unknown"
repo = f"{api.whoami()['name']}/{name}"
open(f"{out}/README.md", "w").write(f"""---
license: {license_}
library_name: transformers.js
pipeline_tag: automatic-speech-recognition
base_model: {src}
---

ONNX export of [{src}](https://huggingface.co/{src}) for in-browser use with
transformers.js in SANSA Voice to Text. All credit for the model to its authors.
""")
sizes = {f: round(os.path.getsize(f"{out}/onnx/{f}") / 1e6) for f in os.listdir(f"{out}/onnx")}
print("license:", license_, "sizes MB:", json.dumps(sizes), flush=True)
api.create_repo(repo, exist_ok=True)
# Only the variants the web app loads (the merged decoder replaces the two separate ones).
keep = ["*.json", "*.txt", "README.md"] + [f"onnx/{f}" for f in [
    "encoder_model.onnx", "encoder_model_fp16.onnx", "encoder_model_quantized.onnx",
    "decoder_model_merged.onnx", "decoder_model_merged_fp16.onnx", "decoder_model_merged_q4.onnx",
    "decoder_model_merged_quantized.onnx"]]
api.upload_folder(folder_path=out, repo_id=repo, delete_patterns=["onnx/*"], allow_patterns=keep,
                  commit_message=f"ONNX export of {src} (transformers.js scripts)")
print("UPLOADED", repo, flush=True)
