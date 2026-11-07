import { useEffect, useRef, useState } from "react";
import { getStatus, transcribe, type Status } from "./api";
import { liveDictationSupported, useLiveDictation } from "./hooks/useLiveDictation";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { LOCAL_MODELS, TAMIL_MODEL, transcribeLocally, type LocalProgress } from "./localWhisper";
import { SARVAM_PROXY_URL, sarvamSupports, transcribeWithSarvam, type OutputStyle } from "./sarvam";
import { SANSA_ENGINE_URL, SansaLanguageUnavailable, sansaSupports, transcribeWithSansa } from "./sansaEngine";
import { keyTerms, parseMyWords, polish, toSrt, toTimedText, toVtt, type Segment, type Transcript } from "./transcript";
import { Timeline, type MediaKind } from "./Timeline";
import { denoiseToWav } from "./denoise";
import { deleteItem, listItems, renameItem, saveItem, titleFrom, type LibraryItem } from "./library";
import { readAloudSupported, speak, voiceFor, voicesReady } from "./readAloud";
import { Library } from "./Library";

const STYLES: { id: OutputStyle; label: string; note: string }[] = [
  { id: "native", label: "As spoken", note: "same language" },
  { id: "english", label: "English", note: "translate" },
  { id: "roman", label: "Tanglish", note: "English letters" },
  { id: "codemix", label: "Mixed", note: "Tamil + English words" },
];

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
  const [style, setStyle] = useState<OutputStyle>(() => {
    const v = load("vtt.style", "native");
    return STYLES.some((x) => x.id === v) ? (v as OutputStyle) : "native";
  });
  const [clean, setClean] = useState(() => load("vtt.clean", "0") === "1");
  const [myWords, setMyWords] = useState(() => load("vtt.myWords", ""));
  const [showWords, setShowWords] = useState(false);
  const [segments, setSegments] = useState<Segment[]>(() => {
    try {
      const v = JSON.parse(load("vtt.segments", "[]")) as unknown;
      return Array.isArray(v) ? (v as Segment[]) : [];
    } catch {
      return [];
    }
  });
  const [media, setMedia] = useState<{ url: string; kind: MediaKind } | null>(null);
  const audioUrl = media?.url ?? null;
  const [denoise, setDenoise] = useState(() => load("vtt.denoise", "0") === "1");
  const [cleaning, setCleaning] = useState<number | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [stopSpeaking, setStopSpeaking] = useState<(() => void) | null>(null);
  const [readRate, setReadRate] = useState(() => Number(load("vtt.readRate", "1")) || 1);
  const [notice, setNotice] = useState<string | null>(null);
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
  useEffect(() => save("vtt.style", style), [style]);
  useEffect(() => save("vtt.clean", clean ? "1" : "0"), [clean]);
  useEffect(() => save("vtt.myWords", myWords), [myWords]);
  useEffect(() => save("vtt.segments", JSON.stringify(segments)), [segments]);
  useEffect(() => save("vtt.denoise", denoise ? "1" : "0"), [denoise]);
  useEffect(() => save("vtt.readRate", String(readRate)), [readRate]);
  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);
  const refreshLibrary = () =>
    listItems()
      .then(setLibrary)
      .catch(() => setLibrary([]));
  useEffect(() => {
    void refreshLibrary();
  }, []);
  useEffect(() => () => stopSpeaking?.(), [stopSpeaking]);

  const rules = parseMyWords(myWords);
  const finish = (t: Transcript) => polish(t, { clean, rules });

  const append = (chunk: string) => {
    if (!chunk) return;
    setText((prev) => (prev && !prev.endsWith("\n") ? `${prev} ${chunk}` : prev + chunk));
  };

  // Tamil gets the Tamil-trained model by default; other languages use the general Whisper models.
  const isTamil = lang.api === "ta";
  const localModel = isTamil ? tamilModel : generalModel;
  const setLocalModel = isTamil ? setTamilModel : setGeneralModel;
  const modelChoices = LOCAL_MODELS.filter((m) => !m.lang || m.lang === lang.api);

  const live = useLiveDictation(lang.id === "auto" ? "ta-IN" : lang.id, (chunk) => append(finish({ text: chunk, segments: [] }).text));
  const recorder = useVoiceRecorder();

  const sarvamReady = Boolean(SARVAM_PROXY_URL || sarvamKey.trim());
  const useSarvam = engine === "sarvam" && sarvamSupports(lang.id) && sarvamReady;
  const sansaUrl = SANSA_ENGINE_URL ?? (engineUrl.trim() || null);
  const useSansa = engine === "sansa" && sansaSupports(lang.id) && Boolean(sansaUrl);
  const remoteReady = engine === "sansa" ? Boolean(sansaUrl) : sarvamReady;
  const remoteSupports = engine === "sansa" ? sansaSupports(lang.id) : sarvamSupports(lang.id);
  const remoteName = engine === "sansa" ? "SANSA engine" : "Sarvam AI";
  // Output styles: Sarvam does all four. Without Sarvam, English uses on-device Whisper's
  // free translate; Tanglish and Mixed are not available yet, so text stays as spoken.
  const styleNeedsSarvam = (style === "roman" || style === "codemix") && !useSarvam;
  const translateLocally = style === "english" && !useSarvam;

  const runTranscribe = async (audio: Blob, name?: string) => {
    if (audio.size === 0) return;
    if (!useSarvam && !useSansa && lang.api === null) {
      setError(`${lang.label.split(" - ")[0]} is not supported for upload/record yet. Use Live mic.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Optional free noise clean-up first; the original file is still what plays back.
      const input = denoise
        ? await denoiseToWav(audio, (f) => setCleaning(f)).finally(() => setCleaning(null))
        : audio;
      // Sarvam AI (most accurate for Indian languages) when chosen and supported;
      // else server OpenAI when configured; else free on-device Whisper.
      // The Tamil-trained model only writes Tamil, so English translation uses the general model.
      const local = () =>
        translateLocally
          ? transcribeLocally(input, lang.api ?? "", generalModel, setProgress, "translate")
          : transcribeLocally(input, lang.api ?? "", localModel, setProgress);
      const raw: Transcript = translateLocally
        ? await local()
        : useSansa
        ? await transcribeWithSansa(input, lang.id, sansaUrl!, (done, total) => setPieces({ done, total })).catch((e) => {
            // Engine has no model for this language yet: fall back to the free on-device engine.
            if (!(e instanceof SansaLanguageUnavailable)) throw e;
            setPieces(null);
            return local();
          })
        : useSarvam
        ? await transcribeWithSarvam(
            input,
            lang.id,
            sarvamKey.trim() || null,
            (done, total) => setPieces({ done, total }),
            style,
            keyTerms(rules),
          )
        : status.ai
          ? { text: await transcribe(input, lang.api ?? ""), segments: [] }
          : await local();
      const out = finish(raw);
      if (!out.text) {
        setError("No speech found in this audio.");
        return;
      }
      append(out.text);
      setSegments(out.segments);
      const kind: MediaKind = audio.type.startsWith("video/") ? "video" : "audio";
      setMedia(out.segments.length ? { url: URL.createObjectURL(audio), kind } : null);
      // Keep a copy in My library (this device only).
      try {
        const saved = await saveItem({
          title: name?.replace(/\.[^.]+$/, "") || titleFrom(out.text, "Recording"),
          text: out.text,
          segments: out.segments,
          lang: lang.id,
          media: audio,
          mediaType: kind,
        });
        setCurrentId(saved.id);
        void refreshLibrary();
      } catch {
        /* library unavailable (private window): the text is still shown */
      }
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
    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|mkv|m4v)$/i.test(file.name);
    const maxMb = isVideo ? 300 : 25;
    if (file.size > maxMb * 1024 * 1024) {
      setError(`File is too big. Max ${maxMb} MB for ${isVideo ? "video" : "audio"}.`);
      return;
    }
    // Some phones leave the type empty for .mov/.mkv; mark it so the timeline shows a video player.
    const blob = isVideo && !file.type ? new Blob([file], { type: "video/mp4" }) : file;
    await runTranscribe(blob, file.name);
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

  const download = (content: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const switchMode = (m: Mode) => {
    live.stop();
    if (recorder.state === "recording") void recorder.stop();
    setError(null);
    setMode(m);
  };

  const readLang = style === "english" && mode !== "live" ? "en-IN" : lang.id === "auto" ? "ta-IN" : lang.id;
  const toggleRead = async () => {
    if (stopSpeaking) {
      stopSpeaking();
      setStopSpeaking(null);
      return;
    }
    await voicesReady();
    if (!voiceFor(readLang)) {
      setNotice(
        "This device has no voice for this language, so it may sound wrong. On Android: Settings → Text-to-speech → install the language. On Windows: Settings → Time & language → Speech.",
      );
    } else setNotice(null);
    const stop = speak(text, readLang, readRate, () => setStopSpeaking(null));
    setStopSpeaking(() => stop);
  };

  const openItem = (item: LibraryItem) => {
    setText(item.text);
    setSegments(item.segments);
    setMedia(item.media && item.segments.length ? { url: URL.createObjectURL(item.media), kind: item.mediaType ?? "audio" } : null);
    setCurrentId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const shownError = error ?? live.error;
  const busyText = cleaning != null
    ? `Cleaning background noise… ${Math.round(cleaning * 100)}%`
    : pieces
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
              {busy ? "Working…" : "Choose audio or video"}
            </label>
            <p className="hint">
              mp3, m4a, wav, ogg, WhatsApp voice notes (max 25 MB), or mp4/webm video for subtitles (max 300 MB). First time, the speech
              model downloads once.
            </p>
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
        {mode !== "live" && (
          <div className="field">
            <span>Write the text as</span>
            <div className="tabs four" role="radiogroup">
              {STYLES.map((x) => (
                <button
                  key={x.id}
                  role="radio"
                  aria-checked={style === x.id}
                  aria-selected={style === x.id}
                  onClick={() => setStyle(x.id)}
                  disabled={busy}
                >
                  {x.label} <small>{x.note}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {mode !== "live" && styleNeedsSarvam && (
          <p className="notice">
            {style === "roman" ? "Tanglish" : "Mixed"} output needs the Sarvam AI engine for now (free option is coming with the SANSA engine). Until then the text is written as spoken.
          </p>
        )}
        {mode !== "live" && translateLocally && engine !== "free" && (
          <p className="notice">English translation runs free on this device with Whisper{engine === "sarvam" ? " until a Sarvam key is added" : ""}.</p>
        )}

        <div className="options">
          {mode !== "live" && (
            <label className="check">
              <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} disabled={busy} />
              <span>
                Clean background noise <small>fan, traffic, crowd. Free, on this device</small>
              </span>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
            <span>
              Clean mode <small>removes umm, uh, ம்ம் and tidies punctuation</small>
            </span>
          </label>
          <button className="link" onClick={() => setShowWords((v) => !v)} aria-expanded={showWords}>
            My words{rules.length ? ` (${rules.length})` : ""} {showWords ? "▴" : "▾"}
          </button>
        </div>
        {showWords && (
          <label className="field">
            <span>
              Names and words SANSA should spell right, one per line. Write <code>wrong = Right</code> to fix a common mistake.
            </span>
            <textarea
              className="small"
              rows={4}
              value={myWords}
              onChange={(e) => setMyWords(e.target.value)}
              placeholder={"SANSA\nsansa ai = SANSA AI\nChennai"}
            />
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
        {segments.length > 0 && <Timeline segments={segments} mediaUrl={audioUrl} kind={media?.kind ?? "audio"} />}
        {notice && <p className="notice">{notice}</p>}
        <div className="row">
          <button onClick={copy} disabled={!text}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button onClick={() => download(text, "txt")} disabled={!text}>
            Download .txt
          </button>
          {readAloudSupported && (
            <span className="read">
              <button onClick={() => void toggleRead()} disabled={!text && !stopSpeaking} aria-pressed={Boolean(stopSpeaking)}>
                {stopSpeaking ? "■ Stop reading" : "🔊 Read aloud"}
              </button>
              <select value={readRate} onChange={(e) => setReadRate(Number(e.target.value))} aria-label="Reading speed">
                <option value={0.8}>Slow</option>
                <option value={1}>Normal</option>
                <option value={1.25}>Fast</option>
              </select>
            </span>
          )}
          {segments.length > 0 && (
            <>
              <button onClick={() => download(toSrt(segments), "srt")} title="Subtitles for YouTube, Instagram, video editors">
                Subtitles .srt
              </button>
              <button onClick={() => download(toVtt(segments), "vtt")} title="Subtitles for web video">
                .vtt
              </button>
              <button onClick={() => download(toTimedText(segments), "txt")} title="Text with a time before each line">
                Text with times
              </button>
            </>
          )}
          <button
            className="ghost"
            onClick={() => {
              setText("");
              setSegments([]);
              setMedia(null);
              setCurrentId(null);
            }}
            disabled={!text && !segments.length}
          >
            Clear
          </button>
        </div>
      </section>

      <Library
        items={library}
        currentId={currentId}
        onOpen={openItem}
        onRename={(item, title) => void renameItem(item, title).then(refreshLibrary)}
        onDelete={(item) => void deleteItem(item.id).then(refreshLibrary)}
      />
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
