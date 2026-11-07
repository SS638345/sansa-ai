/**
 * Free background-noise clean-up with RNNoise (open source, runs in the browser as WebAssembly).
 * The ~5 MB module loads only the first time someone turns noise clean-up on.
 *
 * RNNoise works on 48 kHz audio in 10 ms frames. SANSA already decodes to 16 kHz mono, so each
 * 160-sample frame is stretched to 480 samples, cleaned, and shrunk back. That keeps memory small
 * even for long files (no full 48 kHz copy).
 */
import { decodeTo16kMono } from "./localWhisper";
import { toWav } from "./sarvam";

const IN = 160; // 10 ms at 16 kHz
const OUT = 480; // 10 ms at 48 kHz
const SCALE = 32768; // RNNoise expects 16-bit sample values

export async function denoiseToWav(blob: Blob, onProgress?: (fraction: number) => void): Promise<Blob> {
  const audio = await decodeTo16kMono(blob);
  const { Rnnoise } = await import("@shiguredo/rnnoise-wasm");
  const rnnoise = await Rnnoise.load();
  const state = rnnoise.createDenoiseState();
  const out = new Float32Array(audio.length);
  const frame = new Float32Array(OUT);
  try {
    for (let pos = 0; pos < audio.length; pos += IN) {
      // Linear 3x upsample of this frame (the next frame's first sample closes the gap).
      for (let j = 0; j < OUT; j++) {
        const x = pos + j / 3;
        const i = Math.floor(x);
        const a = audio[i] ?? 0;
        const b = audio[i + 1] ?? a;
        frame[j] = (a + (b - a) * (x - i)) * SCALE;
      }
      state.processFrame(frame);
      // Average each group of 3 back down to 16 kHz.
      for (let k = 0; k < IN && pos + k < audio.length; k++) {
        out[pos + k] = (frame[3 * k] + frame[3 * k + 1] + frame[3 * k + 2]) / (3 * SCALE);
      }
      if (onProgress && pos % (IN * 3000) === 0) {
        onProgress(pos / audio.length);
        await new Promise((r) => setTimeout(r)); // keep the page responsive
      }
    }
  } finally {
    state.destroy();
  }
  return toWav(out);
}
