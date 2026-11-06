/**
 * Sarvam AI speech-to-text (saarika), trained for Indian languages.
 * Sarvam's REST endpoint accepts up to 30 s per request, so audio is split
 * into ≤25 s pieces at the quietest point near each boundary and sent in order.
 *
 * The API key never ships with the site: either VITE_SARVAM_PROXY_URL points at
 * a private proxy that holds the key (proxy/worker.js), or the user pastes their
 * own key, which is kept only in their browser's localStorage.
 */
import { decodeTo16kMono } from "./localWhisper";

const SARVAM_URL = "https://api.sarvam.ai/speech-to-text";
export const SARVAM_PROXY_URL: string | undefined = import.meta.env.VITE_SARVAM_PROXY_URL || undefined;
const MODEL = "saarika:v2.5";
const RATE = 16000;

/** App language id -> Sarvam language code. Missing = not supported by Sarvam. */
const SARVAM_LANGS: Record<string, string> = {
  "ta-IN": "ta-IN",
  "hi-IN": "hi-IN",
  "te-IN": "te-IN",
  "kn-IN": "kn-IN",
  "ml-IN": "ml-IN",
  "bn-IN": "bn-IN",
  "mr-IN": "mr-IN",
  "gu-IN": "gu-IN",
  "pa-IN": "pa-IN",
  "or-IN": "od-IN",
  "en-IN": "en-IN",
  "en-US": "en-IN",
  auto: "unknown",
};

export const sarvamSupports = (langId: string) => langId in SARVAM_LANGS;

/** Split at the quietest 100 ms frame between 18 s and 25 s, so words are not cut. */
export function splitOnSilence(audio: Float32Array, maxSec = 25, minSec = 18): Float32Array[] {
  const out: Float32Array[] = [];
  const frame = RATE / 10;
  let start = 0;
  while (audio.length - start > maxSec * RATE) {
    let best = start + maxSec * RATE;
    let bestEnergy = Infinity;
    for (let f = start + minSec * RATE; f + frame <= start + maxSec * RATE; f += frame) {
      let e = 0;
      for (let i = f; i < f + frame; i++) e += audio[i] * audio[i];
      if (e < bestEnergy) {
        bestEnergy = e;
        best = f + frame / 2;
      }
    }
    out.push(audio.subarray(start, best));
    start = best;
  }
  if (audio.length - start > RATE / 4) out.push(audio.subarray(start));
  return out;
}

/** 16-bit PCM mono WAV. */
export function toWav(samples: Float32Array): Blob {
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
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function sendPiece(wav: Blob, language: string, key: string | null): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "audio.wav");
  form.append("model", MODEL);
  form.append("language_code", language);
  let res: Response;
  try {
    res = await fetch(SARVAM_PROXY_URL ?? SARVAM_URL, {
      method: "POST",
      headers: SARVAM_PROXY_URL || !key ? {} : { "api-subscription-key": key },
      body: form,
    });
  } catch {
    throw new Error("Could not reach Sarvam AI. Check your internet connection.");
  }
  const data = (await res.json().catch(() => ({}))) as {
    transcript?: string;
    error?: { message?: string };
    message?: string;
  };
  if (res.status === 401 || res.status === 403) throw new Error("Sarvam API key is wrong or expired. Check it in Settings.");
  if (res.status === 429) throw new Error("Sarvam limit reached. Wait a minute or check your Sarvam credits.");
  if (!res.ok) throw new Error(data.error?.message ?? data.message ?? `Sarvam error (${res.status}).`);
  return (data.transcript ?? "").trim();
}

export async function transcribeWithSarvam(
  blob: Blob,
  langId: string,
  key: string | null,
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  const language = SARVAM_LANGS[langId];
  if (!language) throw new Error("Sarvam AI does not support this language. Use the free engine.");
  if (!SARVAM_PROXY_URL && !key) throw new Error("Add your Sarvam API key first.");
  const pieces = splitOnSilence(await decodeTo16kMono(blob));
  const texts: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    onProgress(i, pieces.length);
    texts.push(await sendPiece(toWav(pieces[i]), language, key));
  }
  onProgress(pieces.length, pieces.length);
  return texts.filter(Boolean).join(" ");
}
