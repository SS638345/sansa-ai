/**
 * SANSA home page (Claude Design "SANSA Home", 2026-11-08).
 * Header with ⌘K search, 3D orb hero, products, voices, voice cloning sample, live agent,
 * developer API, FAQ, CTA and footer. Everything on the page works today; features that are
 * not live yet are labelled "Coming soon" instead of being faked.
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

type Voice = { id: string; name: string; desc: string; tag: string; pitch: number; rate: number; swatch: string };

const VOICES: Voice[] = (
  [
    ["kavya", "Kavya", "Warm · Narration", "Narration", 1.1, 0.95],
    ["arjun", "Arjun", "Deep · Advertising", "Advertising", 0.7, 0.95],
    ["meera", "Meera", "Bright · Explainers", "Conversational", 1.25, 1.05],
    ["vikram", "Vikram", "Calm · Audiobooks", "Narration", 0.85, 0.9],
    ["anika", "Anika", "Friendly · Support", "Conversational", 1.15, 1],
    ["dev", "Dev", "Energetic · Promos", "Advertising", 1, 1.15],
    ["leela", "Leela", "Playful · Characters", "Characters", 1.5, 1.05],
    ["raghav", "Raghav", "Gravelly · Characters", "Characters", 0.5, 0.85],
  ] as const
).map(([id, name, desc, tag, pitch, rate], i) => ({ id, name, desc, tag, pitch, rate, swatch: SW[i] }));

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

/* ------------------------------------------------------------------ agent brain (answers from what SANSA really offers) */

type Msg = { role: "user" | "assistant"; content: string };
type AgentState = "idle" | "listening" | "thinking" | "speaking";

const KB: { k: RegExp; en: string; ta: string; go?: string }[] = [
  {
    k: /\b(hi|hello|hey|vanakkam)\b|வணக்கம்/i,
    en: "Hello! I can tell you about SANSA, or start voice to text for you. What would you like to know?",
    ta: "வணக்கம்! SANSA பற்றி கேளுங்க, இல்லனா voice to text start பண்ணி தர்றேன்.",
  },
  {
    k: /start|open|try|dictat|voice to text|speech to text|transcri|ஆரம்பி|தொடங்கு|எழுத்தா/i,
    en: "Sure. I'm opening voice to text now. Tap the mic and speak, and your words will appear as text.",
    ta: "சரி. Voice to text-ஐ திறக்கிறேன். Mic-ஐ தொட்டு பேசுங்க, எழுத்தா வந்துடும்.",
    go: "app",
  },
  {
    k: /free|price|pric|cost|pay|plan|money|charge|விலை|இலவச|காசு|பணம்/i,
    en: "Voice to text, uploads, subtitles and your library are free. You don't need an account.",
    ta: "Voice to text, upload, subtitles எல்லாமே இலவசம். Account தேவையில்லை.",
  },
  {
    k: /clon|குளோன்|my own voice|என் குரல்/i,
    en: "Voice cloning is coming soon. You can already record a ten second sample on this page and play it back.",
    ta: "Voice cloning விரைவில் வருது. இப்போ இந்த page-ல பத்து second sample record பண்ணி கேட்கலாம்.",
    go: "clone",
  },
  {
    k: /dub|டப்/i,
    en: "Dubbing is coming soon. Today you can make subtitles from a video in Tamil or English.",
    ta: "Dubbing விரைவில் வருது. இப்போ video-வுக்கு Tamil அல்லது English subtitles எடுக்கலாம்.",
  },
  {
    k: /api|developer|sdk|integrat|code|டெவலப்/i,
    en: "The SANSA API is coming soon. Use the contact page to ask for early access.",
    ta: "SANSA API விரைவில் வருது. Early access வேணும்னா contact page-ல கேளுங்க.",
    go: "api",
  },
  {
    k: /agent|phone|call centre|call center|booking|receptionist/i,
    en: "Phone voice agents are coming soon. I'm a small preview of them, right here on the website.",
    ta: "Phone voice agents விரைவில் வருது. நான் அதோட சின்ன preview தான்.",
  },
  {
    k: /subtitle|srt|vtt|video|youtube|instagram|reel|சப்டைட்டில்/i,
    en: "Upload a video and download subtitles as srt or vtt for YouTube or Instagram.",
    ta: "Video upload பண்ணி srt அல்லது vtt subtitles download பண்ணலாம்.",
  },
  {
    k: /upload|file|mp3|m4a|wav|whatsapp|voice note|recording|கோப்பு|ஃபைல்/i,
    en: "You can upload mp3, m4a, wav, WhatsApp voice notes and call recordings up to 25 megabytes, and videos up to 300.",
    ta: "mp3, m4a, wav, WhatsApp voice notes, call recordings 25 MB வரை upload பண்ணலாம். Video 300 MB வரை.",
  },
  {
    k: /private|privacy|safe|secure|save|store|data|தனியுரிமை|பாதுகாப்/i,
    en: "Your audio is not saved. Tamil audio goes to our own server only to convert it, and your texts stay in your browser.",
    ta: "உங்க audio save ஆகாது. Tamil audio convert பண்ண மட்டும் எங்க server-க்கு போகும். Text உங்க browser-லயே இருக்கும்.",
  },
  {
    k: /accura|correct|mistake|wrong|quality|துல்லிய|தப்பு/i,
    en: "Tamil runs on our own Tamil speech engine. Clear speech with little background noise gives the best result.",
    ta: "Tamil-க்கு எங்க சொந்த Tamil engine. சத்தம் குறைவா, தெளிவா பேசினா நல்ல result வரும்.",
  },
  {
    k: /language|hindi|telugu|kannada|malayalam|bengali|marathi|english|tamil|மொழி|தமிழ்/i,
    en: "Voice to text works in Tamil, English, Tanglish and more than fifteen Indian languages.",
    ta: "Tamil, English, Tanglish, மேலும் பதினைந்துக்கு மேல இந்திய மொழிகள்ல voice to text வேலை செய்யும்.",
  },
  {
    k: /read aloud|text to speech|tts|voices?|speak|குரல்|படி/i,
    en: "Read aloud uses the voices on your own device. Natural SANSA AI voices are coming soon.",
    ta: "Read aloud உங்க phone அல்லது computer-ல இருக்கற voice-ஐ use பண்ணும். SANSA AI voices விரைவில் வருது.",
    go: "voices",
  },
  {
    k: /contact|support|help|email|reach|talk to (a )?human|தொடர்பு|உதவி/i,
    en: "You can reach the SANSA team from the contact page. The link is in the footer.",
    ta: "SANSA team-ஐ contact page-ல தொடர்பு கொள்ளலாம். Link கீழே footer-ல இருக்கு.",
  },
  {
    k: /what (can|do)|what is sansa|about|என்ன/i,
    en: "SANSA turns speech into text in Tamil, English and fifteen more languages, makes subtitles and reads text aloud. AI voices, cloning and dubbing are coming next.",
    ta: "SANSA பேச்சை எழுத்தா மாற்றும், subtitles எடுக்கும், text-ஐ படிச்சு காட்டும். AI voices, cloning, dubbing அடுத்து வருது.",
  },
];

function answer(text: string): { reply: string; go?: string } {
  const ta = /[\u0B80-\u0BFF]/.test(text);
  const hit = KB.find((x) => x.k.test(text));
  if (hit) return { reply: ta ? hit.ta : hit.en, go: hit.go };
  return {
    reply: ta
      ? "அது பற்றி எனக்கு சரியா தெரியல. Contact page-ல SANSA team-ஐ கேளுங்க, அல்லது voice to text try பண்ணுங்க."
      : "I'm not sure about that one. You can ask the SANSA team on the contact page, or try voice to text right here.",
  };
}

/* ------------------------------------------------------------------ context: player, agent, palette */

type Home = {
  theme: Theme;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  voice: string;
  setVoice: (id: string) => void;
  playing: string | null;
  play: (id: string, text: string, v?: Voice) => Promise<string | null>;
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
  const [voice, setVoice] = useState("kavya");
  const [playing, setPlaying] = useState<string | null>(null);
  const playingRef = useRef<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [palOpen, setPalOpen] = useState(false);

  const stopPlaying = useCallback(() => {
    playingRef.current = null;
    setPlaying(null);
    orb.busy = false;
    if (readAloudSupported) speechSynthesis.cancel();
  }, []);

  const play = useCallback(
    async (id: string, text: string, v?: Voice) => {
      if (playingRef.current === id) {
        stopPlaying();
        return null;
      }
      stopPlaying();
      if (!readAloudSupported) return "This browser cannot read text aloud. Try Chrome or your phone's browser.";
      await voicesReady();
      const l: Lang = /[\u0B80-\u0BFF]/.test(text) ? "ta" : "en";
      const dv = voiceFor(l === "ta" ? "ta-IN" : "en-IN");
      if (!dv) return noVoiceNote(l);
      const queue = chunks(text);
      playingRef.current = id;
      setPlaying(id);
      orb.busy = true;
      const next = (i: number) => {
        if (playingRef.current !== id) return;
        if (i >= queue.length) {
          playingRef.current = null;
          setPlaying(null);
          orb.busy = false;
          return;
        }
        const u = new SpeechSynthesisUtterance(queue[i]);
        u.voice = dv;
        u.lang = dv.lang;
        u.pitch = v?.pitch ?? 1;
        u.rate = v?.rate ?? 1;
        u.onboundary = () => {
          orb.kick = 1;
        };
        u.onend = () => next(i + 1);
        u.onerror = () => {
          if (playingRef.current === id) {
            playingRef.current = null;
            setPlaying(null);
            orb.busy = false;
          }
        };
        speechSynthesis.speak(u);
      };
      next(0);
      return null;
    },
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
      play,
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
    [theme, onToggleTheme, lang, voice, playing, play, stopPlaying, agentOpen, palOpen, goTo, startDictation],
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
          <a href="#tools">Products</a>
          <a href="#voices">Text to Speech</a>
          <a href="#voices">Voices</a>
          <a href="#api">API</a>
        </div>
        <button className="search-btn" onClick={h.openPal} aria-label="Search">
          <SearchIcon />
          <span className="search-word">Search</span>
          <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <a className="nav-login" href={LOGIN}>
          Log in
        </a>
        <a className="btn-dark" href={SIGNUP}>
          Sign up
        </a>
        <button className="theme-btn" onClick={h.toggleTheme} title="Switch light / dark" aria-label="Switch light / dark">
          {h.theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          className="menu-btn"
          onClick={() => setMenu((m) => !m)}
          aria-label={menu ? "Close menu" : "Open menu"}
          aria-expanded={menu}
          aria-controls="mobile-menu"
        >
          <span aria-hidden="true" />
        </button>
      </nav>
      {menu && (
        <div className="mobile-menu" id="mobile-menu">
          <a href="#tools" onClick={close}>
            Products
          </a>
          <a href="#app" onClick={close}>
            Speech to Text
          </a>
          <a href="#voices" onClick={close}>
            Text to Speech
          </a>
          <a href="#voices" onClick={close}>
            Voices
          </a>
          <a href="#api" onClick={close}>
            API
          </a>
          <a href="#faq" onClick={close}>
            FAQ
          </a>
          <div className="mobile-menu-actions">
            <a className="btn-outline" href={LOGIN}>
              Log in
            </a>
            <a className="btn-dark" href={SIGNUP}>
              Sign up
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
  const [text, setText] = useState(SAMPLE.en);
  const [note, setNote] = useState<string | null>(null);
  const cur = VOICES.find((v) => v.id === h.voice) ?? VOICES[0];

  const pick = (l: Lang) => {
    if (text === SAMPLE[h.lang] || !text.trim()) setText(SAMPLE[l]);
    h.setLang(l);
    setNote(null);
  };
  const onSpeak = async () => setNote(await h.play("hero", text, cur));

  return (
    <section className="hero2">
      <div className="hero2-copy fade-ui">
        <span className="eyebrow">AI Voice Platform</span>
        <h1>Lifelike AI voices in English and Tamil.</h1>
        <p className="hero2-sub">Text to speech, speech to text, voice cloning and dubbing — in one studio and one API.</p>
      </div>
      <Orb />
      <div className="hero2-bar-wrap fade-ui">
        <div className="hero2-bar">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Text to hear"
            lang={h.lang}
            placeholder="Type anything to hear it"
          />
          <div className="seg" role="radiogroup" aria-label="Language">
            {(["en", "ta"] as const).map((l) => (
              <button key={l} role="radio" aria-checked={h.lang === l} className={h.lang === l ? "on" : ""} onClick={() => pick(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn-amber" onClick={() => void onSpeak()} disabled={!text.trim()}>
            {h.playing === "hero" ? "■ Stop" : "▶ Speak"}
          </button>
          <button className="btn-ghost" onClick={h.openAgent}>
            <span className="dot" aria-hidden="true" />
            Talk live
          </button>
        </div>
        <div className="voice-chips" role="radiogroup" aria-label="Voice">
          {VOICES.slice(0, 4).map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={v.id === h.voice}
              className={v.id === h.voice ? "on" : ""}
              onClick={() => h.setVoice(v.id)}
            >
              <span style={{ background: v.swatch }} aria-hidden="true" />
              {v.name}
            </button>
          ))}
        </div>
        {note && (
          <p className="hero2-note" role="status">
            {note}
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
  { name: "Audio Cleanup", desc: "Remove noise and isolate clear speech.", href: "#app" },
];

export function Products() {
  return (
    <section id="tools" className="sec">
      <div className="sec-head">
        <span className="eyebrow at">Products</span>
        <h2>Everything you need to create with voice.</h2>
      </div>
      <div className="prod-grid">
        {PRODUCTS.map((p, i) => {
          const body = (
            <>
              <span className="prod-orb" style={{ background: SW[i % SW.length] }} aria-hidden="true" />
              <span className="prod-name">
                {p.name} {p.soon ? <em className="soon">Coming soon</em> : <em className="live">Live</em>}
              </span>
              <span className="prod-desc">{p.desc}</span>
            </>
          );
          return p.href ? (
            <a key={p.name} className={p.soon ? "prod soon-card" : "prod"} href={p.href}>
              {body}
            </a>
          ) : (
            <div key={p.name} className="prod soon-card">
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
    ["02", "Choose a voice", "Pick from the library or use your own cloned voice."],
    ["03", "Adjust", "Set pitch, pace and emotion until it sounds right."],
    ["04", "Publish", "Download the audio or stream it through the API."],
  ];
  return (
    <section className="band" aria-labelledby="how">
      <div className="sec">
        <div className="sec-head">
          <span className="eyebrow at">How it works</span>
          <h2 id="how">From script to sound in four steps.</h2>
        </div>
        <ol className="steps2">
          {steps.map(([n, t, d]) => (
            <li key={n}>
              <span className="n">{n}</span>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ voice library */

const FILTERS = ["All", "Narration", "Advertising", "Conversational", "Characters"];

export function Voices() {
  const h = useHome();
  const [filter, setFilter] = useState("All");
  const [note, setNote] = useState<string | null>(null);
  const list = VOICES.filter((v) => filter === "All" || v.tag === filter);
  return (
    <section id="voices" className="sec">
      <div className="sec-head-row">
        <div className="sec-head">
          <span className="eyebrow at">Voice library</span>
          <h2>Hear our voices.</h2>
        </div>
        <a className="at-link" href="#voices">
          Browse all voices →
        </a>
      </div>
      <div className="filters" role="radiogroup" aria-label="Voice style">
        {FILTERS.map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="voice-grid">
        {list.map((v) => {
          const on = h.playing === v.id;
          return (
            <div key={v.id} className={on ? "voice-card on" : "voice-card"}>
              <span className="voice-orb" style={{ background: v.swatch }} aria-hidden="true" />
              <div className="voice-meta">
                <b>{v.name}</b>
                <span>{v.desc}</span>
              </div>
              <button
                className="play-btn"
                aria-label={on ? `Stop ${v.name}` : `Play ${v.name}`}
                onClick={() =>
                  void h
                    .play(v.id, h.lang === "ta" ? `வணக்கம், நான் ${v.name}.` : `Hi, I'm ${v.name}. This is how I sound.`, v)
                    .then(setNote)
                }
              >
                {on ? "■" : "▶"}
              </button>
            </div>
          );
        })}
      </div>
      {note && (
        <p className="sec-note" role="status">
          {note}
        </p>
      )}
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
    idle: "Ready when you are",
    recording: "Recording… speak now",
    processing: "Building your voice…",
    ready: "Your voice preview is ready",
    error: "Microphone access was blocked. Allow it and try again.",
  }[st];
  const btn = { idle: "● Start recording", recording: "■ Stop recording", processing: "Processing…", ready: "↺ Record again", error: "● Try again" }[st];

  return (
    <section id="clone" className="band">
      <div className="sec split">
        <div className="split-copy">
          <span className="eyebrow at">Voice cloning</span>
          <h2>Clone your voice in seconds.</h2>
          <p>Read the line out loud. SANSA captures a short sample and turns it into a voice you can use anywhere.</p>
        </div>
        <div className={`panel clone-${st}`}>
          <div className="clone-line">
            <span className="eyebrow small">Read aloud</span>
            <span>“Hi, this is my voice. I’m creating my own AI voice with SANSA.”</span>
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
                {playingBack ? "■ Stop" : "▶ Play your voice"}
              </button>
            )}
          </div>
          <span className="mono small">Preview only. Your recording stays in this browser.</span>
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
        <span className="eyebrow at">Voice agents</span>
        <h2>Agents that answer the phone for you.</h2>
        <p>Voice assistants that take bookings, answer questions and switch between English and Tamil mid-call.</p>
        <button className="btn-dark self-start" onClick={h.openAgent}>
          Try the live agent
        </button>
      </div>
      <div className="panel">
        <div className="call-head">
          <span>
            <i className="st-dot idle" aria-hidden="true" />
            Live call · Clinic booking
          </span>
          <span className="mono">01:24</span>
        </div>
        {CHAT.map(([t, a]) => (
          <div key={t} className={a === "r" ? "bubble-row r" : "bubble-row"}>
            <div className="bubble">{t}</div>
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
          <span className="eyebrow at">Developers</span>
          <h2>Add voice to your app in minutes.</h2>
          <p>One API for speech generation, transcription, dubbing and voice agents, with SDKs for Python and Node.</p>
          <a className="btn-dark self-start" href={SIGNUP}>
            Get an API key
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
        <span className="eyebrow at">FAQ</span>
        <h2 id="faq">Frequently asked questions</h2>
      </div>
      <div className="faq-list">
      {items.map((f, i) => (
        <details key={f.q} open={i === 0}>
          <summary>
            <span>{f.q}</span>
            <span className="plus" aria-hidden="true">
              +
            </span>
          </summary>
          <p>{f.a}</p>
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
        <h2>Give your words a voice.</h2>
        <a href={SIGNUP}>Start free</a>
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
            <span className="foot-tag">AI voices for English and Tamil.</span>
          </div>
          <Col title="Products">
            <a href="#voices">Text to Speech</a>
            <a href="#voices">Voice Library</a>
            <a href="#clone">Voice Cloning</a>
            <a href="#agents">Voice Agents</a>
          </Col>
          <Col title="Developers">
            <a href="#api">API</a>
            <a href="#api">SDKs</a>
          </Col>
          <Col title="Support">
            <a href={CONTACT}>Help Centre</a>
            <a href="#faq">FAQ</a>
            <a href={LOGIN}>Log in</a>
          </Col>
          <Col title="Company">
            <a href="./about">About</a>
            <a href="./about">Careers</a>
            <a href="./privacy">Privacy</a>
            <a href="./terms">Terms of Use</a>
            <a href="./refund">Refund</a>
          </Col>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} SANSA AI. All rights reserved.</span>
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

  const say = useCallback(async (text: string) => {
    if (!readAloudSupported) return set("idle");
    await voicesReady();
    const ta = /[\u0B80-\u0BFF]/.test(text);
    const v = voiceFor(ta ? "ta-IN" : "en-IN");
    if (!v || !alive.current) {
      set("idle");
      if (handsFree.current && alive.current) setTimeout(() => listenRef.current(), 250);
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.pitch = 1.1;
    u.onboundary = () => {
      orb.kick = 1;
    };
    const done = () => {
      if (!alive.current) return;
      set("idle");
      if (handsFree.current) setTimeout(() => listenRef.current(), 250);
    };
    u.onend = done;
    u.onerror = done;
    set("speaking");
    speechSynthesis.speak(u);
  }, []);

  const send = useCallback(
    (raw: string, fromVoice = false) => {
      const text = raw.trim();
      if (!text || stateRef.current === "thinking") return;
      if (!fromVoice) handsFree.current = false;
      setMsgs((m) => [...m, { role: "user", content: text }]);
      setInput("");
      set("thinking");
      const { reply, go } = answer(text);
      window.setTimeout(() => {
        if (!alive.current) return;
        setMsgs((m) => [...m, { role: "assistant", content: reply }]);
        if (go) {
          handsFree.current = false;
          set("idle");
          void say(reply);
          window.setTimeout(() => {
            if (!alive.current) return;
            if (go === "app") h.startDictation();
            else {
              onClose();
              h.goTo(go);
            }
          }, 1600);
          return;
        }
        void say(reply);
      }, 450);
    },
    [h, onClose, say],
  );

  const listen = useCallback(() => {
    if (!SR) {
      setMsgs((m) => [...m, { role: "assistant", content: "Voice input is not available in this browser. Type your question instead, or use Chrome." }]);
      return;
    }
    if (readAloudSupported) speechSynthesis.cancel();
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
  }, [SR, h.lang, send]);
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
      if (readAloudSupported) speechSynthesis.cancel();
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
  const label = { idle: "Agent ready", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking" }[state];
  const suggest = ["What can SANSA do?", "Does it support Tamil?", "How does voice cloning work?"];

  return (
    <div className="agent" role="dialog" aria-label="SANSA voice agent">
      <div className="agent-status">
        <i className={`st-dot ${state}`} aria-hidden="true" />
        {label}
      </div>
      <button className="agent-close" onClick={onClose} aria-label="Close agent">
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
          placeholder="Ask about SANSA, or tap the mic and speak"
          aria-label="Message"
        />
        <button className="btn-amber small" onClick={() => send(input)}>
          Send
        </button>
      </div>
      <div className="agent-suggest">
        {suggest.map((s) => (
          <button key={s} onClick={() => send(s)}>
            {s}
          </button>
        ))}
        <div className="seg" role="radiogroup" aria-label="Agent language">
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
        `Play voice: ${v.name}`,
        "Voice",
        () => void h.play(v.id, `Hi, I'm ${v.name}. This is how I sound.`, v),
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
      <div className="pal" role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}>
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
            placeholder="Search pages, voices and actions"
            aria-label="Search"
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
          {!items.length && <div className="pal-empty">No results</div>}
        </div>
      </div>
    </div>
  );
}
