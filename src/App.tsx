import { useEffect, useRef, useState } from "react";
import { getStatus, transcribe, type Status } from "./api";
import { liveDictationSupported, useLiveDictation } from "./hooks/useLiveDictation";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { LOCAL_MODELS, TAMIL_MODEL, transcribeLocally, type LocalProgress } from "./localWhisper";
import { SARVAM_PROXY_URL, sarvamSupports, transcribeWithSarvam } from "./sarvam";
import { SANSA_ENGINE_URL, SansaLanguageUnavailable, sansaSupports, transcribeWithSansa } from "./sansaEngine";

// id: browser live-mic language tag. api: Whisper code for upload/record, or null when
// Whisper has no model for that language (e.g. Odia), so only live mic can be offered.
type Language = { id: string; api: string | null; label: string };

const LANGUAGES: readonly Language[] = [
  { id: "ta-IN", api: "ta", label: "தமிழ் (Tamil)" },
  { id: "en-IN", api: "en", label: "English (India)" },
  { id: "hi-IN", api: "hi", label: "हिन्दी (Hindi)" },
  { id: "te-IN", api: "te", label: "తెలుగు (Telugu)" },
  { id: "kn-IN", api: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { id: "ml-IN", api: "ml", label: "മലയാളം (Malayalam)" },
  { id: "bn-IN", api: "bn", label: "বাংলা (Bengali)" },
  { id: "mr-IN", api: "mr", label: "मराठी (Marathi)" },
  { id: "gu-IN", api: "gu", label: "ગુજરાતી (Gujarati)" },
  { id: "pa-IN", api: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
  { id: "ur-IN", api: "ur", label: "اردو (Urdu)" },
  { id: "or-IN", api: null, label: "ଓଡ଼ିଆ (Odia) - live mic only" },
  { id: "as-IN", api: "as", label: "অসমীয়া (Assamese)" },
  { id: "ne-NP", api: "ne", label: "नेपाली (Nepali)" },
  { id: "sa-IN", api: "sa", label: "संस्कृतम् (Sanskrit)" },
  { id: "sd-IN", api: "sd", label: "سنڌي (Sindhi)" },
  { id: "en-US", api: "en", label: "English (US)" },
  // Auto-detect lets Whisper handle mixed speech (e.g. Tamil + English); live mic falls back to Tamil.
  { id: "auto", api: "", label: "Mixed / auto detect (upload/record)" },
];

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
  const [generalModel, setGeneralModel] = useState(() => {
    const m = load("vtt.model", "onnx-community/whisper-small");
    return LOCAL_MODELS.some((x) => x.id === m && !x.lang) ? m : "onnx-community/whisper-small";
  });
  const [tamilModel, setTamilModel] = useState(() => load("vtt.modelTa", TAMIL_MODEL));
  const [engine, setEngine] = useState<"sansa" | "sarvam" | "free">(() => {
    const e = load("vtt.engine", "free");
    // Without an engine address, SANSA engine would just fall back; start on the on-device engine.
    if (e === "sansa" && !SANSA_ENGINE_URL && !load("vtt.engineUrl", "")) return "free";
    return e === "sansa" || e === "sarvam" ? e : "free";
  });
  const [engineUrl, setEngineUrl] = useState(() => load("vtt.engineUrl", ""));
  const [sarvamKey, setSarvamKey] = useState(() => load("vtt.sarvamKey", ""));
  const [pieces, setPieces] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getStatus().then(setStatus);
  }, []);
  useEffect(() => save(STORAGE_KEY, text), [text]);
  useEffect(() => save("vtt.lang", langId), [langId]);
  useEffect(() => save("vtt.model", generalModel), [generalModel]);
  useEffect(() => save("vtt.modelTa", tamilModel), [tamilModel]);
  useEffect(() => save("vtt.engine", engine), [engine]);
  useEffect(() => save("vtt.sarvamKey", sarvamKey.trim()), [sarvamKey]);
  useEffect(() => save("vtt.engineUrl", engineUrl.trim()), [engineUrl]);

  const append = (chunk: string) => {
    if (!chunk) return;
    setText((prev) => (prev && !prev.endsWith("\n") ? `${prev} ${chunk}` : prev + chunk));
  };

  // Tamil gets the Tamil-trained model by default; other languages use the general Whisper models.
  const isTamil = lang.api === "ta";
  const localModel = isTamil ? tamilModel : generalModel;
  const setLocalModel = isTamil ? setTamilModel : setGeneralModel;
  const modelChoices = LOCAL_MODELS.filter((m) => !m.lang || m.lang === lang.api);

  const live = useLiveDictation(lang.id === "auto" ? "ta-IN" : lang.id, append);
  const recorder = useVoiceRecorder();

  const sarvamReady = Boolean(SARVAM_PROXY_URL || sarvamKey.trim());
  const useSarvam = engine === "sarvam" && sarvamSupports(lang.id) && sarvamReady;
  const sansaUrl = SANSA_ENGINE_URL ?? (engineUrl.trim() || null);
  const useSansa = engine === "sansa" && sansaSupports(lang.id) && Boolean(sansaUrl);
  const remoteReady = engine === "sansa" ? Boolean(sansaUrl) : sarvamReady;
  const remoteSupports = engine === "sansa" ? sansaSupports(lang.id) : sarvamSupports(lang.id);
  const remoteName = engine === "sansa" ? "SANSA engine" : "Sarvam AI";

  const runTranscribe = async (audio: Blob) => {
    if (audio.size === 0) return;
    if (!useSarvam && !useSansa && lang.api === null) {
      setError(`${lang.label.split(" - ")[0]} is not supported for upload/record yet. Use Live mic.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Sarvam AI (most accurate for Indian languages) when chosen and supported;
      // else server OpenAI when configured; else free on-device Whisper.
      const out = useSansa
        ? await transcribeWithSansa(audio, lang.id, sansaUrl!, (done, total) => setPieces({ done, total })).catch((e) => {
            // Engine has no model for this language yet: fall back to the free on-device engine.
            if (!(e instanceof SansaLanguageUnavailable)) throw e;
            setPieces(null);
            return transcribeLocally(audio, lang.api ?? "", localModel, setProgress);
          })
        : useSarvam
        ? await transcribeWithSarvam(audio, lang.id, sarvamKey.trim() || null, (done, total) => setPieces({ done, total }))
        : status.ai
          ? await transcribe(audio, lang.api ?? "")
          : await transcribeLocally(audio, lang.api ?? "", localModel, setProgress);
      if (!out) setError("No speech found in this audio.");
      append(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setBusy(false);
      setProgress(null);
      setPieces(null);
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
  const busyText = pieces
    ? pieces.total > 1
      ? `${useSansa ? "SANSA engine" : "Sarvam AI"}: converting part ${Math.min(pieces.done + 1, pieces.total)} of ${pieces.total}…`
      : `${useSansa ? "SANSA engine" : "Sarvam AI"}: converting…`
    : progress?.stage === "decoding"
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
        <p className="sub">Voice to text in Tamil, Hindi, Telugu and 15+ Indian languages, right in your browser. No sign up, no install.</p>
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

        {mode !== "live" && (
          <div className="field">
            <span>Speech engine</span>
            <div className="tabs" role="radiogroup">
              <button role="radio" aria-checked={engine === "sansa"} aria-selected={engine === "sansa"} onClick={() => setEngine("sansa")} disabled={busy}>
                SANSA engine <small>free, accurate</small>
              </button>
              <button role="radio" aria-checked={engine === "sarvam"} aria-selected={engine === "sarvam"} onClick={() => setEngine("sarvam")} disabled={busy}>
                Sarvam AI <small>needs key</small>
              </button>
              <button role="radio" aria-checked={engine === "free"} aria-selected={engine === "free"} onClick={() => setEngine("free")} disabled={busy}>
                On-device <small>free, offline</small>
              </button>
            </div>
          </div>
        )}
        {mode !== "live" && engine === "sarvam" && !SARVAM_PROXY_URL && (
          <label className="field">
            <span>
              Your Sarvam API key (saved only in this browser).{" "}
              <a href="https://dashboard.sarvam.ai" target="_blank" rel="noreferrer">
                Get a free key
              </a>
            </span>
            <input
              type="password"
              autoComplete="off"
              placeholder="Paste key here"
              value={sarvamKey}
              onChange={(e) => setSarvamKey(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {mode !== "live" && engine === "sansa" && !SANSA_ENGINE_URL && (
          <label className="field">
            <span>SANSA engine address (your Hugging Face Space URL)</span>
            <input
              type="url"
              autoComplete="off"
              placeholder="https://your-name-sansa-engine.hf.space"
              value={engineUrl}
              onChange={(e) => setEngineUrl(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {mode !== "live" && engine !== "free" && !remoteSupports && (
          <p className="notice">{remoteName} does not support this language, so the free on-device engine is used.</p>
        )}
        {mode !== "live" && engine !== "free" && remoteSupports && !remoteReady && (
          <p className="notice">
            {engine === "sansa" ? "Add the SANSA engine address above" : "Add your Sarvam key above"}, or switch to On-device. Until then the free engine is used.
          </p>
        )}
        {mode !== "live" && !useSarvam && !useSansa && lang.api === null && (
          <p className="notice">This language works only with Live mic. Upload and record are not available for it yet.</p>
        )}
        {mode !== "live" && !status.ai && !useSarvam && !useSansa && (
          <label className="field">
            <span>Speech model (runs free on your device, downloads once)</span>
            <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} disabled={busy}>
              {modelChoices.map((m) => (
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
          dir="auto"
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
          <h3>Indian languages</h3>
          <p>Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Urdu and more.</p>
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
