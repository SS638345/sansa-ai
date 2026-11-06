/**
 * Records microphone audio with MediaRecorder.
 * Adapted from the old SANSA AI lib/integrations-openai-ai-react/src/audio/useVoiceRecorder.ts
 */
import { useCallback, useRef, useState } from "react";

export type RecordingState = "idle" | "recording";

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setState("recording");
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state !== "recording") {
          setState("idle");
          resolve(new Blob());
          return;
        }
        recorder.onstop = () => {
          recorder.stream.getTracks().forEach((t) => t.stop());
          recorderRef.current = null;
          setState("idle");
          resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        };
        recorder.stop();
      }),
    [],
  );

  return { state, start, stop };
}
