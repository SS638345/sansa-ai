/**
 * Free, in-browser live speech recognition (Web Speech API).
 * Works in Chrome / Edge / Android Chrome / Safari. Supports ta-IN and en-IN.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings: the Web Speech API is not in TypeScript's DOM lib.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type Ctor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): Ctor | undefined {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const liveDictationSupported = typeof window !== "undefined" && Boolean(getRecognitionCtor());

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Mic permission denied. Allow microphone access in the browser.",
  "service-not-allowed": "Mic permission denied. Allow microphone access in the browser.",
  "audio-capture": "No microphone found.",
  network: "Live mic needs an internet connection.",
  "language-not-supported": "This browser does not support that language for live mic.",
};

export function useLiveDictation(lang: string, onFinalText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false); // user wants to keep listening (browsers auto-stop on silence)
  const onFinalRef = useRef(onFinalText);
  onFinalRef.current = onFinalText;

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Rec = getRecognitionCtor();
    if (!Rec) {
      setError("Live mic is not supported in this browser. Use Chrome, or Record & convert.");
      return;
    }
    setError(null);
    const rec = new Rec();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wantRef.current = false;
      setError(ERROR_TEXT[e.error] ?? `Speech recognition error: ${e.error}`);
    };
    rec.onend = () => {
      setInterim("");
      if (wantRef.current) {
        try {
          rec.start(); // keep going after the browser's silence timeout
          return;
        } catch {
          /* fall through to stopped */
        }
      }
      recRef.current = null;
      setListening(false);
    };
    wantRef.current = true;
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang]);

  // Stop if the component unmounts or language changes mid-session.
  useEffect(() => stop, [stop, lang]);

  return { listening, interim, error, start, stop };
}
