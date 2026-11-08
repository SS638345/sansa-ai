/**
 * Client for the self-hosted SANSA speech engine (engine/ folder on a free
 * Hugging Face Space). Same piece-by-piece flow as Sarvam.
 */
import { decodeTo16kMono } from "./localWhisper";
import { splitOnSilence, toWav } from "./sarvam";
import { pieceOffsets, type Segment, type Transcript } from "./transcript";

export const SANSA_ENGINE_URL: string | undefined = import.meta.env.VITE_SANSA_ENGINE_URL || undefined;

const LANGS: Record<string, string> = {
  "ta-IN": "ta", "hi-IN": "hi", "te-IN": "te", "kn-IN": "kn", "ml-IN": "ml", "bn-IN": "bn",
  "mr-IN": "mr", "gu-IN": "gu", "pa-IN": "pa", "ur-IN": "ur", "or-IN": "or", "as-IN": "as",
  "ne-NP": "ne", "sa-IN": "sa", "sd-IN": "sd",
};

/** The engine is up but has no model for this language (e.g. no HF_TOKEN for IndicConformer). */
export class SansaLanguageUnavailable extends Error {}

export const sansaSupports = (langId: string) => langId in LANGS;

export const MAX_LONG_MINUTES = 65;

/** Big files: straight to 16 kHz with ffmpeg.wasm, so a 1-hour recording never sits in memory at 48 kHz stereo (>1 GB). */
async function decodeForEngine(blob: Blob): Promise<Float32Array> {
  if (blob.size > 24 * 1024 * 1024) {
    try {
      const { ffmpegTo16kMono } = await import("./ffmpegDecode");
      return await ffmpegTo16kMono(blob);
    } catch (e) {
      console.warn("ffmpeg decode of a large file failed, trying the browser decoder", e);
    }
  }
  return decodeTo16kMono(blob);
}

type Saved = { total: number; done: number; segments: Segment[] };
const RESUME = "vtt.resume:";
function loadResume(key?: string): Saved | null {
  if (!key) return null;
  try {
    const v = JSON.parse(localStorage.getItem(RESUME + key) ?? "null") as Saved | null;
    return v && Array.isArray(v.segments) ? v : null;
  } catch {
    return null;
  }
}
function saveResume(key: string | undefined, v: Saved | null) {
  if (!key) return;
  try {
    if (v) localStorage.setItem(RESUME + key, JSON.stringify(v));
    else localStorage.removeItem(RESUME + key);
  } catch {
    /* storage full or blocked: resume just won't be available */
  }
}

/**
 * Long files (up to ~1 hour): sent piece by piece; progress is saved after every piece, so if the
 * tab closes or the network drops, the same file continues from where it stopped (resumeKey).
 * onProgress(done, total, secondsLeft, resumedFrom)
 */
export async function transcribeWithSansa(
  blob: Blob,
  langId: string,
  baseUrl: string,
  onProgress: (done: number, total: number, secondsLeft?: number, resumedFrom?: number) => void,
  resumeKey?: string,
): Promise<Transcript> {
  const language = LANGS[langId];
  if (!language) throw new Error("The SANSA engine does not support this language.");
  const url = baseUrl.replace(/\/+$/, "") + "/transcribe";
  const audio = await decodeForEngine(blob);
  if (audio.length > MAX_LONG_MINUTES * 60 * 16000) {
    throw new Error(`This recording is ${Math.round(audio.length / 16000 / 60)} minutes long. The SANSA engine takes up to ${MAX_LONG_MINUTES} minutes at a time.`);
  }
  const pieces = splitOnSilence(audio);
  const offsets = pieceOffsets(pieces);
  const saved = loadResume(resumeKey);
  const start = saved && saved.total === pieces.length && saved.done < pieces.length ? saved.done : 0;
  const segments: Segment[] = start ? saved!.segments : [];
  const t0 = performance.now();
  for (let i = start; i < pieces.length; i++) {
    const per = i > start ? (performance.now() - t0) / 1000 / (i - start) : undefined;
    onProgress(i, pieces.length, per ? Math.round(per * (pieces.length - i)) : undefined, start || undefined);
    const form = new FormData();
    form.append("file", toWav(pieces[i]), "audio.wav");
    form.append("language", language);
    let res: Response | null = null;
    // Network drop, busy server (429) or a restart (5xx): keep trying for ~10 minutes before giving up.
    // Progress is saved, so even then the same file continues from this piece next time.
    for (let attempt = 0; attempt < 14; attempt++) {
      try {
        res = await fetch(url, { method: "POST", body: form });
      } catch {
        res = null;
      }
      if (res && res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, Math.min(60000, 5000 * 2 ** Math.min(attempt, 4))));
    }
    if (!res || res.status === 429 || res.status >= 500) {
      throw new Error(`Could not reach the SANSA engine at part ${i + 1} of ${pieces.length}. Your progress is saved: choose the same file again to continue.`);
    }
    const data = (await res.json().catch(() => ({}))) as { transcript?: string; detail?: string; check?: boolean };
    if (res.status === 400 && i === 0 && /not available/i.test(data.detail ?? "")) {
      throw new SansaLanguageUnavailable(data.detail);
    }
    if (!res.ok) throw new Error(data.detail ?? `SANSA engine error (${res.status}).`);
    const text = (data.transcript ?? "").trim();
    if (text) segments.push({ start: offsets[i], end: offsets[i] + pieces[i].length / 16000, text, ...(data.check ? { check: true } : {}) });
    if (pieces.length > 3) saveResume(resumeKey, { total: pieces.length, done: i + 1, segments });
  }
  saveResume(resumeKey, null);
  onProgress(pieces.length, pieces.length);
  return { text: segments.map((s) => s.text).join(" "), segments };
}
