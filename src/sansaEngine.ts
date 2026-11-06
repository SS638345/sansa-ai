/**
 * Client for the self-hosted SANSA speech engine (engine/ folder on a free
 * Hugging Face Space). Same piece-by-piece flow as Sarvam.
 */
import { decodeTo16kMono } from "./localWhisper";
import { splitOnSilence, toWav } from "./sarvam";

export const SANSA_ENGINE_URL: string | undefined = import.meta.env.VITE_SANSA_ENGINE_URL || undefined;

const LANGS: Record<string, string> = {
  "ta-IN": "ta", "hi-IN": "hi", "te-IN": "te", "kn-IN": "kn", "ml-IN": "ml", "bn-IN": "bn",
  "mr-IN": "mr", "gu-IN": "gu", "pa-IN": "pa", "ur-IN": "ur", "or-IN": "or", "as-IN": "as",
  "ne-NP": "ne", "sa-IN": "sa", "sd-IN": "sd",
};

/** The engine is up but has no model for this language (e.g. no HF_TOKEN for IndicConformer). */
export class SansaLanguageUnavailable extends Error {}

export const sansaSupports = (langId: string) => langId in LANGS;

export async function transcribeWithSansa(
  blob: Blob,
  langId: string,
  baseUrl: string,
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  const language = LANGS[langId];
  if (!language) throw new Error("The SANSA engine does not support this language.");
  const url = baseUrl.replace(/\/+$/, "") + "/transcribe";
  const pieces = splitOnSilence(await decodeTo16kMono(blob));
  const texts: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    onProgress(i, pieces.length);
    const form = new FormData();
    form.append("file", toWav(pieces[i]), "audio.wav");
    form.append("language", language);
    let res: Response | null = null;
    // A sleeping free Space answers 503 while it wakes up; retry for ~2 minutes.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        res = await fetch(url, { method: "POST", body: form });
      } catch {
        res = null;
      }
      if (res && res.status !== 503 && res.status !== 502) break;
      await new Promise((r) => setTimeout(r, 15000));
    }
    if (!res) throw new Error("Could not reach the SANSA engine. It may be starting up; try again in a minute.");
    const data = (await res.json().catch(() => ({}))) as { transcript?: string; detail?: string };
    if (res.status === 400 && i === 0 && /not available/i.test(data.detail ?? "")) {
      throw new SansaLanguageUnavailable(data.detail);
    }
    if (!res.ok) throw new Error(data.detail ?? `SANSA engine error (${res.status}).`);
    texts.push((data.transcript ?? "").trim());
  }
  onProgress(pieces.length, pieces.length);
  return texts.filter(Boolean).join(" ");
}
