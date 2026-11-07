"""Run the Colab training notebook end to end on CPU with whisper-tiny and gTTS clips (CI smoke test)."""
import json, os, re, sys
os.makedirs("data/clips", exist_ok=True)
from gtts import gTTS
lines = ["வணக்கம் சார் உங்களுக்கு என்ன வேணும்", "இந்த chain ரெண்டு gram தான்", "wastage பத்து percent போடுறோம்",
         "நாளைக்கு order ready ஆயிடும்", "customer கிட்ட design காமிங்க", "இன்னைக்கு gold rate கொஞ்சம் கம்மி"]
rows = []
for i, t in enumerate(lines):
    gTTS(t, lang="ta").save(f"data/clips/{i}.mp3")
    rows.append({"file": f"clips/{i}.mp3", "text": t})
open("data/train.jsonl", "w").write("\n".join(json.dumps(r, ensure_ascii=False) for r in rows[:4]))
open("data/test.jsonl", "w").write("\n".join(json.dumps(r, ensure_ascii=False) for r in rows[4:]))
open("data/README.txt", "w").write("smoke test data")
nb = json.load(open(sys.argv[1]))
src = []
for c in nb["cells"]:
    if c["cell_type"] != "code":
        continue
    code = c["source"]
    if "nvidia-smi" in code or "files.upload" in code:
        continue
    code = code.replace("login()", "pass").replace('whoami()["name"]', '"smoke"')
    code = code.replace("model.push_to_hub(repo, private=True)", "print('would push', repo)").replace("proc.push_to_hub(repo, private=True)", "")
    src.append("\n".join(l for l in code.split("\n") if not l.strip().startswith("!")))
exec(compile("\n\n".join(src), "notebook", "exec"), {})
print("SMOKE OK")
