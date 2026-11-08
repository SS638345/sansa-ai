import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Fallback for files the browser can't decode itself (amr, 3gp, wma, aac, opus in odd
// containers, call recordings...). ffmpeg.wasm (single-thread core, about 30 MB) is
// fetched from the CDN only the first time such a file is opened.
const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

let ready: Promise<FFmpeg> | null = null;
function getFFmpeg() {
  ready ??= (async () => {
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ff;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Any audio/video file → 16 kHz mono float samples, using ffmpeg.wasm. */
export async function ffmpegTo16kMono(blob: Blob): Promise<Float32Array> {
  return ffmpegToMono(blob, 16000);
}

/** Any audio/video file → mono float samples at the given rate, using ffmpeg.wasm. */
export async function ffmpegToMono(blob: Blob, rate: number): Promise<Float32Array> {
  const ff = await getFFmpeg();
  const name = (blob instanceof File && blob.name.match(/\.[a-z0-9]{1,5}$/i)?.[0]) || ".bin";
  const input = `in${name}`;
  await ff.writeFile(input, await fetchFile(blob));
  try {
    const code = await ff.exec(["-i", input, "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "out.pcm"]);
    if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
    const out = (await ff.readFile("out.pcm")) as Uint8Array;
    await ff.deleteFile("out.pcm");
    return new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4)).slice();
  } finally {
    await ff.deleteFile(input).catch(() => {});
  }
}
