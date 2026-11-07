/// <reference lib="webworker" />
/**
 * Free, on-device speech to text with Whisper (transformers.js).
 * The model downloads once from Hugging Face, is cached by the browser,
 * and all audio stays on the user's device.
 */
import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

export type WorkerRequest = {
  type: "transcribe";
  audio: Float32Array;
  language: string;
  model: string;
  /** "translate" writes English text from any spoken language. */
  task: "transcribe" | "translate";
};
export type WorkerChunk = { start: number; end: number | null; text: string };
export type WorkerMessage =
  | { type: "progress"; loaded: number; total: number }
  | { type: "status"; status: "loading" | "transcribing" }
  | { type: "done"; text: string; chunks: WorkerChunk[] }
  | { type: "error"; message: string };

const post = (m: WorkerMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let current: { model: string; asr: Promise<AutomaticSpeechRecognitionPipeline> } | null = null;

function load(model: string) {
  if (current?.model === model) return current.asr;
  const files = new Map<string, { loaded: number; total: number }>();
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const asr = pipeline("automatic-speech-recognition", model, {
    device: hasGpu ? "webgpu" : "wasm",
    // Full-precision encoder: quantizing it costs a lot of accuracy on Indian languages.
    dtype: hasGpu
      ? { encoder_model: model.includes("large") ? "fp16" : "fp32", decoder_model_merged: "q4" }
      : { encoder_model: model.includes("large") ? "q8" : "fp32", decoder_model_merged: "q8" },
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.file) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0;
        let total = 0;
        files.forEach((f) => {
          loaded += f.loaded;
          total += f.total;
        });
        post({ type: "progress", loaded, total });
      }
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  asr.catch(() => {
    current = null;
  });
  current = { model, asr };
  return asr;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { audio, language, model, task } = e.data;
  try {
    post({ type: "status", status: "loading" });
    const asr = await load(model);
    post({ type: "status", status: "transcribing" });
    const out = await asr(audio, {
      ...(language ? { language } : {}),
      task,
      chunk_length_s: 30,
      return_timestamps: true,
      stride_length_s: 5,
      // Stops the "same phrase repeated" loops Whisper falls into on noisy audio.
      no_repeat_ngram_size: 4,
    });
    const outs = Array.isArray(out) ? out : [out];
    const text = outs.map((o) => o.text).join(" ");
    const chunks: WorkerChunk[] = outs.flatMap((o) =>
      ((o as { chunks?: { timestamp: [number | null, number | null]; text: string }[] }).chunks ?? []).map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? null, text: c.text.trim() })),
    );
    post({ type: "done", text: text.trim(), chunks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({
      type: "error",
      message: /fetch|network/i.test(message)
        ? "Could not download the speech model. Check your internet and try again."
        : message,
    });
  }
};
