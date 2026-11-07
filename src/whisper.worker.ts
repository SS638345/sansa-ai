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

/** WebGPU if usable here, and whether it can run fp16 (many GPUs/browsers can't). */
let gpuInfo: Promise<{ gpu: boolean; f16: boolean }> | null = null;
function detectGpu() {
  gpuInfo ??= (async () => {
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
      const adapter = gpu ? await gpu.requestAdapter() : null;
      return { gpu: Boolean(adapter), f16: Boolean(adapter?.features.has("shader-f16")) };
    } catch {
      return { gpu: false, f16: false };
    }
  })();
  return gpuInfo;
}

async function load(model: string) {
  if (current?.model === model) return current.asr;
  const files = new Map<string, { loaded: number; total: number }>();
  const { gpu, f16 } = await detectGpu();
  const big = model.includes("large") || model.includes("tamil-medium");
  // Big models need fp16 on the GPU; without fp16 support they run on the CPU (WASM) in q8.
  const useGpu = gpu && (f16 || !big);
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
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
  };
  const open = (onGpu: boolean) =>
    pipeline("automatic-speech-recognition", model, {
      device: onGpu ? "webgpu" : "wasm",
      // Full-precision encoder for small models: quantizing it costs accuracy on Indian languages.
      // The Tamil medium export matched a known Tamil sentence word-for-word with fp16/q4 and q8/q8.
      dtype: onGpu
        ? { encoder_model: big ? "fp16" : "fp32", decoder_model_merged: "q4" }
        : { encoder_model: big ? "q8" : "fp32", decoder_model_merged: "q8" },
      progress_callback,
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
  // If the GPU path fails to start (driver or browser quirks), fall back to the CPU.
  const asr = open(useGpu).catch((e) => {
    if (!useGpu) throw e;
    files.clear();
    return open(false);
  });
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
    const opts = {
      ...(language ? { language } : {}),
      task,
      chunk_length_s: 30,
      stride_length_s: 5,
      // Stops the "same phrase repeated" loops Whisper falls into on noisy audio.
      no_repeat_ngram_size: 4,
    };
    // Timestamps power the timeline and subtitles. Some fine-tuned models were trained
    // without timestamp tokens; if asking for them fails, transcribe without times.
    const out = await asr(audio, { ...opts, return_timestamps: true }).catch(() => asr(audio, opts));
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
