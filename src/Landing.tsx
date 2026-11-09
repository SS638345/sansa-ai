/**
 * SANSA home page (Claude Design "SANSA Home", 2026-11-08).
 * Header with ⌘K search, 3D orb hero, products, voices, voice cloning sample, live agent,
 * developer API, FAQ, CTA and footer. Everything on the page works today; features that are
 * not live yet are labelled tr("Coming soon") instead of being faked.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { readAloudSupported, voiceFor, voicesReady } from "./readAloud";
import { think, type Reply } from "./agentBrain";
import { CLONE_MAX_CHARS, LONG_TEXT_MAX_CHARS, SPEAK_MAX_CHARS } from "./limits";
import { setUi, t, tr, useUi } from "./i18n";
import { tamilToTanglish } from "./translit";
import { Ic, bare } from "./icons";
import { AuthButton, askLogin } from "./auth";

type Theme = "light" | "dark";
type Lang = "en" | "ta";

/* ------------------------------------------------------------------ theme */

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem("vtt.theme");
    if (t === "light" || t === "dark") return t;
  } catch {
    /* storage blocked */
  }
  return "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#06060a" : "#f5f4f0");
    try {
      localStorage.setItem("vtt.theme", theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

/* ------------------------------------------------------------------ data */

const SW = [
  "radial-gradient(circle at 35% 30%,#ffe2a6,#f2b950 45%,#d9822b)",
  "radial-gradient(circle at 35% 30%,#c9d4ff,#4c6fff 50%,#1d2a8a)",
  "radial-gradient(circle at 35% 30%,#c8f5da,#2fbf8f 50%,#13604a)",
  "radial-gradient(circle at 35% 30%,#f3d0ff,#a55cf0 50%,#4b1f8a)",
  "radial-gradient(circle at 35% 30%,#ffd0e4,#e0569b 50%,#7a1d4b)",
  "radial-gradient(circle at 35% 30%,#e8e8ee,#8b8b9a 50%,#33333f)",
  "radial-gradient(circle at 35% 30%,#fff1b8,#e3b52a 50%,#7a5a08)",
  "radial-gradient(circle at 35% 30%,#c4f1ff,#28a8d8 50%,#0b4a63)",
];

type Gender = "female" | "male";
type Voice = { id: string; name: string; desc: string; lang: Lang; gender: Gender; swatch: string };

/** The real SANSA voice engine voices (AI4Bharat Indic-TTS on our server). */
const VOICES: Voice[] = (
  [
    ["kavya", "Kavya", "Tamil · Female", "ta", "female"],
    ["arjun", "Arjun", "Tamil · Male", "ta", "male"],
    ["meera", "Meera", "English · Female", "en", "female"],
    ["vikram", "Vikram", "English · Male", "en", "male"],
  ] as const
).map(([id, name, desc, lang, gender], i) => ({ id, name, desc, lang, gender, swatch: SW[i] }));

const voiceFor2 = (lang: Lang, gender: Gender) => VOICES.find((v) => v.lang === lang && v.gender === gender) ?? VOICES[0];

const TTS_URL = "/tts/speak";
const WARM_URL = "/tts/warm";
const warmedAt: Partial<Record<Lang, number>> = {};
/** Ask the voice engine to load this language now, so it is ready when the visitor presses play (at most once a minute). */
function warmVoice(lang: Lang) {
  const now = Date.now();
  if (now - (warmedAt[lang] ?? 0) < 60_000) return;
  warmedAt[lang] = now;
  void fetch(WARM_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang }), keepalive: true }).catch(() => undefined);
}

const SAMPLE: Record<Lang, string> = {
  en: "Welcome to SANSA. Type anything here and hear it come alive.",
  ta: "வணக்கம்! SANSA-வுக்கு உங்களை வரவேற்கிறோம்.",
};

const CONTACT = "./contact";

/* ------------------------------------------------------------------ orb state shared with the 3D scene */

const orb = { busy: false, listening: false, kick: 0 };

/* ------------------------------------------------------------------ speech recognition (browser) */

interface RecResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface RecLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<RecResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecCtor = new () => RecLike;
function recognitionCtor(): RecCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/* ------------------------------------------------------------------ agent brain: our own (agentBrain.ts), no external AI */

type Msg = { role: "user" | "assistant"; content: string };
type AgentState = "idle" | "listening" | "thinking" | "speaking";

/* ------------------------------------------------------------------ context: player, agent, palette */

type Home = {
  theme: Theme;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  voice: string;
  setVoice: (id: string) => void;
  playing: string | null;
  loadingId: string | null;
  lastAudio: { id: string; url: string; name: string } | null;
  play: (id: string, text: string, v?: Voice) => Promise<string | null>;
  speakWait: (text: string) => Promise<void>;
  stopPlaying: () => void;
  agentOpen: boolean;
  openAgent: () => void;
  palOpen: boolean;
  openPal: () => void;
  goTo: (id: string) => void;
  startDictation: () => void;
};

const Ctx = createContext<Home | null>(null);
function useHome(): Home {
  const h = useContext(Ctx);
  if (!h) throw new Error("useHome outside HomeProvider");
  return h;
}

function chunks(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?।]+[.!?।]*\s*/gu) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

const isTamil = (t: string) => /[\u0B80-\u0BFF]/.test(t);

class EngineError extends Error {
  constructor(message: string, readonly userFacing: boolean) {
    super(message);
  }
}

/** Ask the SANSA voice engine for an mp3. User-facing errors (bad text) are shown as is; others fall back to the device voice. */
async function engineAudio(text: string, lang: Lang, gender: Gender, signal: AbortSignal): Promise<Blob> {
  let r: Response;
  try {
    r = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang, voice: gender, format: "mp3" }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new EngineError("network", false);
  }
  if (r.ok) return r.blob();
  let detail = "";
  try {
    detail = ((await r.json()) as { detail?: string }).detail ?? "";
  } catch {
    /* not json */
  }
  if (r.status === 429) throw new EngineError("Too many requests. Wait a minute and try again.", true);
  if (r.status === 400 || r.status === 413) throw new EngineError(detail || "This text can't be spoken.", true);
  throw new EngineError(detail || `engine ${r.status}`, false);
}

function deviceSpeak(text: string, lang: Lang, onEnd: () => void): string | null {
  if (!readAloudSupported) return "This browser cannot read text aloud. Try Chrome or your phone's browser.";
  const dv = voiceFor(lang === "ta" ? "ta-IN" : "en-IN");
  if (!dv) return noVoiceNote(lang);
  const queue = chunks(text);
  const next = (i: number) => {
    if (i >= queue.length) return onEnd();
    const u = new SpeechSynthesisUtterance(queue[i]);
    u.voice = dv;
    u.lang = dv.lang;
    u.onboundary = () => {
      orb.kick = 1;
    };
    u.onend = () => next(i + 1);
    u.onerror = () => onEnd();
    speechSynthesis.speak(u);
  };
  next(0);
  return null;
}

function noVoiceNote(lang: Lang): string {
  return lang === "ta"
    ? "No Tamil voice on this device. On Android: Settings → Text-to-speech → add Tamil. On Windows: Settings → Time & language → Speech."
    : "No English voice found on this device.";
}

export function HomeProvider({
  theme,
  onToggleTheme,
  onStartDictation,
  children,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onStartDictation: () => void;
  children: ReactNode;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const [voice, setVoice] = useState("meera");
  useEffect(() => warmVoice(lang), [lang]);
  useEffect(() => warmVoice((VOICES.find((v) => v.id === voice) ?? VOICES[0]).lang), [voice]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [lastAudio, setLastAudio] = useState<{ id: string; url: string; name: string } | null>(null);
  const playingRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const meterRef = useRef<{ ac: AudioContext; an: AnalyserNode; iv: number } | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [palOpen, setPalOpen] = useState(false);

  const stopMeter = () => {
    const m = meterRef.current;
    if (m) {
      clearInterval(m.iv);
      void m.ac.close().catch(() => {});
      meterRef.current = null;
    }
  };

  const stopPlaying = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    stopMeter();
    playingRef.current = null;
    setPlaying(null);
    setLoadingId(null);
    orb.busy = false;
    if (readAloudSupported) speechSynthesis.cancel();
  }, []);

  /** Plays an mp3 blob; the orb follows the real loudness. Resolves when it ends or is stopped. */
  const playBlob = (id: string, blob: Blob): Promise<void> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audioRef.current = a;
      const done = () => {
        stopMeter();
        if (playingRef.current === id) {
          playingRef.current = null;
          setPlaying(null);
          orb.busy = false;
        }
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      a.onpause = () => {
        if (audioRef.current !== a) done();
      };
      try {
        const ac = new AudioContext();
        const src = ac.createMediaElementSource(a);
        const an = ac.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        an.connect(ac.destination);
        const buf = new Uint8Array(an.fftSize);
        const iv = window.setInterval(() => {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          orb.kick = Math.min(1, (peak / 128) * 1.6);
        }, 50);
        meterRef.current = { ac, an, iv };
      } catch {
        orb.busy = true;
      }
      playingRef.current = id;
      setPlaying(id);
      void a.play().catch(done);
    });

  const play = useCallback(
    async (id: string, text: string, v?: Voice) => {
      if (playingRef.current === id || abortRef.current) {
        const same = playingRef.current === id || loadingId === id;
        stopPlaying();
        if (same) return null;
      }
      stopPlaying();
      const clean = text.trim();
      if (!clean) return "Type something to hear it.";
      const lang: Lang = isTamil(clean) ? "ta" : "en";
      const gender: Gender = v?.gender ?? "female";
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoadingId(id);
      try {
        const blob = await engineAudio(clean, lang, gender, ctrl.signal);
        if (ctrl.signal.aborted) return null;
        abortRef.current = null;
        setLoadingId(null);
        const name = `sansa-${voiceFor2(lang, gender).name.toLowerCase()}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.mp3`;
        setLastAudio((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { id, url: URL.createObjectURL(blob), name };
        });
        void playBlob(id, blob);
        return null;
      } catch (e) {
        if ((e as Error).name === "AbortError") return null;
        abortRef.current = null;
        setLoadingId(null);
        if (e instanceof EngineError && e.userFacing) return e.message;
        // engine down or busy: use the device voice so the visitor still hears something
        await voicesReady();
        playingRef.current = id;
        setPlaying(id);
        orb.busy = true;
        const err = deviceSpeak(clean, lang, () => {
          if (playingRef.current === id) {
            playingRef.current = null;
            setPlaying(null);
            orb.busy = false;
          }
        });
        if (err) {
          playingRef.current = null;
          setPlaying(null);
          orb.busy = false;
          return err;
        }
        return "The SANSA voice engine is busy, so this plays with your device's voice.";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopPlaying, loadingId],
  );

  /** For the voice agent: speak a reply with the engine (device voice if it fails) and wait until done. */
  const speakWait = useCallback(
    async (text: string) => {
      stopPlaying();
      const lang: Lang = isTamil(text) ? "ta" : "en";
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const blob = await engineAudio(text, lang, "female", ctrl.signal);
        abortRef.current = null;
        if (ctrl.signal.aborted) return;
        await playBlob("agent", blob);
      } catch (e) {
        abortRef.current = null;
        if ((e as Error).name === "AbortError") return;
        await voicesReady();
        await new Promise<void>((res) => {
          if (deviceSpeak(text, lang, () => res())) res();
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopPlaying],
  );

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => stopPlaying(), [stopPlaying]);

  const startDictation = useCallback(() => {
    setAgentOpen(false);
    onStartDictation();
  }, [onStartDictation]);

  const value = useMemo<Home>(
    () => ({
      theme,
      toggleTheme: onToggleTheme,
      lang,
      setLang,
      voice,
      setVoice,
      playing,
      loadingId,
      lastAudio,
      play,
      speakWait,
      stopPlaying,
      agentOpen,
      openAgent: () => {
        stopPlaying();
        setAgentOpen(true);
      },
      palOpen,
      openPal: () => setPalOpen(true),
      goTo,
      startDictation,
    }),
    [theme, onToggleTheme, lang, voice, playing, loadingId, lastAudio, play, speakWait, stopPlaying, agentOpen, palOpen, goTo, startDictation],
  );

  return (
    <Ctx.Provider value={value}>
      <div className={agentOpen ? "home agent-on" : "home"}>{children}</div>
      {agentOpen && <AgentOverlay onClose={() => setAgentOpen(false)} />}
      {palOpen && <Palette onClose={() => setPalOpen(false)} />}
    </Ctx.Provider>
  );
}

/* ------------------------------------------------------------------ header */

/** SANSA logo: the red S mark (public/brand/sansa-mark.svg). */
function OrbMark({ size = 28 }: { size?: number }) {
  return <img className="brand-mark" src="/brand/sansa-mark.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

const SearchIcon = () => <Ic.Search size={16} />;

export function SiteHeader() {
  const h = useHome();
  const ui = useUi();
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const close = () => setMenu(false);
  return (
    <header className={menu ? "site-head menu-open" : "site-head"}>
      <nav className="site-nav">
        <a className="site-brand" href="./">
          <OrbMark />
          SANSA
        </a>
        <div className="site-links">
          <a href="#tools">{tr("Products")}</a>
          <a href="#app">{tr("Speech to Text")}</a>
          <a href="#voices">{tr("Voices")}</a>
          <a href="#clone">{tr("Voice Cloning")}</a>
          <a href="#cleanup">{tr("Audio Cleanup")}</a>
        </div>
        <button className="search-btn" onClick={h.openPal} aria-label={tr("Search")}>
          <SearchIcon />
          <span className="search-word">{tr("Search")}</span>
          <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <AuthButton />
        <button
          className="lang-btn"
          onClick={() => setUi(ui === "ta" ? "en" : "ta")}
          title={tr("Site language")}
          aria-label={ui === "ta" ? "Switch the site to English" : "தளத்தை தமிழுக்கு மாற்று"}
          lang={ui === "ta" ? "en" : "ta"}
        >
          {ui === "ta" ? "EN" : "தமிழ்"}
        </button>
        <button className="theme-btn" onClick={h.toggleTheme} title={tr("Switch light / dark")} aria-label={tr("Switch light / dark")}>
          {h.theme === "dark" ? <Ic.Sun /> : <Ic.Moon />}
        </button>
        <button
          className="menu-btn"
          onClick={() => setMenu((m) => !m)}
          aria-label={menu ? tr("Close menu") : tr("Open menu")}
          aria-expanded={menu}
          aria-controls="mobile-menu"
        >
          <span aria-hidden="true" />
        </button>
      </nav>
      {menu && (
        <div className="mobile-menu" id="mobile-menu">
          <a href="#tools" onClick={close}>
            {tr("Products")}
          </a>
          <a href="#app" onClick={close}>
            {tr("Speech to Text")}
          </a>
          <a href="#voices" onClick={close}>
            {tr("Text to Speech")}
          </a>
          <a href="#clone" onClick={close}>
            {tr("Voice Cloning")}
          </a>
          <a href="#cleanup" onClick={close}>
            {tr("Audio Cleanup")}
          </a>
          <a href="#faq" onClick={close}>
            {tr("FAQ")}
          </a>
          <div className="mobile-menu-actions">
            <AuthButton wide />
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ 3D orb (three.js, loaded after the page) */

const NOISE = `vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
vec4 j=p-49.0*floor(p*ns.z*ns.z);
vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;
const VERT = `uniform float uTime;uniform float uAmp;varying vec3 vN;varying float vD;varying vec3 vView;
${NOISE}
void main(){
float n=snoise(normal*1.3+vec3(uTime*0.22));
float n2=snoise(normal*3.2-vec3(uTime*0.5))*0.45;
float d=(n+n2)*(0.16+uAmp*0.55);
vec3 p=position+normal*d;vD=d;
vN=normalize(normalMatrix*normal);
vec4 mv=modelViewMatrix*vec4(p,1.0);vView=normalize(-mv.xyz);
gl_Position=projectionMatrix*mv;}`;
const FRAG = `uniform float uTime;uniform float uAmp;uniform float uLight;varying vec3 vN;varying float vD;varying vec3 vView;
void main(){
float f=pow(1.0-max(dot(vN,vView),0.0),2.2);
float t=clamp(vD*2.4+0.5,0.0,1.0);
float lit=max(dot(vN,normalize(vec3(-0.4,0.6,0.7))),0.0);
float dark=0.06+t*0.22+lit*0.18+f*(1.1+uAmp*0.6);
float light=0.04+t*0.18+lit*0.12+f*0.55;
float g=mix(dark,light,uLight);
gl_FragColor=vec4(vec3(clamp(g,0.0,1.0)),1.0);}`;

function Orb() {
  const { theme } = useHome();
  const host = useRef<HTMLDivElement>(null);
  const paint = useRef<((light: boolean) => void) | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    paint.current?.(theme === "light");
  }, [theme]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stopped = false;
    let cleanup = () => {};
    void import("three")
      .then((T) => {
        if (stopped) return;
        let r: InstanceType<typeof T.WebGLRenderer>;
        try {
          r = new T.WebGLRenderer({ antialias: true, alpha: true });
        } catch {
          setFallback(true);
          return;
        }
        const mobile = window.innerWidth < 760 || Boolean(window.matchMedia?.("(pointer:coarse)").matches);
        const reduce = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
        r.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(r.domElement);
        const scene = new T.Scene();
        const cam = new T.PerspectiveCamera(38, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 100);
        cam.position.z = mobile ? 7.4 : 6.2;
        const mat = new T.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uAmp: { value: 0 }, uLight: { value: 0 } },
          vertexShader: VERT,
          fragmentShader: FRAG,
        });
        const mesh = new T.Mesh(new T.IcosahedronGeometry(1.15, mobile ? 24 : 64), mat);
        scene.add(mesh);
        const NB = mobile ? 72 : 120;
        const R0 = 1.62;
        const barMat = new T.MeshBasicMaterial({ color: 0xffffff });
        const bars = new T.InstancedMesh(new T.BoxGeometry(0.03, 1, 0.03), barMat, NB);
        scene.add(bars);
        const rings = (
          [
            [2.05, 1.2, 0.55],
            [2.3, 0.9, 0.35],
            [2.55, 1.45, 0.45],
          ] as const
        ).map(([rr, tilt, op]) => {
          const m = new T.Mesh(
            new T.TorusGeometry(rr, 0.005, 8, 240),
            new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op }),
          );
          m.rotation.x = tilt;
          scene.add(m);
          return m;
        });
        const N = mobile ? 500 : 1200;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const u = Math.random() * 2 - 1;
          const th = Math.random() * Math.PI * 2;
          const rad = 2.3 + Math.random() * 1.4;
          const s = Math.sqrt(1 - u * u);
          pos[i * 3] = rad * s * Math.cos(th);
          pos[i * 3 + 1] = rad * u * 0.55;
          pos[i * 3 + 2] = rad * s * Math.sin(th);
        }
        const pg = new T.BufferGeometry();
        pg.setAttribute("position", new T.BufferAttribute(pos, 3));
        const ptsMat = new T.PointsMaterial({ size: 0.02, color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
        const pts = new T.Points(pg, ptsMat);
        scene.add(pts);
        const dummy = new T.Object3D();

        let amp = 0;
        let target = 0;
        const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
        let visible = true;
        let raf = 0;

        const frame = (now: number) => {
          const t = reduce ? 4 : now / 1000;
          if (orb.kick) {
            target = Math.max(target, orb.kick);
            orb.kick = 0;
          }
          if (orb.busy) target = Math.max(target, 0.35 + 0.25 * Math.abs(Math.sin(t * 11)));
          if (orb.listening) target = Math.max(target, 0.12 + 0.08 * Math.abs(Math.sin(t * 3)));
          target *= 0.9;
          amp += (target - amp) * 0.15;
          mouse.x += (mouse.tx - mouse.x) * 0.05;
          mouse.y += (mouse.ty - mouse.y) * 0.05;
          mat.uniforms.uTime.value = t;
          mat.uniforms.uAmp.value = amp;
          mesh.rotation.y = t * 0.12 + mouse.x * 0.5;
          mesh.rotation.x = mouse.y * 0.35;
          const sc = 1 + amp * 0.12;
          mesh.scale.set(sc, sc, sc);
          for (let i = 0; i < NB; i++) {
            const a = (i / NB) * Math.PI * 2;
            const wave = 0.5 + 0.5 * Math.sin(a * 6 + t * 2.2) * Math.cos(a * 3 - t * 1.4);
            const len = 0.08 + wave * 0.18 + amp * (0.25 + 0.55 * Math.abs(Math.sin(a * 9 + t * 14)));
            const rr = R0 + len / 2;
            dummy.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
            dummy.rotation.set(0, 0, a - Math.PI / 2);
            dummy.scale.set(1, len, 1);
            dummy.updateMatrix();
            bars.setMatrixAt(i, dummy.matrix);
          }
          bars.instanceMatrix.needsUpdate = true;
          bars.rotation.z = -t * 0.08;
          bars.rotation.x = mouse.y * 0.25;
          bars.rotation.y = mouse.x * 0.35;
          rings[0].rotation.z = t * 0.25;
          rings[1].rotation.z = -t * 0.18;
          rings[2].rotation.z = t * 0.12;
          rings.forEach((rg, k) => {
            rg.rotation.y = mouse.x * 0.3 + Math.sin(t * 0.4 + k) * 0.1;
          });
          pts.rotation.y = -t * 0.04 + mouse.x * 0.15;
          r.render(scene, cam);
        };
        const loop = (now: number) => {
          frame(now);
          if (visible) raf = requestAnimationFrame(loop);
        };
        const kickLoop = () => {
          cancelAnimationFrame(raf);
          if (reduce) frame(0);
          else if (visible) raf = requestAnimationFrame(loop);
        };

        paint.current = (light: boolean) => {
          const c = light ? 0x111015 : 0xf4f2ee;
          mat.uniforms.uLight.value = light ? 1 : 0;
          barMat.color.setHex(c);
          ptsMat.color.setHex(c);
          rings.forEach((rg) => (rg.material as InstanceType<typeof T.MeshBasicMaterial>).color.setHex(c));
          if (reduce) frame(0);
        };
        paint.current(themeRef.current === "light");

        const onMove = (e: PointerEvent) => {
          mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
          mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
        };
        const ro = new ResizeObserver(() => {
          r.setSize(el.clientWidth, el.clientHeight);
          cam.aspect = el.clientWidth / Math.max(1, el.clientHeight);
          cam.updateProjectionMatrix();
          if (reduce) frame(0);
        });
        ro.observe(el);
        const io = new IntersectionObserver(([e]) => {
          visible = e.isIntersecting;
          kickLoop();
        });
        io.observe(el);
        if (!reduce) window.addEventListener("pointermove", onMove);
        kickLoop();

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          io.disconnect();
          window.removeEventListener("pointermove", onMove);
          paint.current = null;
          scene.traverse((o) => {
            const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
            m.geometry?.dispose();
            m.material?.dispose();
          });
          r.dispose();
          r.domElement.remove();
        };
      })
      .catch(() => setFallback(true));
    return () => {
      stopped = true;
      cleanup();
    };
  }, []);

  return <div ref={host} className={fallback ? "orb-host orb-fallback" : "orb-host"} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ hero */

export function Hero() {
  const h = useHome();
  const [text, setText] = useState(SAMPLE[h.lang]);
  const [note, setNote] = useState<string | null>(null);
  const cur = VOICES.find((v) => v.id === h.voice) ?? VOICES[0];

  const pick = (l: Lang) => {
    if (text === SAMPLE[h.lang] || !text.trim()) setText(SAMPLE[l]);
    h.setLang(l);
    h.setVoice(voiceFor2(l, cur.gender).id);
    setNote(null);
  };
  const pickVoice = (v: Voice) => {
    h.setVoice(v.id);
    if (v.lang !== h.lang) pick(v.lang);
    setNote(null);
  };
  const onSpeak = async () => setNote(await h.play("hero", text, cur));
  const label =
    h.loadingId === "hero" ? (
      <>
        <Ic.Loader className="ico spin" /> {bare(tr("… Creating"))}
      </>
    ) : h.playing === "hero" ? (
      <>
        <Ic.Stop /> {bare(tr("■ Stop"))}
      </>
    ) : (
      <>
        <Ic.Play /> {bare(tr("▶ Speak"))}
      </>
    );

  return (
    <section className="hero2">
      <div className="hero2-copy fade-ui">
        <span className="eyebrow">{tr("AI Voice Platform")}</span>
        <h1>{tr("Lifelike AI voices in English and Tamil.")}</h1>
        <p className="hero2-sub">{tr("Text to speech, speech to text and noise cleanup in Tamil and English. Free, sign in with Google.")}</p>
      </div>
      <Orb />
      <div className="hero2-bar-wrap fade-ui">
        <div className="hero2-bar">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={tr("Text to hear")}
            maxLength={SPEAK_MAX_CHARS}
            lang={h.lang}
            placeholder={tr("Type anything to hear it")}
          />
          <div className="seg" role="radiogroup" aria-label={tr("Language")}>
            {(["en", "ta"] as const).map((l) => (
              <button key={l} role="radio" aria-checked={h.lang === l} className={h.lang === l ? "on" : ""} onClick={() => pick(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn-amber" onClick={() => void onSpeak()} disabled={!text.trim()}>
            {label}
          </button>
          <button className="btn-ghost" onClick={h.openAgent}>
            <span className="dot" aria-hidden="true" />
            {tr("Talk live")}
          </button>
        </div>
        <div className="voice-chips" role="radiogroup" aria-label={tr("Voice")}>
          {VOICES.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={v.id === h.voice}
              className={v.id === h.voice ? "on" : ""}
              onClick={() => pickVoice(v)}
              title={tr(v.desc)}
            >
              <span style={{ background: v.swatch }} aria-hidden="true" />
              {tr(v.name)}
            </button>
          ))}
        </div>
        {(note || h.lastAudio?.id === "hero" || h.loadingId === "hero") && (
          <p className="hero2-note" role="status">
            {h.loadingId === "hero" ? tr("Creating your audio… the first one can take up to 20 seconds.") : note}
            {h.lastAudio?.id === "hero" && h.loadingId !== "hero" && (
              <a className="dl-link" href={h.lastAudio.url} download={h.lastAudio.name}>
                <Ic.Download /> {bare(tr("⬇ Download mp3"))}
              </a>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ products */

const PRODUCTS: { name: string; desc: string; href?: string; soon?: boolean; icon: keyof typeof Ic; tint: string }[] = [
  { name: "Text to Speech", desc: "Natural voiceovers from any script.", href: "#voices", icon: "AudioLines", tint: "#f2b950" },
  { name: "Speech to Text", desc: "Accurate transcripts and subtitles.", href: "#app", icon: "Captions", tint: "#4c6fff" },
  { name: "Voice Cloning", desc: "Your own voice from a 20-second reading.", href: "#clone", icon: "Fingerprint", tint: "#2fbf8f" },
  { name: "Dubbing", desc: "Translate video and keep every voice.", soon: true, icon: "Languages", tint: "#a55cf0" },
  { name: "Voice Changer", desc: "Same words in a SANSA voice or your own voice.", href: "#changer", icon: "Wand", tint: "#e5484d" },
  { name: "Sound Effects", desc: "Generate sound from a text prompt.", soon: true, icon: "Drum", tint: "#d9822b" },
  { name: "Voice Agents", desc: "Ask SANSA about our tools, by voice. Phone agents soon.", href: "#agents", icon: "Bot", tint: "#4c6fff" },
  { name: "Audio Cleanup", desc: "Remove noise and isolate clear speech.", href: "#cleanup", icon: "Sparkles", tint: "#2fbf8f" },
];

export function Products() {
  return (
    <section id="tools" className="sec">
      <div className="sec-head">
        <span className="eyebrow at">{tr("Products")}</span>
        <h2>{tr("Everything you need to create with voice.")}</h2>
      </div>
      <div className="prod-grid">
        {PRODUCTS.map((p) => {
          const Icon = Ic[p.icon];
          const body = (
            <>
              <span className="prod-ico" style={{ "--tint": p.tint } as CSSProperties} aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="prod-name">
                {tr(p.name)} {p.soon ? <em className="soon">{tr("Coming soon")}</em> : <em className="live">{tr("Live")}</em>}
              </span>
              <span className="prod-desc">{tr(p.desc)}</span>
            </>
          );
          return p.href ? (
            <a key={tr(p.name)} className={p.soon ? "prod soon-card" : "prod"} href={p.href}>
              {body}
            </a>
          ) : (
            <div key={tr(p.name)} className="prod soon-card">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ how it works */

export function HowItWorks() {
  const steps = [
    ["01", "Write", "Type or paste your script in English or Tamil."],
    ["02", "Choose a voice", "Pick a Tamil or English voice from the library."],
    ["03", "Adjust", "Listen, change the words, and play again until it sounds right."],
    ["04", "Publish", "Download the audio as an mp3."],
  ];
  return (
    <section className="band" aria-labelledby="how">
      <div className="sec">
        <div className="sec-head">
          <span className="eyebrow at">{tr("How it works")}</span>
          <h2 id="how">{tr("From script to sound in four steps.")}</h2>
        </div>
        <ol className="steps2">
          {steps.map(([n, t, d]) => (
            <li key={n}>
              <span className="n">{n}</span>
              <b>{tr(t)}</b>
              <span>{tr(d)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ voice library */

const FILTERS = ["All", "Tamil", "English"];
const voiceSample = (v: Voice) =>
  v.lang === "ta" ? `வணக்கம், நான் ${tr(v.name)}. இது SANSA-வின் தமிழ் குரல்.` : `Hi, I'm ${tr(v.name)}. This is how I sound on SANSA.`;

export function Voices() {
  const h = useHome();
  const [filter, setFilter] = useState("All");
  const [note, setNote] = useState<string | null>(null);
  const list = VOICES.filter((v) => filter === "All" || (filter === "Tamil" ? v.lang === "ta" : v.lang === "en"));
  return (
    <section id="voices" className="sec">
      <div className="sec-head-row">
        <div className="sec-head">
          <span className="eyebrow at">{tr("Voice library")}</span>
          <h2>{tr("Hear our voices.")}</h2>
        </div>
      </div>
      <div className="filters" role="radiogroup" aria-label={tr("Voice language")}>
        {FILTERS.map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => { setFilter(f); if (f === "Tamil") warmVoice("ta"); }}>
            {tr(f)}
          </button>
        ))}
      </div>
      <div className="voice-grid">
        {list.map((v) => {
          const on = h.playing === v.id;
          const busy = h.loadingId === v.id;
          return (
            <div key={v.id} className={on ? "voice-card on" : "voice-card"}>
              <span className={on ? "voice-orb speaking" : "voice-orb"} style={{ background: v.swatch }} aria-hidden="true" />
              <div className="voice-meta">
                <b>{tr(v.name)}</b>
                <span>{tr(v.desc)}</span>
              </div>
              <button
                className="play-btn"
                aria-label={on || busy ? t(`Stop ${v.name}`, `${tr(v.name)} நிறுத்து`) : t(`Play ${v.name}`, `${tr(v.name)} கேட்க`)}
                onPointerEnter={() => warmVoice(v.lang)}
                onFocus={() => warmVoice(v.lang)}
                onClick={() => void h.play(v.id, voiceSample(v), v).then(setNote)}
              >
                {busy ? <Ic.Loader className="ico spin" /> : on ? <Ic.Stop /> : <Ic.Play />}
              </button>
            </div>
          );
        })}
      </div>
      {(note || (h.loadingId && VOICES.some((v) => v.id === h.loadingId))) && (
        <p className="sec-note" role="status">
          {h.loadingId && VOICES.some((v) => v.id === h.loadingId) ? tr("Creating audio… switching between Tamil and English can take up to 20 seconds.") : note}
        </p>
      )}
      <LongTts />
    </section>
  );
}

/* ------------------------------------------------------------------ long text -> one MP3 (A6) */

const LONG_MAX = LONG_TEXT_MAX_CHARS;
// Each request must finish inside Cloudflare's 100 s limit (error 524); ~600 characters takes 25-45 s on the home server.
const PART_MAX = 600;

/**
 * Split at sentence ends (then commas / spaces) into parts the engine accepts.
 * A new part starts whenever the language changes, so English sentences in a Tamil
 * script are read by the English voice instead of being skipped by the Tamil one.
 */
export function splitForTts(text: string, max = PART_MAX): string[] {
  const sentences = text.replace(/\r/g, "").split(/(?<=[.!?।\n])\s+/).map((s) => s.trim()).filter(Boolean);
  const parts: string[] = [];
  let cur = "";
  let curTa: boolean | null = null;
  const push = () => {
    if (cur.trim()) parts.push(cur.trim());
    cur = "";
  };
  for (let s of sentences) {
    const ta = isTamil(s);
    if (curTa !== null && ta !== curTa) push();
    curTa = ta;
    while (s.length > max) {
      const cut = Math.max(s.lastIndexOf(",", max), s.lastIndexOf(" ", max));
      const at = cut > max / 3 ? cut + 1 : max;
      push();
      parts.push(s.slice(0, at).trim());
      s = s.slice(at).trim();
    }
    if ((cur + " " + s).length > max) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return parts;
}

function LongTts() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("kavya");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; secs: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const run = async () => {
    if (busy) {
      abort.current?.abort();
      return;
    }
    const parts = splitForTts(text.slice(0, LONG_MAX));
    if (!parts.length) return;
    const v = VOICES.find((x) => x.id === voice) ?? VOICES[0];
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setError(null);
    setResult(null);
    setDone(0);
    setTotal(parts.length);
    const blobs: Blob[] = new Array(parts.length);
    let secs = 0;
    // one language at a time (the engine keeps one in memory), then joined back in the original order
    const firstTa = isTamil(parts[0]);
    const order = parts.map((_, i) => i).sort((a, b) => Number(isTamil(parts[b]) === firstTa) - Number(isTamil(parts[a]) === firstTa) || a - b);
    try {
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const lang: Lang = isTamil(parts[i]) ? "ta" : "en";
        for (let attempt = 0; ; attempt++) {
          const r = await fetch(TTS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: parts[i], lang, voice: v.gender, format: "mp3" }),
            signal: ctrl.signal,
          });
          if (r.ok) {
            blobs[i] = await r.blob();
            secs += Number(r.headers.get("X-Audio-Seconds") || 0);
            break;
          }
          // busy or rate limited: wait and try again (a long script is many requests)
          if ((r.status === 429 || r.status >= 500) && attempt < 4) {
            await new Promise((res) => setTimeout(res, 8000 * (attempt + 1)));
            continue;
          }
          let detail = "";
          try {
            detail = ((await r.json()) as { detail?: string }).detail ?? "";
          } catch {
            /* not json */
          }
          throw new Error(detail || t(`Part ${i + 1} could not be created.`, `பகுதி ${i + 1} உருவாக்க முடியவில்லை.`));
        }
        setDone(k + 1);
      }
      const name = `sansa-${v.name.toLowerCase()}-long-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.mp3`;
      setResult({ url: URL.createObjectURL(new Blob(blobs, { type: "audio/mpeg" })), name, secs });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || tr("Something went wrong. Try again."));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const mins = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  return (
    <div className="panel long-tts">
      <div className="long-head">
        <b>{tr("Long text to MP3")}</b>
        <span className="mono small">
          {text.length.toLocaleString()} / {LONG_MAX.toLocaleString()}
        </span>
      </div>
      <textarea
        value={text}
        maxLength={LONG_MAX}
        rows={6}
        onChange={(e) => setText(e.target.value)}
        placeholder={tr("Paste a script, a story or an article (Tamil or English, up to 10,000 characters). You get one MP3.")}
        disabled={busy}
      />
      <div className="long-row">
        <select
          value={voice}
          onChange={(e) => { setVoice(e.target.value); warmVoice((VOICES.find((x) => x.id === e.target.value) ?? VOICES[0]).lang); }}
          disabled={busy}
          aria-label={tr("Voice")}
        >
          {VOICES.map((x) => (
            <option key={x.id} value={x.id}>
              {tr(x.name)} · {tr(x.desc)}
            </option>
          ))}
        </select>
        <button className="btn-rec" onClick={() => void run()} disabled={!busy && !text.trim()}>
          {busy ? <><Ic.Stop /> {bare(tr("■ Stop"))}</> : <><Ic.AudioLines /> {tr("Create MP3")}</>}
        </button>
      </div>
      {busy && (
        <>
          <div className="clean-prog" aria-hidden="true">
            <div style={{ width: `${Math.max(4, (done / Math.max(total, 1)) * 100)}%` }} />
          </div>
          <p className="clean-help" role="status">
            {t(`Creating part ${Math.min(done + 1, total)} of ${total}… a long script takes a few minutes.`, `பகுதி ${Math.min(done + 1, total)} / ${total} உருவாகிறது… நீளமான எழுத்துக்கு சில நிமிடங்கள் ஆகும்.`)}
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="clean-result">
          <p className="clean-stat" role="status">
            {t(`Done · ${mins(result.secs)} of audio`, `முடிந்தது · ${mins(result.secs)} audio`)}
          </p>
          <audio controls preload="metadata" src={result.url} />
          <a className="btn-dark dl-btn" href={result.url} download={result.name}>
            <Ic.Download /> {bare(tr("⬇ Download MP3"))}
          </a>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ audio cleanup */

type CleanStage = "idle" | "reading" | "cleaning" | "done" | "error";

export function Cleanup() {
  const [file, setFile] = useState<File | null>(null);
  const [strength, setStrength] = useState<"light" | "normal" | "strong">("normal");
  const [louder, setLouder] = useState(true);
  const [stage, setStage] = useState<CleanStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ before: string; after: string; name: string; seconds: number; db: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (result) {
        URL.revokeObjectURL(result.before);
        URL.revokeObjectURL(result.after);
      }
    },
    [result],
  );

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setStage("idle");
    setResult(null);
  };

  const run = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress(0);
    setStage("reading");
    try {
      const { cleanAudio, wav48k } = await import("./cleanup");
      const r = await cleanAudio(file, { strength, louder }, (st, f) => {
        setStage(st);
        setProgress(f);
      });
      const base = file.name.replace(/\.[^.]+$/, "") || "audio";
      setResult({
        before: URL.createObjectURL(wav48k(r.original)),
        after: URL.createObjectURL(wav48k(r.cleaned)),
        name: `${base}-clean.wav`,
        seconds: r.seconds,
        db: r.noiseReducedDb,
      });
      setStage("done");
    } catch (e) {
      setError((e as Error).message || "Could not clean this file.");
      setStage("error");
    }
  };

  const busy = stage === "reading" || stage === "cleaning";
  const mins = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  return (
    <section id="cleanup" className="band">
      <div className="sec split">
        <div className="split-copy">
          <span className="eyebrow at">{tr("Audio cleanup")}</span>
          <h2>{tr("Clean up any recording.")}</h2>
          <p>
            {tr("Remove fan, traffic and crowd noise from voice notes, call recordings and videos. It runs in your browser, so your audio is never uploaded.")}
          </p>
          <ul className="ticks">
            <li>{tr("mp3, m4a, wav, ogg, opus, WhatsApp voice notes, mp4 and more")}</li>
            <li>{tr("Up to 20 minutes at a time")}</li>
            <li>{tr("Listen before and after, then download")}</li>
          </ul>
        </div>
        <div className="panel cleanup-panel">
          <div
            className={drag ? "drop on" : "drop"}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={input}
              type="file"
              accept="audio/*,video/*,.amr,.opus,.3gp,.m4a"
              hidden
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {file ? (
              <span className="drop-file">
                <b>{tr(file.name)}</b>
                <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
              </span>
            ) : (
              <span className="drop-hint">{tr("Drop an audio or video file here")}</span>
            )}
            <button className="btn-outline small" onClick={() => input.current?.click()} disabled={busy}>
              {file ? tr("Choose another") : tr("Choose file")}
            </button>
          </div>

          <div className="clean-opts">
            <div className="seg" role="radiogroup" aria-label={tr("Cleanup strength")}>
              {(["light", "normal", "strong"] as const).map((k) => (
                <button key={k} role="radio" aria-checked={strength === k} className={strength === k ? "on" : ""} onClick={() => setStrength(k)} disabled={busy}>
                  {tr(k[0].toUpperCase() + k.slice(1))}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={louder} onChange={(e) => setLouder(e.target.checked)} disabled={busy} />
              <span>{tr("Make voice louder")}</span>
            </label>
          </div>
          <p className="clean-help">
            {strength === "light"
              ? tr("Light keeps some room sound and removes most hiss.")
              : strength === "normal"
                ? tr("Normal removes most background noise. Best for most recordings.")
                : tr("Strong also quietens the gaps between words. Best for very noisy places.")}
          </p>

          <button className="btn-rec" onClick={() => void run()} disabled={!file || busy}>
            {busy ? (stage === "reading" ? tr("Reading file…") : t(`Cleaning… ${Math.round(progress * 100)}%`, `சுத்தம் செய்கிறது… ${Math.round(progress * 100)}%`)) : <><Ic.Sparkles /> {bare(tr("✨ Clean audio")).replace(/^✨\s*/u, "")}</>}
          </button>
          {busy && (
            <div className="clean-prog" aria-hidden="true">
              <div style={{ width: `${stage === "reading" ? 5 : Math.max(5, progress * 100)}%` }} />
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {result && (
            <div className="clean-result">
              <p className="clean-stat" role="status">
                {t(`Done · ${mins(result.seconds)} cleaned`, `முடிந்தது · ${mins(result.seconds)} சுத்தம் செய்யப்பட்டது`)}{result.db > 0 ? t(` · background noise ${result.db} dB quieter`, ` · பின்னணி சத்தம் ${result.db} dB குறைந்தது`) : ""}
              </p>
              <label className="ab">
                <span>{tr("Before")}</span>
                <audio controls preload="metadata" src={result.before} />
              </label>
              <label className="ab after">
                <span>{tr("After")}</span>
                <audio controls preload="metadata" src={result.after} />
              </label>
              <a className="btn-dark dl-btn" href={result.after} download={tr(result.name)}>
                <Ic.Download /> {bare(tr("⬇ Download clean audio (WAV)"))}
              </a>
              {file && /^video\//.test(file.type) && <small className="clean-note">{tr("For videos you get the cleaned sound as a WAV file.")}</small>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ voice cloning (own voice only) */
/*
 * 1. The visitor ticks "this is my own voice" and gets a random Tamil passage (signed by the engine).
 * 2. They read it aloud (8-30 s). The engine checks the words with our own speech-to-text, so a recording
 *    of someone else will not pass, and returns a signed voice print (256 numbers). Nothing is kept on the server.
 * 3. The print is kept only in this browser. Typing text then gives an MP3 in their voice (Tamil or English).
 */

const CLONE_KEY = "vtt.cloneVoice";
const CLONE_MAX = CLONE_MAX_CHARS;
const REC_MIN_S = 8;
const REC_MAX_S = 30;
type SavedVoice = { print: string; sig: string; created: number };
type ClonePhase = "start" | "recording" | "checking" | "ready";

function loadVoice(): SavedVoice | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLONE_KEY) || "null");
    return v && typeof v.print === "string" && typeof v.sig === "string" ? v : null;
  } catch {
    return null;
  }
}

/** 48 kHz mono -> 16 kHz 16-bit WAV (exact factor 3: average each group of three samples). */
function wav16k(x48: Float32Array): Blob {
  const n = Math.floor(x48.length / 3);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  s(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const a = (x48[3 * i] + x48[3 * i + 1] + x48[3 * i + 2]) / 3;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, a)) * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function apiError(r: Response): Promise<string> {
  if (r.status === 429) return t("Too many tries. Please wait a minute and try again.", "நிறைய முறை முயற்சி செய்தீர்கள். ஒரு நிமிடம் கழித்து மீண்டும் முயலுங்கள்.");
  try {
    const d = await r.json();
    if (typeof d.detail === "string") return tr(d.detail);
  } catch {
    /* not JSON */
  }
  return t("The voice engine is busy. Please try again in a minute.", "குரல் இயந்திரம் இப்போது பிஸியாக உள்ளது. ஒரு நிமிடம் கழித்து முயலுங்கள்.");
}

export function Clone() {
  const [voice, setVoice] = useState<SavedVoice | null>(() => loadVoice());
  const [phase, setPhase] = useState<ClonePhase>(() => (loadVoice() ? "ready" : "start"));
  const [consent, setConsent] = useState(false);
  const [passage, setPassage] = useState<{ text: string; token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [secs, setSecs] = useState(0);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ac: AudioContext; iv: number; parts: Blob[]; t0: number } | null>(null);
  const [text, setText] = useState("");
  const [making, setMaking] = useState(false);
  const [out, setOut] = useState<{ url: string; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.iv);
    r.stream.getTracks().forEach((tk) => tk.stop());
    void r.ac.close().catch(() => undefined);
  }, []);

  useEffect(
    () => () => {
      stopStream();
      abort.current?.abort();
    },
    [stopStream],
  );
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);

  const getPassage = async () => {
    setErr(null);
    try {
      const r = await fetch("/tts/clone/challenge", { method: "POST" });
      if (!r.ok) throw new Error(await apiError(r));
      setPassage(await r.json());
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t("Could not reach the voice engine. Check your internet and try again.", "குரல் இயந்திரத்தை அணுக முடியவில்லை. இணையத்தை சரிபார்த்து மீண்டும் முயலுங்கள்."));
    }
  };

  const enroll = async (blob: Blob, seconds: number) => {
    if (!passage) return;
    if (seconds < REC_MIN_S) {
      setPhase("start");
      setErr(t(`Please read the whole passage. We need at least ${REC_MIN_S} seconds.`, `முழு பத்தியையும் படியுங்கள். குறைந்தது ${REC_MIN_S} வினாடிகள் தேவை.`));
      return;
    }
    setPhase("checking");
    try {
      const { decodeMono48k } = await import("./cleanup");
      const wav = wav16k(await decodeMono48k(blob));
      const r = await fetch(`/tts/clone/enroll?consent=1&token=${encodeURIComponent(passage.token)}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
      if (!r.ok) {
        const raw = String((await r.clone().json().catch(() => ({}))).detail ?? "");
        if (/expired|not valid/i.test(raw)) setPassage(null);
        throw new Error(await apiError(r));
      }
      const d = await r.json();
      const v: SavedVoice = { print: d.print, sig: d.sig, created: Date.now() };
      try {
        localStorage.setItem(CLONE_KEY, JSON.stringify(v));
      } catch {
        /* private mode: keep it for this visit only */
      }
      setVoice(v);
      setPassage(null);
      setPhase("ready");
    } catch (e) {
      setPhase("start");
      setErr(e instanceof Error && e.message ? e.message : t("Something went wrong. Please record again.", "ஏதோ தவறு நடந்தது. மீண்டும் பதிவு செய்யுங்கள்."));
    }
  };

  const toggleRecord = async () => {
    if (phase === "recording") {
      rec.current?.mr.stop();
      return;
    }
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 128;
      ac.createMediaStreamSource(stream).connect(an);
      const parts: Blob[] = [];
      const mr = new MediaRecorder(stream);
      const t0 = performance.now();
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
      mr.onstop = () => {
        const seconds = (performance.now() - t0) / 1000;
        stopStream();
        rec.current = null;
        setLevels([]);
        void enroll(new Blob(parts, { type: mr.mimeType || "audio/webm" }), seconds);
      };
      const iv = window.setInterval(() => {
        const d = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(d);
        setLevels(Array.from({ length: 40 }, (_, i) => d[Math.floor((i * d.length * 0.6) / 40)] / 255));
        const s = (performance.now() - t0) / 1000;
        setSecs(s);
        if (s >= REC_MAX_S && mr.state === "recording") mr.stop();
      }, 70);
      rec.current = { mr, stream, ac, iv, parts, t0 };
      mr.start();
      setSecs(0);
      setPhase("recording");
    } catch {
      setErr(t("Microphone access was blocked. Allow it and try again.", "மைக் அனுமதி தடுக்கப்பட்டது. அனுமதித்து மீண்டும் முயலுங்கள்."));
    }
  };

  const speak = async () => {
    if (!voice || !text.trim()) return;
    if (making) {
      abort.current?.abort();
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setMaking(true);
    setErr(null);
    try {
      let r: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        r = await fetch("/tts/clone/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), lang: "auto", print: voice.print, sig: voice.sig }),
          signal: ctrl.signal,
        });
        if (r.status !== 429 && r.status < 500) break;
        await new Promise((ok) => setTimeout(ok, 4000 * (attempt + 1)));
      }
      if (r && !r.ok && /record your voice again/i.test(String((await r.clone().json().catch(() => ({}))).detail ?? ""))) forget();
      if (!r || !r.ok) throw new Error(r ? await apiError(r) : "");
      const url = URL.createObjectURL(await r.blob());
      setOut({ url, text: text.trim() });
      void new Audio(url).play().catch(() => undefined);
    } catch (e) {
      if (!ctrl.signal.aborted) setErr(e instanceof Error && e.message ? e.message : t("Could not make the audio. Please try again.", "ஆடியோ உருவாக்க முடியவில்லை. மீண்டும் முயலுங்கள்."));
    } finally {
      setMaking(false);
    }
  };

  const forget = () => {
    try {
      localStorage.removeItem(CLONE_KEY);
    } catch {
      /* ignore */
    }
    setVoice(null);
    setOut(null);
    setPhase("start");
  };

  const bars = Array.from({ length: 40 }, (_, i) =>
    phase === "recording" ? { h: Math.round(4 + (levels[i] ?? 0) * 68), on: true } : { h: 4, on: false },
  );
  const tanglish = passage ? tamilToTanglish(passage.text) : "";
  const panelState = phase === "recording" ? "recording" : phase === "ready" ? "ready" : "idle";

  return (
    <section id="clone" className="band">
      <div className="sec split">
        <div className="split-copy">
          <span className="eyebrow at">{tr("Voice cloning")}</span>
          <h2>{t("Speak in your own voice.", "உங்கள் சொந்த குரலில் பேசுங்கள்.")}</h2>
          <p>
            {t(
              "Read a short Tamil passage aloud. We check the words, make a voice print and keep it only in this browser. Then type anything in Tamil or English and get an MP3 in your voice.",
              "ஒரு சிறிய தமிழ் பத்தியை சத்தமாக படியுங்கள். வார்த்தைகளை சரிபார்த்து, உங்கள் குரல் அடையாளத்தை இந்த browser-ல் மட்டும் வைக்கிறோம். பிறகு தமிழிலோ ஆங்கிலத்திலோ எதை type செய்தாலும் உங்கள் குரலில் MP3 கிடைக்கும்.",
            )}
          </p>
          <p className="clone-rules">
            {t(
              "Your own voice only. The reading check stops copying a voice from someone else's recording. Your recording is not saved on our server.",
              "உங்கள் சொந்த குரல் மட்டும். வேறொருவரின் பதிவிலிருந்து குரலை நகலெடுக்க படிக்கும் சோதனை அனுமதிக்காது. உங்கள் பதிவு எங்கள் server-ல் சேமிக்கப்படாது.",
            )}
          </p>
        </div>

        <div className={`panel clone-${panelState}`}>
          {phase !== "ready" && (
            <>
              <label className="check clone-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={phase !== "start"} />
                <span>
                  {t(
                    "This is my own voice. I will not use it to copy or pretend to be anyone else.",
                    "இது என் சொந்த குரல். வேறொருவரைப் போல் நடிக்க இதைப் பயன்படுத்த மாட்டேன்.",
                  )}
                </span>
              </label>

              {!passage ? (
                <div className="clone-actions">
                  <button className="btn-rec" onClick={() => void getPassage()} disabled={!consent}>
                    {t("Get my reading passage", "படிக்க வேண்டிய பத்தியை காட்டு")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="clone-line">
                    <span className="eyebrow small">{t("Read this aloud, clearly", "இதை தெளிவாக சத்தமாக படியுங்கள்")}</span>
                    <span lang="ta">{passage.text}</span>
                    <small className="clone-tanglish">{tanglish}</small>
                  </div>
                  <div className="clone-bars" aria-hidden="true">
                    {bars.map((b, i) => (
                      <span key={i} style={{ height: b.h }} className={b.on ? "on" : ""} />
                    ))}
                  </div>
                  <div className="clone-prog" aria-hidden="true">
                    <div style={{ width: `${phase === "recording" ? Math.min(100, (secs / REC_MAX_S) * 100) : phase === "checking" ? 100 : 0}%` }} />
                  </div>
                  <div className="clone-status">
                    <span role="status">
                      <i className={`st-dot ${phase === "recording" ? "recording" : phase === "checking" ? "processing" : "idle"}`} aria-hidden="true" />
                      {phase === "recording"
                        ? t("Recording… read the passage", "பதிவு ஆகிறது… பத்தியை படியுங்கள்")
                        : phase === "checking"
                          ? t("Checking your reading and building your voice… about 30 seconds", "உங்கள் வாசிப்பை சரிபார்த்து குரலை உருவாக்குகிறோம்… சுமார் 30 வினாடி")
                          : t("Press record, read the passage, then press stop", "பதிவு அழுத்தி, பத்தியை படித்து, நிறுத்து அழுத்துங்கள்")}
                    </span>
                    <span className="mono">{phase === "recording" ? `0:${String(Math.floor(secs)).padStart(2, "0")} / 0:${REC_MAX_S}` : ""}</span>
                  </div>
                  <div className="clone-actions">
                    <button className={phase === "recording" ? "btn-rec on" : "btn-rec"} onClick={() => void toggleRecord()} disabled={phase === "checking" || !consent}>
                      {phase === "recording" ? <><Ic.Stop /> {t("Stop", "நிறுத்து")}</> : phase === "checking" ? <><Ic.Loader className="ico spin" /> {t("Checking…", "சரிபார்க்கிறது…")}</> : <><Ic.Record /> {t("Record", "பதிவு")}</>}
                    </button>
                    {phase === "start" && (
                      <button className="btn-outline" onClick={() => void getPassage()}>
                        {t("New passage", "வேறு பத்தி")}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {phase === "ready" && voice && (
            <>
              <div className="clone-status">
                <span role="status">
                  <i className="st-dot ready" aria-hidden="true" />
                  {t("Your voice is ready", "உங்கள் குரல் தயார்")}
                </span>
                <button className="link" onClick={forget}>
                  {t("Delete my voice", "என் குரலை நீக்கு")}
                </button>
              </div>
              <textarea
                className="clone-text"
                value={text}
                maxLength={CLONE_MAX}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("Type in Tamil or English…", "தமிழிலோ ஆங்கிலத்திலோ type செய்யுங்கள்…")}
                aria-label={t("Text to speak in your voice", "உங்கள் குரலில் பேச வேண்டிய text")}
                rows={4}
                disabled={making}
              />
              <div className="clone-status">
                <span className="mono small">
                  {text.length} / {CLONE_MAX}
                </span>
                {making && <span>{t("Making your audio… about 20-40 seconds", "உங்கள் ஆடியோ உருவாகிறது… சுமார் 20-40 வினாடி")}</span>}
              </div>
              <div className="clone-actions">
                <button className="btn-rec" onClick={() => void speak()} disabled={!making && !text.trim()}>
                  {making ? <><Ic.Loader className="ico spin" /> {t("Cancel", "ரத்து")}</> : <><Ic.Play /> {t("Speak in my voice", "என் குரலில் பேசு")}</>}
                </button>
              </div>
              {out && (
                <div className="clone-out">
                  <audio controls src={out.url} />
                  <a className="btn-outline" href={out.url} download="sansa-my-voice.mp3">
                    <Ic.Download /> {t("Download MP3", "MP3 பதிவிறக்கு")}
                  </a>
                </div>
              )}
              <span className="mono small">
                {t("AI voice. Use it for your own content only.", "AI குரல். உங்கள் சொந்த பயன்பாட்டிற்கு மட்டும்.")}
              </span>
            </>
          )}

          {err && (
            <p className="clone-err" role="alert">
              {err}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ voice changer */
/*
 * Any recording -> the same words in a SANSA voice, or in the visitor's own cloned voice (signed print from above).
 * There is no way to upload someone else's voice as the target. The file is decoded here, split at pauses into
 * parts of up to 25 s (the engine and Cloudflare's 100 s limit), and the parts are changed one by one. The engine
 * returns a signed print of the original speaker with the first part; later parts reuse it so all parts match.
 */

const CHANGE_MAX_S = 5 * 60;
const PART_MAX_S = 25;
const PART_MIN_S = 15;
type ChangeTarget = "female" | "male" | "me";

/** Split 48 kHz audio at the quietest 50 ms between PART_MIN_S and PART_MAX_S, so no word is cut. */
function splitAtPauses(x: Float32Array, rate = 48000): Float32Array[] {
  const parts: Float32Array[] = [];
  const win = Math.round(rate * 0.05);
  let a = 0;
  while (x.length - a > PART_MAX_S * rate) {
    let best = a + PART_MAX_S * rate;
    let bestE = Infinity;
    for (let s = a + PART_MIN_S * rate; s + win <= a + PART_MAX_S * rate; s += win) {
      let e = 0;
      for (let i = s; i < s + win; i++) e += x[i] * x[i];
      if (e < bestE) {
        bestE = e;
        best = s + Math.floor(win / 2);
      }
    }
    parts.push(x.subarray(a, best));
    a = best;
  }
  parts.push(x.subarray(a));
  return parts;
}

/** 48 kHz mono -> 24 kHz 16-bit WAV (keeps the voice bright; the converter works at 22 kHz). */
function wav24k(x48: Float32Array): Blob {
  const n = Math.floor(x48.length / 2);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const s = (o: number, tx: string) => [...tx].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  s(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const a = (x48[2 * i] + x48[2 * i + 1]) / 2;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, a)) * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export function VoiceChanger() {
  const [file, setFile] = useState<File | null>(null);
  const [to, setTo] = useState<ChangeTarget>("female");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<{ part: number; of: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<{ url: string; orig: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const own = loadVoice();

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(
    () => () => {
      if (out) {
        URL.revokeObjectURL(out.url);
        URL.revokeObjectURL(out.orig);
      }
    },
    [out],
  );

  const run = async () => {
    if (busy) {
      abort.current?.abort();
      return;
    }
    if (!file || !consent) return;
    if (to === "me" && !own) {
      setErr(t("Make your own voice first in Voice Cloning above.", "முதலில் மேலே உள்ள Voice Cloning-ல் உங்கள் குரலை உருவாக்குங்கள்."));
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setErr(null);
    setOut(null);
    try {
      const { decodeMono48k } = await import("./cleanup");
      const x = await decodeMono48k(file);
      if (x.length / 48000 > CHANGE_MAX_S) {
        throw new Error(t("Please choose a recording of 5 minutes or less.", "5 நிமிடம் அல்லது அதற்குக் குறைவான பதிவைத் தேர்ந்தெடுங்கள்."));
      }
      if (x.length / 48000 < 1) throw new Error(t("This recording is too short.", "இந்தப் பதிவு மிகவும் சிறியது."));
      const parts = splitAtPauses(x);
      const mp3s: Blob[] = [];
      let source = "";
      for (let i = 0; i < parts.length; i++) {
        setBusy({ part: i + 1, of: parts.length });
        const headers: Record<string, string> = { "Content-Type": "audio/wav" };
        if (to === "me" && own) {
          headers["X-Print"] = own.print;
          headers["X-Sig"] = own.sig;
        }
        if (source) headers["X-Source"] = source;
        let r: Response | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          r = await fetch(`/tts/change?consent=1&lang=ta&to=${to}`, { method: "POST", headers, body: wav24k(parts[i]), signal: ctrl.signal });
          if (r.status !== 429 && r.status < 500) break;
          await new Promise((ok) => setTimeout(ok, 5000 * (attempt + 1)));
        }
        if (!r || !r.ok) {
          // a silent part (music, pause) is skipped only when it is not the first one with speech
          const raw = r ? String((await r.clone().json().catch(() => ({}))).detail ?? "") : "";
          if (r && r.status === 400 && /silent|enough speech/i.test(raw) && parts.length > 1) {
            const { wav48k } = await import("./cleanup");
            mp3s.push(wav48k(new Float32Array(parts[i].length)));
            continue;
          }
          if (r && /record your voice again/i.test(raw)) throw new Error(tr(raw));
          throw new Error(r ? await apiError(r) : "");
        }
        source = source || r.headers.get("X-Source") || "";
        mp3s.push(await r.blob());
      }
      const blob = mp3s.every((b) => b.type === "audio/mpeg") ? new Blob(mp3s, { type: "audio/mpeg" }) : await joinAudio(mp3s);
      setOut({ url: URL.createObjectURL(blob), orig: URL.createObjectURL(file) });
    } catch (e) {
      if (!ctrl.signal.aborted)
        setErr(e instanceof Error && e.message ? e.message : t("Could not change this recording. Please try again.", "இந்தப் பதிவை மாற்ற முடியவில்லை. மீண்டும் முயலுங்கள்."));
    } finally {
      setBusy(null);
    }
  };

  const choices: [ChangeTarget, string, string][] = [
    ["female", "SANSA female", "SANSA பெண் குரல்"],
    ["male", "SANSA male", "SANSA ஆண் குரல்"],
    ["me", "My own voice", "என் சொந்த குரல்"],
  ];

  return (
    <section id="changer" className="sec">
      <div className="split">
        <div className="split-copy">
          <span className="eyebrow at">{tr("Voice Changer")}</span>
          <h2>{t("Same words, a new voice.", "அதே வார்த்தைகள், புதிய குரல்.")}</h2>
          <p>
            {t(
              "Upload a recording (up to 5 minutes). We keep your words, timing and feeling, and change only the voice: to a SANSA voice, or to your own cloned voice.",
              "ஒரு பதிவை upload செய்யுங்கள் (5 நிமிடம் வரை). வார்த்தைகள், வேகம், உணர்வு அப்படியே இருக்கும்; குரல் மட்டும் மாறும்: SANSA குரலாக, அல்லது உங்கள் clone குரலாக.",
            )}
          </p>
          <p className="clone-rules">
            {t(
              "You can only change to a SANSA voice or your own voice, never to someone else's. Your recording is not saved on our server.",
              "SANSA குரலாகவோ உங்கள் சொந்த குரலாகவோ மட்டுமே மாற்ற முடியும், வேறொருவரின் குரலாக அல்ல. உங்கள் பதிவு எங்கள் server-ல் சேமிக்கப்படாது.",
            )}
          </p>
        </div>

        <div className="panel">
          <label className="btn-outline changer-file">
            <Ic.Upload /> {file ? file.name : t("Choose a recording", "பதிவைத் தேர்ந்தெடு")}
            <input
              type="file"
              accept="audio/*,video/*,.opus,.ogg,.m4a,.mp3,.wav,.aac,.mp4"
              hidden
              disabled={!!busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setOut(null);
                setErr(null);
              }}
            />
          </label>

          <div className="changer-voices" role="radiogroup" aria-label={t("New voice", "புதிய குரல்")}>
            {choices.map(([k, en, ta]) => (
              <button
                key={k}
                role="radio"
                aria-checked={to === k}
                className={to === k ? "chip on" : "chip"}
                onClick={() => setTo(k)}
                disabled={!!busy || (k === "me" && !own)}
                title={k === "me" && !own ? t("Make your voice in Voice Cloning first", "முதலில் Voice Cloning-ல் உங்கள் குரலை உருவாக்குங்கள்") : undefined}
              >
                {t(en, ta)}
              </button>
            ))}
          </div>

          <label className="check clone-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!!busy} />
            <span>
              {t(
                "I have the right to use this recording, and I will not use the result to mislead anyone.",
                "இந்தப் பதிவைப் பயன்படுத்த எனக்கு உரிமை உண்டு. இதை வைத்து யாரையும் ஏமாற்ற மாட்டேன்.",
              )}
            </span>
          </label>

          <div className="clone-actions">
            <button className="btn-rec" onClick={() => void run()} disabled={!busy && (!file || !consent)}>
              {busy ? <><Ic.Loader className="ico spin" /> {t("Cancel", "ரத்து")}</> : <><Ic.Wand /> {t("Change the voice", "குரலை மாற்று")}</>}
            </button>
          </div>

          {busy && (
            <>
              <div className="clone-prog" aria-hidden="true">
                <div style={{ width: `${Math.round(((busy.part - 1) / busy.of) * 100)}%` }} />
              </div>
              <span role="status" className="small">
                {t(`Changing part ${busy.part} of ${busy.of}… about 20 seconds each`, `பகுதி ${busy.part} / ${busy.of} மாறுகிறது… ஒவ்வொன்றுக்கும் சுமார் 20 வினாடி`)}
              </span>
            </>
          )}

          {out && (
            <div className="changer-out">
              <span className="eyebrow small">{t("Before", "முன்")}</span>
              <audio controls src={out.orig} />
              <span className="eyebrow small">{t("After", "பின்")}</span>
              <audio controls src={out.url} />
              <a className="btn-outline" href={out.url} download="sansa-voice-changer.mp3">
                <Ic.Download /> {t("Download MP3", "MP3 பதிவிறக்கு")}
              </a>
            </div>
          )}

          <span className="mono small">{t("AI voice. Tell your listeners when a voice is AI.", "AI குரல். கேட்பவர்களுக்கு இது AI குரல் என்று சொல்லுங்கள்.")}</span>

          {err && (
            <p className="clone-err" role="alert">
              {err}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Join MP3 parts and silent WAV gaps into one WAV (only used when a silent part was skipped). */
async function joinAudio(parts: Blob[]): Promise<Blob> {
  const { decodeMono48k, wav48k } = await import("./cleanup");
  const pcm = await Promise.all(parts.map((p) => decodeMono48k(p)));
  const all = new Float32Array(pcm.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of pcm) {
    all.set(p, o);
    o += p.length;
  }
  return wav48k(all);
}

/* ------------------------------------------------------------------ voice agents */

const CHAT = [
  ["Hi, I want to book an appointment for tomorrow.", "r"],
  ["Sure. Morning or evening works better for you?", "l"],
  ["Evening, after 5 if possible.", "r"],
  ["You’re booked for 5:30 PM tomorrow. I’ve sent the details by SMS.", "l"],
] as const;

export function Agents() {
  const h = useHome();
  return (
    <section id="agents" className="sec split">
      <div className="split-copy">
        <span className="eyebrow at">{tr("Voice agents")}</span>
        <h2>{tr("Ask SANSA anything, by voice.")}</h2>
        <p>{tr("Talk to the SANSA agent in Tamil or English about our tools. Phone call agents are coming soon.")}</p>
        <button className="btn-dark self-start" onClick={h.openAgent}>
          {tr("Try the live agent")}
        </button>
      </div>
      <div className="panel">
        <div className="call-head">
          <span>
            <i className="st-dot idle" aria-hidden="true" />
            {tr("Sample call · Clinic booking")}
          </span>
          <span className="mono">01:24</span>
        </div>
        {CHAT.map(([t, a]) => (
          <div key={t} className={a === "r" ? "bubble-row r" : "bubble-row"}>
            <div className="bubble">{tr(t)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ developer API */

const CODE: Record<string, string> = {
  curl: `curl -X POST https://api.sansaai.in/v1/text-to-speech \\
  -H "Authorization: Bearer $SANSA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Welcome to SANSA.",
    "voice_id": "kavya",
    "language": "en"
  }' \\
  --output welcome.mp3`,
  python: `from sansa import Sansa

client = Sansa(api_key="SANSA_API_KEY")

audio = client.text_to_speech.create(
    text="Welcome to SANSA.",
    voice_id="kavya",
    language="en",
)
audio.save("welcome.mp3")`,
  node: `import { Sansa } from "sansa";

const client = new Sansa({ apiKey: process.env.SANSA_API_KEY });

const audio = await client.textToSpeech.create({
  text: "Welcome to SANSA.",
  voiceId: "kavya",
  language: "en",
});
await audio.save("welcome.mp3");`,
};

export function Api() {
  const [tab, setTab] = useState("curl");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(CODE[tab])
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };
  return (
    <section id="api" className="band">
      <div className="sec split">
        <div className="split-copy">
          <span className="eyebrow at">{tr("Developers")}</span>
          <h2>{tr("A developer API is coming soon.")}</h2>
          <p>{tr("Speech to text and text to speech for your own app. Ask for early access on the contact page.")}</p>
          <a className="btn-dark self-start" href="./contact">
            {tr("Ask for early access")}
          </a>
        </div>
        <div className="code-box">
          <div className="code-tabs">
            {Object.keys(CODE).map((k) => (
              <button
                key={k}
                className={tab === k ? "on" : ""}
                onClick={() => {
                  setTab(k);
                  setCopied(false);
                }}
              >
                {k}
              </button>
            ))}
            <button className="code-copy" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre>{CODE[tab]}</pre>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ FAQ, CTA, footer */

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="sec faq2" aria-labelledby="faq">
      <div className="faq-head">
        <span className="eyebrow at">{tr("FAQ")}</span>
        <h2 id="faq">{tr("Frequently asked questions")}</h2>
      </div>
      <div className="faq-list">
      {items.map((f, i) => (
        <details key={tr(f.q)} open={i === 0}>
          <summary>
            <span>{tr(f.q)}</span>
            <span className="plus" aria-hidden="true">
              +
            </span>
          </summary>
          <p>{tr(f.a)}</p>
        </details>
      ))}
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="cta-wrap">
      <div className="cta">
        <h2>{tr("Give your words a voice.")}</h2>
        <a href="#voices">{tr("Start free")}</a>
      </div>
    </section>
  );
}

function Col({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="foot-col">
      <span className="eyebrow">{title}</span>
      {children}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot-in">
        <div className="foot-grid">
          <div className="foot-col">
            <span className="site-brand">
              <OrbMark size={24} />
              SANSA
            </span>
            <span className="foot-tag">{tr("AI voices for English and Tamil.")}</span>
          </div>
          <Col title={tr("Products")}>
            <a href="#app">{tr("Speech to Text")}</a>
            <a href="#voices">{tr("Text to Speech")}</a>
            <a href="#cleanup">{tr("Audio Cleanup")}</a>
            <a href="#clone">{tr("Voice Cloning")}</a>
            <a href="#agents">{tr("Voice Agents")}</a>
          </Col>
          <Col title={tr("Developers")}>
            <a href="#api">{tr("API")}</a>
          </Col>
          <Col title={tr("Support")}>
            <a href={CONTACT}>{tr("Help Centre")}</a>
            <a href="#faq">{tr("FAQ")}</a>
            <button className="link auth-btn foot-login" onClick={() => askLogin()}>{t("Sign in", "உள்நுழை")}</button>
          </Col>
          <Col title={tr("Company")}>
            <a href="./about">{tr("About")}</a>
            <a href="./privacy">{tr("Privacy")}</a>
            <a href="./terms">{tr("Terms of Use")}</a>
            <a href="./refund">{tr("Refund")}</a>
          </Col>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} SANSA AI. {tr("All rights reserved.")}</span>
          <div className="foot-social">
            <a href="https://www.instagram.com/sansaai.in">Instagram</a>
            <a href="https://x.com/sansa06in">X</a>
            <a href="https://www.linkedin.com/in/sansa-ai-a61436420">LinkedIn</a>
            <a href="https://www.facebook.com/share/1HLHYbNaVE/">Facebook</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ live agent overlay */

function AgentOverlay({ onClose }: { onClose: () => void }) {
  const h = useHome();
  const greet =
    h.lang === "ta"
      ? "வணக்கம்! நான் SANSA voice agent. உங்களுக்கு என்ன உதவி வேண்டும்?"
      : "Hi, I'm the SANSA voice agent. Ask me about our tools or voices.";
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: greet }]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<AgentState>("idle");
  const stateRef = useRef<AgentState>("idle");
  stateRef.current = state;
  const handsFree = useRef(false);
  const recRef = useRef<RecLike | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const SR = recognitionCtor();

  const set = (s: AgentState) => {
    stateRef.current = s;
    setState(s);
    orb.busy = s === "speaking";
    orb.listening = s === "listening";
  };

  const listenRef = useRef<() => void>(() => {});

  const say = useCallback(
    async (text: string) => {
      if (!alive.current) return;
      set("speaking");
      await h.speakWait(text);
      if (!alive.current) return;
      set("idle");
      if (handsFree.current) setTimeout(() => listenRef.current(), 250);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h.speakWait],
  );

  const [suggest, setSuggest] = useState<string[]>(["What can SANSA do?", "Is it free?", "Start voice to text"]);

  const act = useCallback(
    async (r: Reply) => {
      const a = r.action;
      if (!a) return say(r.text);
      if (a.type === "say") return say(a.text);
      if (a.type === "play") {
        handsFree.current = false;
        const v = VOICES.find((x) => x.id === a.voice);
        set("idle");
        if (v) await h.play(v.id, voiceSample(v), v);
        return;
      }
      if (a.type === "theme") {
        h.toggleTheme();
        return say(r.text);
      }
      // dictate / goto / page: say it, then do it
      handsFree.current = false;
      await say(r.text);
      if (!alive.current) return;
      if (a.type === "dictate") h.startDictation();
      else if (a.type === "goto") {
        onClose();
        h.goTo(a.id);
      } else if (a.type === "page") window.location.href = a.url;
    },
    [h, onClose, say],
  );

  const send = useCallback(
    (raw: string, fromVoice = false) => {
      const text = raw.trim();
      if (!text || stateRef.current === "thinking") return;
      if (!fromVoice) handsFree.current = false;
      setMsgs((m) => [...m, { role: "user", content: text }]);
      setInput("");
      set("thinking");
      const r = think(text);
      window.setTimeout(() => {
        if (!alive.current) return;
        setMsgs((m) => [...m, { role: "assistant", content: r.text }]);
        if (r.suggestions.length) setSuggest(r.suggestions);
        void act(r);
      }, 350);
    },
    [act],
  );

  const listen = useCallback(() => {
    if (!SR) {
      setMsgs((m) => [...m, { role: "assistant", content: "Voice input is not available in this browser. Type your question instead, or use Chrome." }]);
      return;
    }
    h.stopPlaying();
    const rec = new SR();
    recRef.current = rec;
    rec.lang = h.lang === "ta" ? "ta-IN" : "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      finalText = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(" ");
      setInput(finalText);
    };
    rec.onend = () => {
      if (stateRef.current === "listening") set("idle");
      if (finalText.trim()) send(finalText, true);
      else handsFree.current = false;
    };
    rec.onerror = () => {
      handsFree.current = false;
      set("idle");
    };
    try {
      rec.start();
      handsFree.current = true;
      setInput("");
      set("listening");
    } catch {
      /* already running */
    }
  }, [SR, h, send]);
  listenRef.current = listen;

  useEffect(() => {
    alive.current = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
    const t = window.setTimeout(() => void say(greet), 350);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive.current = false;
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      handsFree.current = false;
      recRef.current?.abort();
      h.stopPlaying();
      orb.busy = false;
      orb.listening = false;
    };
    // run once when the overlay opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = chatRef.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [msgs]);

  const mic = () => {
    if (state === "listening") {
      handsFree.current = false;
      recRef.current?.stop();
      return;
    }
    listen();
  };
  const label = tr({ idle: "Agent ready", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking" }[state]);

  return (
    <div className="agent" role="dialog" aria-label={tr("SANSA voice agent")}>
      <div className="agent-status">
        <i className={`st-dot ${state}`} aria-hidden="true" />
        {label}
      </div>
      <button className="agent-close" onClick={onClose} aria-label={tr("Close agent")}>
        <Ic.X size={20} />
      </button>
      <div className="agent-chat" ref={chatRef} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "bubble-row r" : "bubble-row"}>
            <div className="bubble">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="agent-bar">
        <button
          className={state === "listening" ? "agent-mic on" : "agent-mic"}
          onClick={mic}
          aria-label={state === "listening" ? "Stop listening" : "Speak"}
        >
          {state === "listening" ? <Ic.Stop size={18} /> : <Ic.Mic size={20} />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder={tr("Ask about SANSA, or tap the mic and speak")}
          aria-label={tr("Message")}
        />
        <button className="btn-amber small" onClick={() => send(input)}>
          {tr("Send")}
        </button>
      </div>
      <div className="agent-suggest">
        {suggest.map((s) => (
          <button key={s} onClick={() => send(s)}>
            {s}
          </button>
        ))}
        <div className="seg" role="radiogroup" aria-label={tr("Agent language")}>
          {(["en", "ta"] as const).map((l) => (
            <button key={l} role="radio" aria-checked={h.lang === l} className={h.lang === l ? "on" : ""} onClick={() => h.setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ⌘K palette */

function Palette({ onClose }: { onClose: () => void }) {
  const h = useHome();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const page = (url: string) => () => {
    window.location.href = url;
  };
  const all: [string, string, () => void][] = [
    ["Talk to the SANSA agent", "Action", h.openAgent],
    ["Start voice to text", "Action", h.startDictation],
    ["Switch light / dark", "Setting", h.toggleTheme],
    ["Products", "Section", () => h.goTo("tools")],
    ["Voice to text", "Section", () => h.goTo("app")],
    ["Voice library", "Section", () => h.goTo("voices")],
    ["Clean up audio (remove noise)", "Section", () => h.goTo("cleanup")],
    ["Clone your voice", "Section", () => h.goTo("clone")],
    ["Voice agents", "Section", () => h.goTo("agents")],
    ["Developer API", "Section", () => h.goTo("api")],
    ["FAQ", "Section", () => h.goTo("faq")],
    ["Sign in with Google", "Page", () => askLogin()],
    ["About", "Page", page("./about")],
    ["Contact", "Page", page(CONTACT)],
    ["Privacy", "Page", page("./privacy")],
    ...VOICES.map(
      (v): [string, string, () => void] => [
        `Play voice: ${tr(v.name)}`,
        "Voice",
        () => void h.play(v.id, voiceSample(v), v),
      ],
    ),
  ];
  const term = q.trim().toLowerCase();
  const items = all.filter(([l, g]) => !term || `${l} ${g}`.toLowerCase().includes(term));
  const run = (i: number) => {
    const it = items[i];
    if (!it) return;
    onClose();
    setTimeout(it[2], 60);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(sel);
    } else if (e.key === "Escape") onClose();
  };

  return (
    <div className="pal-back" onClick={onClose}>
      <div className="pal" role="dialog" aria-label={tr("Search")} onClick={(e) => e.stopPropagation()}>
        <div className="pal-head">
          <Ic.Search size={18} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKey}
            placeholder={tr("Search pages, voices and actions")}
            aria-label={tr("Search")}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="pal-list" role="listbox">
          {items.map(([l, g], i) => (
            <button key={l} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""} onClick={() => run(i)} onMouseEnter={() => setSel(i)}>
              <span>{l}</span>
              <small>{g}</small>
            </button>
          ))}
          {!items.length && <div className="pal-empty">{tr("No results")}</div>}
        </div>
      </div>
    </div>
  );
}
