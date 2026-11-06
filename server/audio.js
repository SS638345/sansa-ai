// Audio helpers, adapted from the old SANSA AI
// lib/integrations-openai-ai-server/src/audio/client.ts
import { spawn } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Detect audio format from buffer magic bytes.
 * @param {Buffer} buf
 * @returns {"wav"|"mp3"|"webm"|"mp4"|"ogg"|"flac"|"unknown"}
 */
export function detectAudioFormat(buf) {
  if (buf.length < 12) return "unknown";
  const at = (i, ...bytes) => bytes.every((b, k) => buf[i + k] === b);
  if (at(0, 0x52, 0x49, 0x46, 0x46)) return "wav"; // RIFF
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "webm"; // EBML
  // MP3: ID3 tag or MPEG audio frame sync (layer bits != 0; layer 0 is AAC/ADTS)
  if (at(0, 0x49, 0x44, 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0)) return "mp3";
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return "mp4"; // ....ftyp (m4a, mp4, mov)
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return "ogg"; // OggS
  if (at(0, 0x66, 0x4c, 0x61, 0x43)) return "flac"; // fLaC
  return "unknown";
}

/** Convert any audio/video to 16 kHz mono WAV with ffmpeg. */
export async function convertToWav(audioBuffer) {
  const inputPath = join(tmpdir(), `vtt-in-${randomUUID()}`);
  const outputPath = join(tmpdir(), `vtt-out-${randomUUID()}.wav`);
  try {
    await writeFile(inputPath, audioBuffer);
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-i", inputPath, "-vn", "-f", "wav", "-ar", "16000", "-ac", "1",
        "-acodec", "pcm_s16le", "-y", outputPath,
      ]);
      ff.stderr.on("data", () => {});
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
      ff.on("error", (err) =>
        reject(new Error(`ffmpeg is not available (${err.message}). Install ffmpeg or upload mp3/wav/webm/m4a.`)),
      );
    });
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

// Formats the OpenAI transcription endpoint accepts directly.
const NATIVE = new Set(["wav", "mp3", "webm", "mp4", "ogg", "flac"]);

/** Return a buffer + extension the transcription API accepts, converting only if needed. */
export async function ensureCompatibleFormat(audioBuffer) {
  const format = detectAudioFormat(audioBuffer);
  if (NATIVE.has(format)) return { buffer: audioBuffer, ext: format === "mp4" ? "m4a" : format };
  return { buffer: await convertToWav(audioBuffer), ext: "wav" };
}
