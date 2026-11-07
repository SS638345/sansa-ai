// Runs the uploaded web model with transformers.js in Node (CPU) on a known Tamil clip.
import { pipeline } from "@huggingface/transformers";
import { readFileSync } from "node:fs";

const [repo, wavPath, encDtype, decDtype] = process.argv.slice(2);
const buf = readFileSync(wavPath);
const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const t0 = Date.now();
const asr = await pipeline("automatic-speech-recognition", repo, {
  dtype: { encoder_model: encDtype, decoder_model_merged: decDtype },
});
const t1 = Date.now();
const out = await asr(audio, { language: "ta", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
console.log(`[${encDtype}/${decDtype}] load ${(t1 - t0) / 1000}s, run ${(Date.now() - t1) / 1000}s ::`, out.text);
