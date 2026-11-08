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
  type ReactNode,
} from "react";
import { readAloudSupported, voiceFor, voicesReady } from "./readAloud";
import { think, type Reply } from "./agentBrain";
import { setUi, t, tr, useUi } from "./i18n";

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

const SAMPLE: Record<Lang, string> = {
  en: "Welcome to SANSA. Type anything here and hear it come alive.",
  ta: "வணக்கம்! SANSA-வுக்கு உங்களை வரவேற்கிறோம்.",
};

const LOGIN = "https://app.sansaai.in/login";
const SIGNUP = "https://app.sansaai.in/register";
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

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

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
          <a href="#voices">{tr("Text to Speech")}</a>
          <a href="#voices">{tr("Voices")}</a>
          <a href="#api">{tr("API")}</a>
        </div>
        <button className="search-btn" onClick={h.openPal} aria-label={tr("Search")}>
          <SearchIcon />
          <span className="search-word">{tr("Search")}</span>
          <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <a className="nav-login" href={LOGIN}>
          {tr("Log in")}
        </a>
        <a className="btn-dark" href={SIGNUP}>
          {tr("Sign up")}
        </a>
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
          {h.theme === "dark" ? "☀" : "☾"}
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
          <a href="#voices" onClick={close}>
            {tr("Voices")}
          </a>
          <a href="#api" onClick={close}>
            {tr("API")}
          </a>
          <a href="#faq" onClick={close}>
            {tr("FAQ")}
          </a>
          <div className="mobile-menu-actions">
            <a className="btn-outline" href={LOGIN}>
              {tr("Log in")}
            </a>
            <a className="btn-dark" href={SIGNUP}>
              {tr("Sign up")}
            </a>
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
  const label = h.loadingId === "hero" ? tr("… Creating") : h.playing === "hero" ? tr("■ Stop") : tr("▶ Speak");

  return (
    <section className="hero2">
      <div className="hero2-copy fade-ui">
        <span className="eyebrow">{tr("AI Voice Platform")}</span>
        <h1>{tr("Lifelike AI voices in English and Tamil.")}</h1>
        <p className="hero2-sub">{tr("Text to speech, speech to text and noise cleanup in Tamil and English. Free, no sign up needed.")}</p>
      </div>
      <Orb />
      <div className="hero2-bar-wrap fade-ui">
        <div className="hero2-bar">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={tr("Text to hear")}
            maxLength={500}
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
                {tr("⬇ Download mp3")}
              </a>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ products */

const PRODUCTS: { name: string; desc: string; href?: string; soon?: boolean }[] = [
  { name: "Text to Speech", desc: "Natural voiceovers from any script.", href: "#voices" },
  { name: "Speech to Text", desc: "Accurate transcripts and subtitles.", href: "#app" },
  { name: "Voice Cloning", desc: "Your own voice from a short sample.", href: "#clone", soon: true },
  { name: "Dubbing", desc: "Translate video and keep every voice.", soon: true },
  { name: "Voice Changer", desc: "Turn one recording into any voice.", soon: true },
  { name: "Sound Effects", desc: "Generate sound from a text prompt.", soon: true },
  { name: "Voice Agents", desc: "Assistants for calls and support.", href: "#agents" },
  { name: "Audio Cleanup", desc: "Remove noise and isolate clear speech.", href: "#cleanup" },
];

export function Products() {
  return (
    <section id="tools" className="sec">
      <div className="sec-head">
        <span className="eyebrow at">{tr("Products")}</span>
        <h2>{tr("Everything you need to create with voice.")}</h2>
      </div>
      <div className="prod-grid">
        {PRODUCTS.map((p, i) => {
          const body = (
            <>
              <span className="prod-orb" style={{ background: SW[i % SW.length] }} aria-hidden="true" />
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
        <a className="at-link" href="#voices">
          {tr("Browse all voices →")}
        </a>
      </div>
      <div className="filters" role="radiogroup" aria-label={tr("Voice language")}>
        {FILTERS.map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
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
                onClick={() => void h.play(v.id, voiceSample(v), v).then(setNote)}
              >
                {busy ? "…" : on ? "■" : "▶"}
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

const LONG_MAX = 10000;
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
        <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={busy} aria-label={tr("Voice")}>
          {VOICES.map((x) => (
            <option key={x.id} value={x.id}>
              {tr(x.name)} · {tr(x.desc)}
            </option>
          ))}
        </select>
        <button className="btn-rec" onClick={() => void run()} disabled={!busy && !text.trim()}>
          {busy ? tr("■ Stop") : tr("Create MP3")}
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
            {tr("⬇ Download MP3")}
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
            {busy ? (stage === "reading" ? tr("Reading file…") : t(`Cleaning… ${Math.round(progress * 100)}%`, `சுத்தம் செய்கிறது… ${Math.round(progress * 100)}%`)) : tr("✨ Clean audio")}
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
                {tr("⬇ Download clean audio (WAV)")}
              </a>
              {file && /^video\//.test(file.type) && <small className="clean-note">{tr("For videos you get the cleaned sound as a WAV file.")}</small>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ voice cloning sample recorder */

type CloneState = "idle" | "recording" | "processing" | "ready" | "error";

export function Clone() {
  const [st, setSt] = useState<CloneState>("idle");
  const [levels, setLevels] = useState<number[]>([]);
  const [secs, setSecs] = useState(0);
  const url = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ac: AudioContext; iv: number } | null>(null);
  const [playingBack, setPlayingBack] = useState(false);
  const [prog, setProg] = useState(0);
  const procIv = useRef(0);

  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    clearInterval(r.iv);
    try {
      if (r.mr.state !== "inactive") r.mr.stop();
    } catch {
      /* already stopped */
    }
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ac.close().catch(() => {});
  }, []);

  useEffect(
    () => () => {
      stop();
      clearInterval(procIv.current);
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [stop],
  );

  const start = async () => {
    if (st === "recording") return stop();
    if (st === "processing") return;
    audio.current?.pause();
    setPlayingBack(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 128;
      ac.createMediaStreamSource(stream).connect(an);
      const parts: Blob[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
      mr.onstop = () => {
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(new Blob(parts, { type: mr.mimeType || "audio/webm" }));
        setLevels([]);
        setSt("processing");
        setProg(0);
        const t1 = performance.now();
        const piv = window.setInterval(() => {
          const p = Math.min(100, ((performance.now() - t1) / 2000) * 100);
          setProg(p);
          if (p >= 100) {
            clearInterval(piv);
            setSt("ready");
          }
        }, 60);
        procIv.current = piv;
      };
      const t0 = performance.now();
      const iv = window.setInterval(() => {
        const d = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(d);
        setLevels(Array.from({ length: 40 }, (_, i) => d[Math.floor((i * d.length * 0.6) / 40)] / 255));
        const t = (performance.now() - t0) / 1000;
        setSecs(t);
        if (t >= 10) stop();
      }, 70);
      rec.current = { mr, stream, ac, iv };
      mr.start();
      setSecs(0);
      setSt("recording");
    } catch {
      setSt("error");
    }
  };

  const playBack = () => {
    if (!url.current) return;
    if (playingBack) {
      audio.current?.pause();
      setPlayingBack(false);
      return;
    }
    audio.current?.pause();
    const a = new Audio(url.current);
    audio.current = a;
    a.onended = () => setPlayingBack(false);
    void a.play().then(() => setPlayingBack(true)).catch(() => setPlayingBack(false));
  };

  const bars = Array.from({ length: 40 }, (_, i) => {
    if (st === "recording") return { h: Math.round(4 + (levels[i] ?? 0) * 68), on: true };
    if (st === "ready") return { h: Math.round(8 + 50 * Math.abs(Math.sin(i * 0.6) * Math.cos(i * 0.21))), on: true };
    return { h: 4, on: false };
  });
  const status = {
    idle: tr("Ready when you are"),
    recording: tr("Recording… speak now"),
    processing: tr("Building your voice…"),
    ready: tr("Your voice preview is ready"),
    error: tr("Microphone access was blocked. Allow it and try again."),
  }[st];
  const btn = { idle: tr("● Start recording"), recording: tr("■ Stop recording"), processing: tr("Processing…"), ready: tr("↺ Record again"), error: tr("● Try again") }[st];

  return (
    <section id="clone" className="band">
      <div className="sec split">
        <div className="split-copy">
          <span className="eyebrow at">{tr("Voice cloning")}</span>
          <h2>{tr("Your own voice, coming soon.")}</h2>
          <p>{tr("Read the line out loud to record a short sample and hear it back. Speaking in your own voice is coming soon.")}</p>
        </div>
        <div className={`panel clone-${st}`}>
          <div className="clone-line">
            <span className="eyebrow small">{tr("Read aloud")}</span>
            <span>{tr("“Hi, this is my voice. I’m creating my own AI voice with SANSA.”")}</span>
          </div>
          <div className="clone-bars" aria-hidden="true">
            {bars.map((b, i) => (
              <span key={i} style={{ height: b.h }} className={b.on ? "on" : ""} />
            ))}
          </div>
          <div className="clone-prog" aria-hidden="true">
            <div style={{ width: `${st === "recording" ? Math.min(100, secs * 10) : st === "processing" ? prog : st === "ready" ? 100 : 0}%` }} />
          </div>
          <div className="clone-status">
            <span role="status">
              <i className={`st-dot ${st}`} aria-hidden="true" />
              {status}
            </span>
            <span className="mono">{st === "recording" ? `0:${String(Math.floor(secs)).padStart(2, "0")} / 0:10` : ""}</span>
          </div>
          <div className="clone-actions">
            <button className={st === "recording" ? "btn-rec on" : "btn-rec"} onClick={() => void start()}>
              {btn}
            </button>
            {st === "ready" && (
              <button className="btn-outline" onClick={playBack}>
                {playingBack ? tr("■ Stop") : tr("▶ Play your voice")}
              </button>
            )}
          </div>
          <span className="mono small">{tr("Preview only. Your recording stays in this browser.")}</span>
        </div>
      </div>
    </section>
  );
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
        <a href={SIGNUP}>{tr("Start free")}</a>
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
            <a href="#voices">{tr("Text to Speech")}</a>
            <a href="#voices">{tr("Voice Library")}</a>
            <a href="#cleanup">{tr("Audio Cleanup")}</a>
            <a href="#clone">{tr("Voice Cloning")}</a>
            <a href="#agents">{tr("Voice Agents")}</a>
          </Col>
          <Col title={tr("Developers")}>
            <a href="#api">{tr("API")}</a>
            <a href="#api">{tr("SDKs")}</a>
          </Col>
          <Col title={tr("Support")}>
            <a href={CONTACT}>{tr("Help Centre")}</a>
            <a href="#faq">{tr("FAQ")}</a>
            <a href={LOGIN}>{tr("Log in")}</a>
          </Col>
          <Col title={tr("Company")}>
            <a href="./about">{tr("About")}</a>
            <a href="./about">{tr("Careers")}</a>
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
        ✕
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
          {state === "listening" ? "■" : "🎙"}
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
    ["Log in", "Page", page(LOGIN)],
    ["Create a free account", "Page", page(SIGNUP)],
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
          <span aria-hidden="true">⌕</span>
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
