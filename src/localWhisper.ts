import type { WorkerMessage, WorkerRequest } from "./whisper.worker";

export const LOCAL_MODELS = [
  { id: "onnx-community/whisper-small", label: "Balanced (about 400 MB download)" },
  { id: "onnx-community/whisper-large-v3-turbo", label: "Best (about 1 GB, needs a good PC with Chrome)" },
  { id: "onnx-community/whisper-base", label: "Fast but less accurate (about 150 MB)" },
] as const;

export type LocalProgress =
  | { stage: "decoding" }
  | { stage: "loading"; percent: number | null }
  | { stage: "transcribing" };

/** Decode any browser-playable audio (mp3, m4a, wav, ogg, webm...) to 16 kHz mono samples. */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const data = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data);
  } catch {
    throw new Error("Could not read this audio file. Try mp3, m4a, wav or ogg.");
  } finally {
    void ctx.close();
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
): Promise<string> {
  onProgress({ stage: "decoding" });
  const audio = await decodeTo16kMono(blob);
  if (audio.length < 1600) throw new Error("The audio is too short.");
  const w = getWorker();
  return new Promise<string>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.type === "progress") onProgress({ stage: "loading", percent: m.total ? Math.round((m.loaded / m.total) * 100) : null });
      else if (m.type === "status") onProgress(m.status === "loading" ? { stage: "loading", percent: null } : { stage: "transcribing" });
      else if (m.type === "done") resolve(m.text);
      else reject(new Error(m.message));
    };
    w.onerror = (e) => reject(new Error(e.message || "Speech engine failed to start."));
    const req: WorkerRequest = { type: "transcribe", audio, language, model };
    w.postMessage(req, [audio.buffer]);
  });
}
