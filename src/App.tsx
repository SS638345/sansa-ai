import { useEffect, useRef, useState } from "react";
import { liveDictationSupported, useLiveDictation } from "./hooks/useLiveDictation";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { LOCAL_MODELS, TAMIL_MODEL, transcribeLocally, type LocalProgress } from "./localWhisper";
import { Ic, bare } from "./icons";
import { SARVAM_PROXY_URL, sarvamSupports, transcribeWithSarvam, type OutputStyle } from "./sarvam";
import { SANSA_ENGINE_URL, SansaLanguageUnavailable, sansaSupports, transcribeWithSansa } from "./sansaEngine";
import { keyTerms, parseMyWords, polish, toSrt, toTimedText, toVtt, type Segment, type Transcript } from "./transcript";
import { Timeline, type MediaKind } from "./Timeline";
import { denoiseToWav } from "./denoise";
import { deleteItem, listItems, renameItem, saveItem, titleFrom, type LibraryItem } from "./libraryStore";
import { readAloudSupported, speak, voiceFor, voicesReady } from "./readAloud";
import { Library } from "./Library";
import { LoginGate } from "./auth";
import { Agents, Api, Cleanup, Clone, Cta, Faq, Hero, HomeProvider, HowItWorks, Products, SiteFooter, VoiceChanger, SiteHeader, Voices, useTheme } from "./Landing";
import { t, tr, useUi } from "./i18n";
import { tanglishToTamil } from "./translit";
import { ENGINE_UPLOAD_MB, LOCAL_UPLOAD_MB, VIDEO_UPLOAD_MB } from "./limits";
import { printAsPdf, shareToWhatsApp, toDocx } from "./exportDoc";
import { getStatus, transcribe, type Status } from "./api";

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

/** Shown on the page (template wording); the same questions are in index.html as FAQPage data for Google. Keep both in sync. */
const FAQ: { q: string; a: string }[] = [
  {
    q: "Which languages are supported?",
    a: "Voice to text works in Tamil, English and 15+ Indian languages. The AI voices speak Tamil and English.",
  },
  {
    q: "Is my audio saved?",
    a: "No. Audio is converted on our own server in India or on your device, and is not saved. Your texts stay only in your browser.",
  },
  {
    q: "How does voice cloning work?",
    a: "Tick the box, read a short Tamil passage aloud (about 20 seconds) and we check the words, so only your own voice can be used. Then type up to 300 characters in Tamil or English and get an MP3 in your voice. Your voice print stays only in your browser.",
  },
  {
    q: "Is it free?",
    a: "Yes. Every tool on this site is free. You only sign in with your Google account.",
  },
  {
    q: "How do I convert a WhatsApp voice note?",
    a: "Upload the voice note, or on Android add this site to your home screen and use Share > Sansa Voice from WhatsApp.",
  },
];

export default function App() {
  useUi(); // re-render the whole page when the site language changes
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
    // A build with its own engine (sansaai.in home server) starts on it; elsewhere on-device.
    const e = load("vtt.engine", SANSA_ENGINE_URL ? "sansa" : "free");
    // Without an engine address, SANSA engine would just fall back; start on the on-device engine.
    if (e === "sansa" && !SANSA_ENGINE_URL && !load("vtt.engineUrl", "")) return "free";
    // sansaai.in runs its own engine: no outside services or API keys, so an old "sarvam" choice moves to it.
    if (SANSA_ENGINE_URL && e === "sarvam") return "sansa";
    return e === "sansa" || e === "sarvam" ? e : "free";
  });
  const [engineUrl, setEngineUrl] = useState(() => load("vtt.engineUrl", ""));
  const [sarvamKey, setSarvamKey] = useState(() => load("vtt.sarvamKey", ""));
  const [pieces, setPieces] = useState<{ done: number; total: number; left?: number; resumed?: number } | null>(null);
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
  const finish = (t: Transcript) => polish(t, { clean, rules, codemix: localCodemix, tanglish: localTanglish });

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
  const { theme, toggle: toggleTheme } = useTheme();
  // "Talk live" in the hero: switch to the live mic in that language, then start once the language has applied.
  const [autoStart, setAutoStart] = useState(false);
  useEffect(() => {
    if (!autoStart || mode !== "live") return;
    setAutoStart(false);
    if (!live.listening) live.start();
  }, [autoStart, mode, live]);

  const sarvamReady = Boolean(SARVAM_PROXY_URL || sarvamKey.trim());
  const useSarvam = engine === "sarvam" && sarvamSupports(lang.id) && sarvamReady;
  const sansaUrl = SANSA_ENGINE_URL ?? (engineUrl.trim() || null);
  const useSansa = engine === "sansa" && sansaSupports(lang.id) && Boolean(sansaUrl);
  const remoteReady = engine === "sansa" ? Boolean(sansaUrl) : sarvamReady;
  const remoteSupports = engine === "sansa" ? sansaSupports(lang.id) : sarvamSupports(lang.id);
  const remoteName = engine === "sansa" ? "SANSA engine" : "Sarvam AI";
  // Output styles: Sarvam does all four. Without Sarvam, English uses on-device Whisper's
  // free translate, Mixed puts English words back in English on this device (src/codemix.ts),
  // and Tanglish is not available yet, so text stays as spoken.
  const localCodemix = style === "codemix" && !useSarvam;
  // Tanglish: written on this device from the Tamil text (src/translit.ts), no API needed
  const localTanglish = style === "roman" && !useSarvam;
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
        ? await transcribeWithSansa(
            input,
            lang.id,
            sansaUrl!,
            (done, total, left, resumed) => setPieces({ done, total, left, resumed }),
            name ? `${name}|${audio.size}|${lang.id}|${denoise ? 1 : 0}` : undefined,
          ).catch((e) => {
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
        setError(tr("No speech found in this audio."));
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
      setError(tr("Could not open the microphone. Allow mic access and try again."));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|mkv|m4v)$/i.test(file.name);
    // Our own Tamil engine takes long recordings (up to about an hour); on-device models stay at 25 MB.
    const maxMb = isVideo ? VIDEO_UPLOAD_MB : useSansa ? ENGINE_UPLOAD_MB : LOCAL_UPLOAD_MB;
    if (file.size > maxMb * 1024 * 1024) {
      setError(t(`File is too big. Max ${maxMb} MB for ${isVideo ? "video" : "audio"}.`, `File மிகப் பெரியது. ${isVideo ? "Video" : "Audio"}-க்கு அதிகபட்சம் ${maxMb} MB.`));
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
      setError(tr("Copy failed. Select the text and copy manually."));
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

  // A file shared from another app (Android share sheet → sw.js) is waiting: convert it right away.
  const sharedDone = useRef(false);
  useEffect(() => {
    if (sharedDone.current || !new URLSearchParams(location.search).has("shared")) return;
    sharedDone.current = true;
    history.replaceState(null, "", location.pathname + location.hash);
    void (async () => {
      try {
        const cache = await caches.open("sansa-share");
        const res = await cache.match("shared-file");
        if (!res) return;
        await cache.delete("shared-file");
        const name = decodeURIComponent(res.headers.get("X-Name") ?? "shared-audio");
        const file = new File([await res.blob()], name, { type: res.headers.get("Content-Type") ?? "" });
        setMode("upload");
        document.getElementById("app")?.scrollIntoView({ behavior: "smooth", block: "start" });
        await onFile(file);
      } catch {
        setError(tr("Could not open the shared file. Use Upload audio instead."));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (m: Mode) => {
    live.stop();
    if (recorder.state === "recording") void recorder.stop();
    setError(null);
    setMode(m);
  };

  const talkLive = (langTag: string) => {
    document.getElementById("app")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (busy) return;
    if (!liveDictationSupported) {
      switchMode("record");
      return;
    }
    setLangId(langTag);
    switchMode("live");
    setAutoStart(true);
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
      ? (() => {
          const eng = useSansa ? "SANSA engine" : "Sarvam AI";
          const part = Math.min(pieces.done + 1, pieces.total);
          const m = pieces.left != null ? Math.max(1, Math.round(pieces.left / 60)) : null;
          const left = m == null ? "" : t(` · about ${m} min left`, ` · சுமார் ${m} நிமிடம் மீதம்`);
          const resumed = pieces.resumed ? t(` · continued from part ${pieces.resumed + 1}`, ` · பகுதி ${pieces.resumed + 1}-இல் இருந்து தொடர்கிறது`) : "";
          return t(`${eng}: converting part ${part} of ${pieces.total}…`, `${eng}: பகுதி ${part} / ${pieces.total} மாற்றுகிறது…`) + left + resumed;
        })()
      : t(`${useSansa ? "SANSA engine" : "Sarvam AI"}: converting…`, `${useSansa ? "SANSA engine" : "Sarvam AI"}: மாற்றுகிறது…`)
    : progress?.stage === "decoding"
      ? "Reading audio…"
      : progress?.stage === "loading"
        ? progress.percent != null && progress.percent < 100
          ? `Downloading speech model… ${progress.percent}%`
          : "Loading speech model…"
        : "Converting to text…";

  return (
    <>
    <HomeProvider theme={theme} onToggleTheme={toggleTheme} onStartDictation={() => talkLive(langId === "auto" ? "ta-IN" : langId)}>
      <SiteHeader />
      <LoginGate />
      <Hero />
      <Products />
      <HowItWorks />

    <div className="page" id="app">
      <div className="app-head">
        <div>
          <span className="eyebrow at">{tr("Voice to text")}</span>
          <h2>{tr("Try it now.")}</h2>
        </div>
        <span className={`pill ${status.ai || SANSA_ENGINE_URL ? "ok" : ""}`}>
          {SANSA_ENGINE_URL ? tr("Tamil engine on") : status.ai ? tr("AI on") : tr("Free mode")}
        </span>
      </div>

      <main className="app">

      <section className="card controls">
        <label className="field">
          <span>{tr("Language")}</span>
          <select value={langId} onChange={(e) => setLangId(e.target.value)} disabled={live.listening || busy}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {tr(l.label)}
              </option>
            ))}
          </select>
        </label>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === "live"} onClick={() => switchMode("live")}>
            {tr("Live mic")} <small>{tr("free")}</small>
          </button>
          <button role="tab" aria-selected={mode === "record"} onClick={() => switchMode("record")}>
            {tr("Record & convert")} <small>{status.ai ? "AI" : tr("free")}</small>
          </button>
          <button role="tab" aria-selected={mode === "upload"} onClick={() => switchMode("upload")}>
            {tr("Upload audio")} <small>{status.ai ? "AI" : tr("free")}</small>
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
                  {live.listening ? <><Ic.Stop /> {bare(tr("■ Stop"))}</> : <><Ic.Mic /> {bare(tr("● Start speaking"))}</>}
                </button>
                <p className="hint">
                  {live.listening ? tr("Listening… text appears as you speak.") : tr("Words appear live while you talk. Works best in Chrome.")}
                </p>
              </>
            ) : (
              <p className="hint">{tr("This browser has no live speech engine. Open in Chrome, or use Record & convert.")}</p>
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
              {busy ? <><Ic.Loader className="ico spin" /> {tr("Working…")}</> : recorder.state === "recording" ? <><Ic.Stop /> {tr("Stop & convert")}</> : <><Ic.Record /> {tr("Record")}</>}
            </button>
            <p className="hint">{tr("Record first, then the whole clip is converted. More accurate for long talks.")}</p>
          </div>
        )}

        {mode === "upload" && (
          <div className="action">
            <label className={`upload ${busy ? "disabled" : ""}`}>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.oga,.opus,.webm,.flac,.mp4,.aac,.amr,.3gp,.3ga,.wma,.caf,.aif,.aiff,.mkv,.mov,.avi,.wmv,.m4b,.mpga"
                disabled={busy}
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              {busy ? "Working…" : "Choose audio or video"}
            </label>
            <p className="hint">
              {useSansa ? tr("Any audio: mp3, m4a, wav, ogg, opus, amr, aac, WhatsApp voice notes and call recordings, up to about 1 hour (200 MB). Long recordings show the time left and continue where they stopped if the page closes. Video for subtitles up to 300 MB.") : tr("Any audio: mp3, m4a, wav, ogg, opus, amr, aac, flac, wma, 3gp, WhatsApp voice notes, call recordings (max 25 MB), or mp4/webm video for subtitles (max 300 MB). First time, the speech model downloads once.")}
            </p>
          </div>
        )}

        {mode !== "live" && (
          <div className="field">
            <span>{tr("Speech engine")}</span>
            <div className={SANSA_ENGINE_URL ? "tabs two" : "tabs"} role="radiogroup">
              <button role="radio" aria-checked={engine === "sansa"} aria-selected={engine === "sansa"} onClick={() => setEngine("sansa")} disabled={busy}>
                {tr("SANSA engine")} <small>{tr("free, accurate")}</small>
              </button>
              {!SANSA_ENGINE_URL && (
                <button role="radio" aria-checked={engine === "sarvam"} aria-selected={engine === "sarvam"} onClick={() => setEngine("sarvam")} disabled={busy}>
                  Sarvam AI <small>needs key</small>
                </button>
              )}
              <button role="radio" aria-checked={engine === "free"} aria-selected={engine === "free"} onClick={() => setEngine("free")} disabled={busy}>
                {tr("On-device")} <small>{tr("free, offline")}</small>
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
          <p className="notice">{tr("This language works only with Live mic. Upload and record are not available for it yet.")}</p>
        )}
        {mode !== "live" && !status.ai && !useSarvam && !useSansa && (
          <label className="field">
            <span>{tr("Speech model (runs free on your device, downloads once)")}</span>
            <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} disabled={busy}>
              {modelChoices.map((m) => (
                <option key={m.id} value={m.id}>
                  {tr(m.label)}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode !== "live" && (
          <div className="field">
            <span>{tr("Write the text as")}</span>
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
                  {tr(x.label)} <small>{tr(x.note)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {mode !== "live" && translateLocally && engine !== "free" && (
          <p className="notice">English translation runs free on this device with Whisper{engine === "sarvam" ? " until a Sarvam key is added" : ""}.</p>
        )}

        <div className="options">
          {mode !== "live" && (
            <label className="check">
              <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} disabled={busy} />
              <span>
                {tr("Clean background noise")} <small>{tr("fan, traffic, crowd. Free, on this device")}</small>
              </span>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
            <span>
              {tr("Clean mode")} <small>{tr("removes umm, uh, ம்ம் and tidies punctuation")}</small>
            </span>
          </label>
          <button className="link" onClick={() => setShowWords((v) => !v)} aria-expanded={showWords}>
            {tr("My words")}{rules.length ? ` (${rules.length})` : ""} {showWords ? <Ic.ChevronUp /> : <Ic.ChevronDown />}
          </button>
        </div>
        {showWords && (
          <label className="field">
            <span>
              {tr("Names and words SANSA should spell right, one per line. Write")} <code>wrong = Right</code> {tr("to fix a common mistake.")}
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
          <h2>{tr("Text")}</h2>
          <span className="count">{(() => { const n = text.trim() ? text.trim().split(/\s+/).length : 0; return t(`${n} words`, `${n} சொற்கள்`); })()}</span>
        </div>
        <textarea
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr("Your text will appear here. You can edit it too.")}
          rows={12}
        />
        {live.interim && <p className="interim">{live.interim}</p>}
        {segments.some((s) => s.check) && (
          <p className="check-note" role="status">
            {tr(
              "⚠ {n} line(s) may have mistakes. They are marked yellow in the Timeline below. Tap one to hear it, then fix the text above.",
            ).replace("{n}", String(segments.filter((s) => s.check).length))}
          </p>
        )}
        {segments.length > 0 && <Timeline segments={segments} mediaUrl={audioUrl} kind={media?.kind ?? "audio"} />}
        {notice && <p className="notice">{notice}</p>}
        <div className="row">
          <button onClick={copy} disabled={!text}>
            {copied ? <><Ic.Check /> {tr("Copied ✓").replace(/\s*✓$/, "")}</> : <><Ic.Copy /> {tr("Copy")}</>}
          </button>
          <button onClick={() => download(text, "txt")} disabled={!text}>
            <Ic.Download /> {tr("Download .txt")}
          </button>
          <button
            onClick={() => {
              const name = `sansa-voice-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.docx`;
              const a = document.createElement("a");
              a.href = URL.createObjectURL(toDocx(text, tr("Sansa Voice text")));
              a.download = name;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            }}
            disabled={!text}
            title={tr("Download as a Word document")}
          >
            <Ic.FileText /> Word
          </button>
          <button
            onClick={() => {
              if (!printAsPdf(text, tr("Sansa Voice text"))) setNotice(tr("Allow pop-ups for this site to save as PDF."));
            }}
            disabled={!text}
            title={tr("Opens a print page: choose Save as PDF")}
          >
            <Ic.Printer /> PDF
          </button>
          <button onClick={() => void shareToWhatsApp(text)} disabled={!text} title={tr("Share the text on WhatsApp")}>
            <Ic.Message /> WhatsApp
          </button>
          {/[A-Za-z]{3,}/.test(text) && (
            <button onClick={() => setText(tanglishToTamil(text))} title={tr("Turn Tanglish typed in English letters into Tamil letters")}>
              <Ic.Languages /> {tr("Tanglish → தமிழ்")}
            </button>
          )}
          {readAloudSupported && (
            <span className="read">
              <button onClick={() => void toggleRead()} disabled={!text && !stopSpeaking} aria-pressed={Boolean(stopSpeaking)}>
                {stopSpeaking ? <><Ic.Stop /> {bare(tr("■ Stop reading"))}</> : <><Ic.Volume /> {bare(tr("🔊 Read aloud"))}</>}
              </button>
              <select value={readRate} onChange={(e) => setReadRate(Number(e.target.value))} aria-label={tr("Reading speed")}>
                <option value={0.8}>{tr("Slow")}</option>
                <option value={1}>{tr("Normal")}</option>
                <option value={1.25}>{tr("Fast")}</option>
              </select>
            </span>
          )}
          {segments.length > 0 && (
            <>
              <button onClick={() => download(toSrt(segments), "srt")} title={tr("Subtitles for YouTube, Instagram, video editors")}>
                {tr("Subtitles .srt")}
              </button>
              <button onClick={() => download(toVtt(segments), "vtt")} title={tr("Subtitles for web video")}>
                .vtt
              </button>
              <button onClick={() => download(toTimedText(segments), "txt")} title={tr("Text with a time before each line")}>
                {tr("Text with times")}
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
            {tr("Clear")}
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
      <p className="privacy-line">
        {tr("Your saved texts stay only in your own browser.")}
        {SANSA_ENGINE_URL ? tr(" Tamil audio is sent to our own server only to convert it, and is not saved.") : ""}
      </p>
    </div>

      <Cleanup />
      <Voices />
      <Clone />
      <VoiceChanger />
      <Agents />
      <Api />
      <Faq items={FAQ} />
      <Cta />
      <SiteFooter />
    </HomeProvider>
    </>
  );
}
