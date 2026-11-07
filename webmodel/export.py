"""Exports a Whisper fine-tune to ONNX files that transformers.js can run in the browser,
then uploads them as a (free) model repo on the token owner's Hugging Face account.

Usage: python webmodel/export.py <source model> <base model for generation config> <target repo name>
"""
import json
import os
import shutil
import subprocess
import sys

import onnx
from huggingface_hub import HfApi, hf_hub_download
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.matmul_4bits_quantizer import MatMul4BitsQuantizer

src, base, name = sys.argv[1:4]
out = "/tmp/export"
shutil.rmtree(out, ignore_errors=True)
subprocess.run(["optimum-cli", "export", "onnx", "--model", src, "--task", "automatic-speech-recognition-with-past",
                "--opset", "17", out], check=True)
os.makedirs(f"{out}/onnx", exist_ok=True)
for f in os.listdir(out):
    if f.endswith(".onnx") or f.endswith(".onnx_data"):
        shutil.move(f"{out}/{f}", f"{out}/onnx/{f}")
for f in ["decoder_model.onnx", "decoder_with_past_model.onnx"]:
    if os.path.exists(f"{out}/onnx/{f}"):
        os.remove(f"{out}/onnx/{f}")
print("exported:", os.listdir(f"{out}/onnx"), flush=True)

enc = f"{out}/onnx/encoder_model.onnx"
dec = f"{out}/onnx/decoder_model_merged.onnx"
# q8 ("quantized" suffix) for both, q4 decoder, fp16 encoder: the variants the web app asks for.
for path in (enc, dec):
    quantize_dynamic(path, path.replace(".onnx", "_quantized.onnx"), weight_type=QuantType.QUInt8)
q4 = MatMul4BitsQuantizer(onnx.load(dec), block_size=32, is_symmetric=True)
q4.process()
onnx.save(q4.model.model, dec.replace(".onnx", "_q4.onnx"))
from onnxconverter_common import float16
onnx.save(float16.convert_float_to_float16(onnx.load(enc), keep_io_types=True),
          enc.replace(".onnx", "_fp16.onnx"))

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
license_ = (info.card_data or {}).get("license", "unknown") if info.card_data else "unknown"
user = api.whoami()["name"]
repo = f"{user}/{name}"
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
api.upload_folder(folder_path=out, repo_id=repo, commit_message=f"ONNX export of {src}")
print("UPLOADED", repo, flush=True)
