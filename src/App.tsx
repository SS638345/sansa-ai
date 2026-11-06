import { useEffect, useRef, useState } from "react";
import { getStatus, transcribe, type Status } from "./api";
import { liveDictationSupported, useLiveDictation } from "./hooks/useLiveDictation";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { LOCAL_MODELS, transcribeLocally, type LocalProgress } from "./localWhisper";

const LANGUAGES = [
  { id: "ta-IN", api: "ta", label: "தமிழ் (Tamil)" },
  { id: "en-IN", api: "en", label: "English (India)" },
  { id: "en-US", api: "en", label: "English (US)" },
] as const;

type Mode = "live" | "record" | "upload";

const STORAGE_KEY = "vtt.transcript";

function load(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: ignore */
  }
}

export default function App() {
  const [langId, setLangId] = useState(() => load("vtt.lang", "ta-IN"));
  const lang = LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
  const [mode, setMode] = useState<Mode>(liveDictationSupported ? "live" : "record");
  const [text, setText] = useState(() => load(STORAGE_KEY, ""));
  const [status, setStatus] = useState<Status>({ ai: false, model: null });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  const [localModel, setLocalModel] = useState(() => load("vtt.model", LOCAL_MODELS[0].id));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getStatus().then(setStatus);
  }, []);
  useEffect(() => save(STORAGE_KEY, text), [text]);
  useEffect(() => save("vtt.lang", langId), [langId]);
  useEffect(() => save("vtt.model", localModel), [localModel]);

  const append = (chunk: string) => {
    if (!chunk) return;
    setText((prev) => (prev && !prev.endsWith("\n") ? `${prev} ${chunk}` : prev + chunk));
  };

  const live = useLiveDictation(lang.id, append);
  const recorder = useVoiceRecorder();

  const runTranscribe = async (audio: Blob) => {
    if (audio.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Server AI when an OpenAI key is configured; otherwise free on-device Whisper.
      const out = status.ai
        ? await transcribe(audio, lang.api)
        : await transcribeLocally(audio, lang.api, localModel, setProgress);
      if (!out) setError("No speech found in this audio.");
      append(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const toggleRecord = async () => {
    setError(null);
    if (recorder.state === "recording") {
      await runTranscribe(await recorder.stop());
      return;
    }
    try {
      await recorder.start();
    } catch {
      setError("Could not open the microphone. Allow mic access and try again.");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("File is too big. Max 25 MB.");
      return;
    }
    await runTranscribe(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed. Select the text and copy manually.");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const switchMode = (m: Mode) => {
    live.stop();
    if (recorder.state === "recording") void recorder.stop();
    setError(null);
    setMode(m);
  };

  const shownError = error ?? live.error;
  const busyText =
    progress?.stage === "decoding"
      ? "Reading audio…"
      : progress?.stage === "loading"
        ? progress.percent != null && progress.percent < 100
          ? `Downloading speech model… ${progress.percent}%`
          : "Loading speech model…"
        : "Converting to text…";

  return (
    <div className="page">
      <nav className="nav">
        <a className="brand" href="./">
          <span className="mark" aria-hidden="true">S</span>
          <span>SANSA <b>Voice</b></span>
        </a>
        <span className={`pill ${status.ai ? "ok" : ""}`}>{status.ai ? "AI on" : "Free mode"}</span>
      </nav>

      <header className="hero">
        <h1>
          Pesunga. <span className="grad">Text aagidum.</span>
        </h1>
        <p className="sub">Tamil and English voice to text, right in your browser. No sign up, no install.</p>
      </header>

      <main className="app">

      <section className="card controls">
        <label className="field">
          <span>Language</span>
          <select value={langId} onChange={(e) => setLangId(e.target.value)} disabled={live.listening || busy}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === "live"} onClick={() => switchMode("live")}>
            Live mic <small>free</small>
          </button>
          <button role="tab" aria-selected={mode === "record"} onClick={() => switchMode("record")}>
            Record &amp; convert <small>{status.ai ? "AI" : "free"}</small>
          </button>
          <button role="tab" aria-selected={mode === "upload"} onClick={() => switchMode("upload")}>
            Upload audio <small>{status.ai ? "AI" : "free"}</small>
          </button>
        </div>

        {mode === "live" && (
          <div className="action">
            {liveDictationSupported ? (
              <>
                <button
                  className={`mic ${live.listening ? "on" : ""}`}
                  onClick={live.listening ? live.stop : live.start}
                  aria-pressed={live.listening}
                >
                  {live.listening ? "■ Stop" : "● Start speaking"}
                </button>
                <p className="hint">
                  {live.listening ? "Listening… text appears as you speak." : "Words appear live while you talk. Works best in Chrome."}
                </p>
              </>
            ) : (
              <p className="hint">This browser has no live speech engine. Open in Chrome, or use Record &amp; convert.</p>
            )}
          </div>
        )}

        {mode === "record" && (
          <div className="action">
            <button
              className={`mic ${recorder.state === "recording" ? "on" : ""}`}
              onClick={toggleRecord}
              disabled={busy}
            >
              {busy ? "Working…" : recorder.state === "recording" ? "■ Stop & convert" : "● Record"}
            </button>
            <p className="hint">Record first, then the whole clip is converted. More accurate for long talks.</p>
          </div>
        )}

        {mode === "upload" && (
          <div className="action">
            <label className={`upload ${busy ? "disabled" : ""}`}>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.flac,.mp4"
                disabled={busy}
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              {busy ? "Working…" : "Choose audio file"}
            </label>
            <p className="hint">mp3, m4a, wav, ogg, webm, WhatsApp voice notes. Max 25 MB. First time, the speech model downloads once.</p>
          </div>
        )}

        {mode !== "live" && !status.ai && (
          <label className="field">
            <span>Speech model (runs free on your device, downloads once)</span>
            <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} disabled={busy}>
              {LOCAL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {busy && (
          <p className="notice" role="status">
            {busyText}
            {progress?.stage === "transcribing" && " Long files can take a few minutes."}
          </p>
        )}
        {shownError && <p className="error" role="alert">{shownError}</p>}
      </section>

      <section className="card output">
        <div className="output-head">
          <h2>Text</h2>
          <span className="count">{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Your text will appear here. You can edit it too."
          rows={12}
        />
        {live.interim && <p className="interim">{live.interim}</p>}
        <div className="row">
          <button onClick={copy} disabled={!text}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button onClick={download} disabled={!text}>
            Download .txt
          </button>
          <button className="ghost" onClick={() => setText("")} disabled={!text}>
            Clear
          </button>
        </div>
      </section>
      </main>

      <section className="features" aria-label="Features">
        <div>
          <h3>Live typing</h3>
          <p>Words appear while you speak. Free in Chrome and Android.</p>
        </div>
        <div>
          <h3>Tamil + English</h3>
          <p>Switch language anytime. Edit the text before you copy it.</p>
        </div>
        <div>
          <h3>Private</h3>
          <p>No account. Your text is kept only in your own browser.</p>
        </div>
      </section>

      <footer className="foot">
        <span>© {new Date().getFullYear()} SANSA AI</span>
        <a href="https://sansaai.in" target="_blank" rel="noreferrer">sansaai.in</a>
      </footer>
    </div>
  );
}
