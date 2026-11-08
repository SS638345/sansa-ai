/**
 * Audio Cleanup: remove background noise from any recording, in the browser, at full quality.
 *
 * Decodes the file to 48 kHz mono (RNNoise's native rate, so no up/down-sampling), runs RNNoise
 * frame by frame, then optionally evens out the level. Nothing is uploaded.
 *
 *   light  = 70% cleaned + 30% original (keeps room sound, removes most hiss)
 *   normal = RNNoise output
 *   strong = RNNoise + a soft gate that lowers gaps between words (uses RNNoise's voice detector)
 */
export type Strength = "light" | "normal" | "strong";

export const RATE = 48000;
const FRAME = 480; // 10 ms at 48 kHz
const SCALE = 32768; // RNNoise expects 16-bit sample values
export const MAX_SECONDS = 20 * 60;
export const MAX_BYTES = 300 * 1024 * 1024;

export type CleanResult = { original: Float32Array; cleaned: Float32Array; seconds: number; noiseReducedDb: number };

/** Any audio/video file -> 48 kHz mono. Browser decoder first, ffmpeg.wasm for odd formats (amr, 3gp...). */
export async function decodeMono48k(blob: Blob): Promise<Float32Array> {
  const data = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer | null = null;
  try {
    decoded = await ctx.decodeAudioData(data);
  } catch {
    decoded = null;
  } finally {
    void ctx.close();
  }
  if (!decoded) {
    try {
      const { ffmpegToMono } = await import("./ffmpegDecode");
      return await ffmpegToMono(blob, RATE);
    } catch (e) {
      console.error("ffmpeg decode failed", e);
      throw new Error("Could not read this file. It may be damaged, or it has no sound track.");
    }
  }
  if (decoded.duration > MAX_SECONDS) throw new Error(`This recording is ${Math.round(decoded.duration / 60)} minutes long. Audio Cleanup works on up to ${MAX_SECONDS / 60} minutes at a time.`);
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return (await offline.startRendering()).getChannelData(0).slice();
}

function rmsDb(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, to - from) + 1e-12);
}

/** RNNoise may delay its output slightly; find the lag (0-20 ms) against the original and shift it back. */
export function lagOf(original: Float32Array, cleaned: Float32Array): number {
  // use the loudest 2 s window for a reliable match
  const win = Math.min(2 * RATE, original.length - 1000);
  let best = 0, bestE = -1;
  for (let s = 0; s + win < original.length; s += RATE / 2) {
    let e = 0;
    for (let i = s; i < s + win; i += 8) e += original[i] * original[i];
    if (e > bestE) { bestE = e; best = s; }
  }
  let lag = 0, top = -Infinity;
  for (let d = 0; d <= 960; d++) {
    let c = 0;
    for (let i = best; i < best + win; i += 4) c += original[i] * (cleaned[i + d] ?? 0);
    if (c > top) { top = c; lag = d; }
  }
  return lag;
}

function alignTo(original: Float32Array, cleaned: Float32Array) {
  const lag = lagOf(original, cleaned);
  if (lag > 0) {
    cleaned.copyWithin(0, lag);
    cleaned.fill(0, cleaned.length - lag);
  }
}

export async function cleanAudio(
  blob: Blob,
  opts: { strength: Strength; louder: boolean },
  onProgress?: (stage: "reading" | "cleaning", fraction: number) => void,
): Promise<CleanResult> {
  if (blob.size > MAX_BYTES) throw new Error("This file is larger than 300 MB. Trim it or send a smaller file.");
  onProgress?.("reading", 0);
  const original = await decodeMono48k(blob);
  if (original.length < RATE / 2) throw new Error("The recording is too short (less than half a second).");
  if (original.length > MAX_SECONDS * RATE) throw new Error(`Audio Cleanup works on up to ${MAX_SECONDS / 60} minutes at a time.`);

  const { Rnnoise } = await import("@shiguredo/rnnoise-wasm");
  const rnnoise = await Rnnoise.load();
  const state = rnnoise.createDenoiseState();
  const cleaned = new Float32Array(original.length);
  const frame = new Float32Array(FRAME);
  const frames = Math.ceil(original.length / FRAME);
  const vad = new Float32Array(frames);
  try {
    for (let f = 0; f < frames; f++) {
      const pos = f * FRAME;
      for (let j = 0; j < FRAME; j++) frame[j] = (original[pos + j] ?? 0) * SCALE;
      vad[f] = state.processFrame(frame);
      for (let j = 0; j < FRAME && pos + j < original.length; j++) cleaned[pos + j] = frame[j] / SCALE;
      if (onProgress && f % 1500 === 0) {
        onProgress("cleaning", f / frames);
        await new Promise((r) => setTimeout(r)); // keep the page responsive
      }
    }
  } finally {
    state.destroy();
  }

  alignTo(original, cleaned);

  if (opts.strength === "light") {
    for (let i = 0; i < cleaned.length; i++) cleaned[i] = 0.7 * cleaned[i] + 0.3 * original[i];
  } else if (opts.strength === "strong") {
    // soft gate: gaps without voice go down to -18 dB; smoothed so words don't get cut
    let g = 1;
    for (let f = 0; f < frames; f++) {
      const target = vad[f] > 0.5 ? 1 : vad[f] > 0.2 ? 0.5 : 0.125;
      for (let j = 0; j < FRAME; j++) {
        const i = f * FRAME + j;
        if (i >= cleaned.length) break;
        g += (target - g) * (target > g ? 0.02 : 0.0015); // fast open, slow close
        cleaned[i] *= g;
      }
    }
  }

  // how much quieter the non-speech parts got (shown to the user)
  let before = 0, after = 0, n = 0;
  for (let f = 0; f < frames; f++) {
    if (vad[f] >= 0.2) continue;
    const a = f * FRAME, b = Math.min(a + FRAME, cleaned.length);
    before += 10 ** (rmsDb(original, a, b) / 10);
    after += 10 ** (rmsDb(cleaned, a, b) / 10);
    n++;
  }
  const noiseReducedDb = n > 10 ? Math.max(0, Math.round(10 * Math.log10(before / Math.max(after, 1e-12)))) : 0;

  if (opts.louder) {
    let peak = 0;
    for (const v of cleaned) peak = Math.max(peak, Math.abs(v));
    const gain = Math.min(0.89 / Math.max(peak, 1e-6), 8); // up to -1 dBFS, at most +18 dB
    if (gain > 1.05) for (let i = 0; i < cleaned.length; i++) cleaned[i] *= gain;
  }
  onProgress?.("cleaning", 1);
  return { original, cleaned, seconds: original.length / RATE, noiseReducedDb };
}

/** 16-bit PCM WAV, mono, 48 kHz. */
export function wav48k(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}
