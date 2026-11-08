/**
 * Sansa Voice landing (home page design, 2026-11-08): header, orb hero with a real
 * "Speak" (browser voices) and "Talk live" (live mic), products, steps, FAQ, CTA, footer.
 * Only features that work today are shown as live; the rest say "Coming soon".
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { readAloudSupported, speak, voiceFor, voicesReady } from "./readAloud";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem("vtt.theme");
    if (t === "light" || t === "dark") return t;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
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

function OrbMark({ size = 26 }: { size?: number }) {
  return <span className="orb-mark" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function SiteHeader({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <header className="site-head">
      <nav className="site-nav">
        <a className="site-brand" href="./">
          <OrbMark />
          SANSA <span>Voice</span>
        </a>
        <div className="site-links">
          <a href="#app">Voice to text</a>
          <a href="#tools">Products</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
          <a href="./about">About</a>
        </div>
        <a className="btn-dark" href="#app">
          Start free
        </a>
        <button className="theme-btn" onClick={onToggleTheme} title="Switch light / dark" aria-label="Switch light / dark">
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </nav>
    </header>
  );
}

/** Canvas orb: glowing blob, ring of bars and two orbits. Reacts when `active`. Static under reduced motion. */
function Orb({ active }: { active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const el = host.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let energy = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const BARS = 72;
    const COLORS = ["#f2b950", "#e0569b", "#4c6fff"];
    const draw = (t: number) => {
      energy += ((activeRef.current ? 1 : 0) - energy) * 0.06;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.2;
      const s = t / 1000;
      // orbits
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((k ? -0.35 : 0.22) + Math.sin(s * 0.3 + k) * 0.05);
        ctx.strokeStyle = k ? "rgba(224,86,155,.55)" : "rgba(76,111,255,.55)";
        ctx.beginPath();
        ctx.ellipse(0, 0, R * (k ? 2.25 : 1.85), R * (k ? 0.42 : 0.62), 0, 0, Math.PI * 2);
        ctx.stroke();
        const a = s * (k ? -0.6 : 0.8);
        ctx.fillStyle = k ? "#e0569b" : "#4c6fff";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * (k ? 2.25 : 1.85), Math.sin(a) * R * (k ? 0.42 : 0.62), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // ring of bars
      for (let i = 0; i < BARS; i++) {
        const ang = (i / BARS) * Math.PI * 2 + s * 0.15;
        const wave = 0.5 + 0.5 * Math.sin(i * 0.55 + s * (2 + energy * 6));
        const len = R * (0.1 + wave * (0.12 + energy * 0.35));
        const r0 = R * 1.32;
        ctx.strokeStyle = COLORS[Math.floor((i / BARS) * 3) % 3];
        ctx.globalAlpha = 0.55 + wave * 0.45;
        ctx.lineWidth = Math.max(2, R * 0.035);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // blob
      const pts = 48;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const ang = (i / pts) * Math.PI * 2;
        const wob =
          Math.sin(ang * 3 + s * 1.3) * 0.05 + Math.sin(ang * 5 - s * 1.7) * 0.035 + Math.sin(ang * 7 + s * 2.3) * energy * 0.06;
        const r = R * (1 + wob + energy * 0.06 * Math.sin(s * 9));
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
      g.addColorStop(0, "#ffe2a6");
      g.addColorStop(0.35, "#f2b950");
      g.addColorStop(0.7, "#e0569b");
      g.addColorStop(1, "#4c6fff");
      ctx.shadowColor = "rgba(242,185,80,.55)";
      ctx.shadowBlur = R * (0.5 + energy * 0.5);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(el);
    resize();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(el);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div ref={host} className="orb-host" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}

const SAMPLE: Record<"en" | "ta", string> = {
  en: "Welcome to Sansa Voice. Speak in Tamil or English and it turns into text.",
  ta: "வணக்கம். சான்சா வாய்ஸ்-க்கு வரவேற்கிறோம். நீங்கள் பேசுவதை இது எழுத்தாக மாற்றும்.",
};

export function Hero({ onTalkLive, engineOn }: { onTalkLive: (langTag: string) => void; engineOn: boolean }) {
  const [lang, setLang] = useState<"en" | "ta">("ta");
  const [text, setText] = useState(SAMPLE.ta);
  const [speaking, setSpeaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  const pick = (l: "en" | "ta") => {
    if (text === SAMPLE[lang] || !text.trim()) setText(SAMPLE[l]);
    setLang(l);
    setNote(null);
  };
  const tag = lang === "ta" ? "ta-IN" : "en-IN";
  const onSpeak = async () => {
    if (speaking) {
      stopRef.current?.();
      return;
    }
    if (!readAloudSupported) {
      setNote("This browser cannot read text aloud. Try Chrome or your phone's browser.");
      return;
    }
    await voicesReady();
    if (!voiceFor(tag)) {
      setNote(
        lang === "ta"
          ? "No Tamil voice on this device. On Android, add Tamil in Settings → Text-to-speech."
          : "No English voice found on this device.",
      );
      return;
    }
    setNote(null);
    setSpeaking(true);
    stopRef.current = speak(text, tag, 1, () => {
      setSpeaking(false);
      stopRef.current = null;
    });
  };

  return (
    <section className="hero2">
      <div className="hero2-copy">
        <span className="eyebrow">{engineOn ? "Own Tamil engine · Free" : "Free · No sign up"}</span>
        <h1>
          Pesunga. <span className="hl">Text aagidum.</span>
        </h1>
        <p className="hero2-ta" lang="ta">
          பேசுங்க, எழுத்தா மாறிடும்.
        </p>
        <p className="hero2-sub">
          Tamil voice to text, plus Tanglish, English and 15+ Indian languages. Live mic, voice notes, call recordings and video
          subtitles. No sign up, no install.
        </p>
      </div>
      <Orb active={speaking} />
      <div className="hero2-bar-wrap">
        <div className="hero2-bar">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Text to hear"
            lang={lang}
            placeholder="Type anything to hear it"
          />
          <div className="seg" role="radiogroup" aria-label="Language">
            {(["en", "ta"] as const).map((l) => (
              <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => pick(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn-amber" onClick={() => void onSpeak()} disabled={!text.trim()}>
            {speaking ? "■ Stop" : "▶ Speak"}
          </button>
          <button className="btn-ghost" onClick={() => onTalkLive(tag)}>
            <span className="dot" aria-hidden="true" />
            Talk live
          </button>
        </div>
        <p className="hero2-note">
          {note ?? "Speak uses your device's own voice. Talk live turns your speech into text below."}
        </p>
      </div>
    </section>
  );
}

const ORBS = [
  "radial-gradient(circle at 35% 30%,#ffe2a6,#f2b950 45%,#e0569b)",
  "radial-gradient(circle at 35% 30%,#ffd1e6,#e0569b 50%,#4c6fff)",
  "radial-gradient(circle at 35% 30%,#cfe0ff,#4c6fff 50%,#2fbf6f)",
  "radial-gradient(circle at 35% 30%,#d6ffe6,#2fbf6f 50%,#f2b950)",
];

const PRODUCTS: { name: string; desc: string; href?: string; soon?: boolean }[] = [
  { name: "Speech to text", desc: "Live mic: words appear while you talk, in Tamil, English and 15+ languages.", href: "#app" },
  { name: "Voice notes & calls", desc: "Upload WhatsApp voice notes, call recordings, mp3 or m4a and get the text.", href: "#app" },
  { name: "Video subtitles", desc: "Upload a video and download .srt or .vtt subtitles for YouTube and Instagram.", href: "#app" },
  { name: "Read aloud", desc: "Hear any text with the voices already on your phone or computer.", href: "#app" },
  { name: "Tamil AI voices", desc: "Natural Tamil and English text to speech voices.", soon: true },
  { name: "Voice cloning", desc: "Make a voice from a short sample of your own speech.", soon: true },
  { name: "Dubbing", desc: "Turn a video into Tamil or English with matching timing.", soon: true },
  { name: "API for developers", desc: "Add Tamil speech to text to your own app.", soon: true },
];

export function Products() {
  return (
    <section id="tools" className="sec">
      <div className="sec-head">
        <span className="eyebrow at">Products</span>
        <h2>Everything for Tamil voice, in one place.</h2>
      </div>
      <div className="prod-grid">
        {PRODUCTS.map((p, i) => {
          const body = (
            <>
              <span className="prod-orb" style={{ background: ORBS[i % ORBS.length] }} aria-hidden="true" />
              <span className="prod-name">
                {p.name} {p.soon ? <em className="soon">Coming soon</em> : <em className="live">Live</em>}
              </span>
              <span className="prod-desc">{p.desc}</span>
            </>
          );
          return p.href ? (
            <a key={p.name} className="prod" href={p.href}>
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

export function HowItWorks() {
  const steps = [
    ["01", "Choose a language", "Tamil, English, Hindi, Telugu or any of 15+ languages."],
    ["02", "Speak, record or upload", "Live mic, a recording, a WhatsApp voice note, a call recording or a video."],
    ["03", "Edit and fix", "Clean mode removes umm and ம்ம். My words teaches it names it should spell right."],
    ["04", "Copy or download", "Copy the text, or download .txt and .srt subtitles."],
  ];
  return (
    <section className="band" aria-labelledby="how">
      <div className="sec">
        <div className="sec-head">
          <span className="eyebrow at">How it works</span>
          <h2 id="how">
            From voice to text in four steps. <small lang="ta">எப்படி use பண்றது</small>
          </h2>
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

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="sec faq2" aria-labelledby="faq">
      <h2 id="faq">
        Frequently asked questions <small lang="ta">கேள்விகள்</small>
      </h2>
      {items.map((f) => (
        <details key={f.q}>
          <summary>
            <span>{f.q}</span>
            <span className="plus" aria-hidden="true">
              +
            </span>
          </summary>
          <p>{f.a}</p>
        </details>
      ))}
    </section>
  );
}

export function Cta() {
  return (
    <section className="cta-wrap">
      <div className="cta">
        <h2>
          Pesunga. <span lang="ta">எழுத்தா மாறிடும்.</span>
        </h2>
        <a href="#app">Start free</a>
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
              SANSA <span>Voice</span>
            </span>
            <span className="foot-tag">Tamil voice to text, free. Made in Chennai.</span>
          </div>
          <Col title="Product">
            <a href="#app">Voice to text</a>
            <a href="#tools">All products</a>
            <a href="#faq">FAQ</a>
          </Col>
          <Col title="Company">
            <a href="./about">About</a>
            <a href="./contact">Contact</a>
            <a href="https://app.sansaai.in">SANSA AI app</a>
          </Col>
          <Col title="Legal">
            <a href="./privacy">Privacy</a>
            <a href="./terms">Terms</a>
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
