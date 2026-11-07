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
# The scripts pick Whisper export settings from config._name_or_path, which must name a base
# model. Make a local copy (same relative path, so it's found before the Hub) that says so.
from huggingface_hub import snapshot_download
snapshot_download(src, local_dir=src, allow_patterns=["*.json", "*.txt", "*.safetensors", "*.bin", "*.model"])
cfg = json.load(open(f"{src}/config.json"))
cfg["_name_or_path"] = base
json.dump(cfg, open(f"{src}/config.json", "w"), indent=2)
shutil.copy(hf_hub_download(base, "generation_config.json"), f"{src}/generation_config.json")
subprocess.run([sys.executable, "-m", "scripts.convert", "--quantize", "--model_id", src,
                "--modes", "fp16", "q8", "q4"], check=True)
out = os.path.join("models", src)
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
api.upload_folder(folder_path=out, repo_id=repo, delete_patterns=["onnx/*"],
                  commit_message=f"ONNX export of {src} (transformers.js scripts)")
print("UPLOADED", repo, flush=True)
