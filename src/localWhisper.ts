import type { WorkerMessage, WorkerRequest } from "./whisper.worker";
import type { Segment, Transcript } from "./transcript";

/** IIT Madras SPRING Lab's Tamil Whisper medium, converted for the browser (webmodel/ in this repo). */
export const TAMIL_MODEL = "santhosh63/whisper-tamil-medium-web";

export const LOCAL_MODELS: readonly { id: string; label: string; lang?: string }[] = [
  { id: TAMIL_MODEL, label: "Tamil best: Tamil-trained model (about 1 GB, downloads once)", lang: "ta" },
  { id: "onnx-community/whisper-small", label: "Balanced (about 400 MB download)" },
  { id: "onnx-community/whisper-large-v3-turbo", label: "Best (about 1 GB, needs a good PC with Chrome)" },
  { id: "onnx-community/whisper-base", label: "Fast but less accurate (about 150 MB)" },
];

export type LocalProgress =
  | { stage: "decoding" }
  | { stage: "loading"; percent: number | null }
  | { stage: "transcribing" };

/** Decode any audio or video file to 16 kHz mono samples. The browser's own decoder handles
 * mp3, m4a, wav, ogg, webm...; anything else (amr, 3gp, wma, aac, caf...) goes through ffmpeg.wasm. */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
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
      const { ffmpegTo16kMono } = await import("./ffmpegDecode");
      return await ffmpegTo16kMono(blob);
    } catch (e) {
      console.error("ffmpeg decode failed", e);
      throw new Error("Could not read this audio file. It may be damaged, or it has no sound track.");
    }
  }
  const targetRate = 16000;
  const length = Math.ceil(decoded.duration * targetRate);
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

let worker: Worker | null = null;
function getWorker() {
  worker ??= new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Transcribe on this device with Whisper. `language` is a Whisper code like "ta" or "en". */
export async function transcribeLocally(
  blob: Blob,
  language: string,
  model: string,
  onProgress: (p: LocalProgress) => void,
  task: "transcribe" | "translate" = "transcribe",
): Promise<Transcript> {
  onProgress({ stage: "decoding" });
  const audio = await decodeTo16kMono(blob);
  if (audio.length < 1600) throw new Error("The audio is too short.");
  const w = getWorker();
  const duration = audio.length / 16000;
  return new Promise<Transcript>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.type === "progress") onProgress({ stage: "loading", percent: m.total ? Math.round((m.loaded / m.total) * 100) : null });
      else if (m.type === "status") onProgress(m.status === "loading" ? { stage: "loading", percent: null } : { stage: "transcribing" });
      else if (m.type === "done") {
        const segments: Segment[] = m.chunks
          .filter((c) => c.text)
          .map((c) => ({ start: c.start, end: c.end ?? duration, text: c.text }));
        resolve({ text: m.text, segments });
      }
      else reject(new Error(m.message));
    };
    w.onerror = (e) => reject(new Error(e.message || "Speech engine failed to start."));
    const req: WorkerRequest = { type: "transcribe", audio, language, model, task };
    w.postMessage(req, [audio.buffer]);
  });
}
