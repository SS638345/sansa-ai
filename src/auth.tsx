/**
 * Google sign-in for sansaai.in (2026-11-09).
 * The home page is open to everyone; any tool, button or field asks the visitor to sign in with Google first.
 * After sign-in, the option they clicked opens. The server (webapp-api) checks the Google token and keeps a
 * session cookie (HttpOnly); nginx also refuses the voice engines without it, so the gate cannot be skipped.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t } from "./i18n";
import { Ic } from "./icons";

export const GOOGLE_CLIENT_ID = "337146462975-9hjhcjkfidnmdnsph6f1cbub4hejbb4v.apps.googleusercontent.com";

export type User = { email: string; name: string; picture: string };
type State = { checked: boolean; user: User | null; asking: boolean; error?: string };

let state: State = { checked: false, user: null, asking: false };
const subs = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};
export const useAuth = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );

export async function refreshUser() {
  try {
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    set({ checked: true, user: r.ok ? (await r.json()).user : null });
  } catch {
    set({ checked: true });
  }
}

export function askLogin(resume?: Resume) {
  try {
    // the redirect sign-in reloads the page: remember what to open when the visitor comes back
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ ...(resume ?? {}), y: Math.round(scrollY) }));
  } catch {
    /* storage blocked: the visitor clicks again after signing in */
  }
  set({ asking: true });
}

/** Where the visitor was and what they clicked, kept across the redirect to Google and back. */
type Resume = { path?: string; act?: "click" | "focus"; y?: number };
const RESUME_KEY = "sv.resume";

function cssPath(el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    if (e.id) {
      parts.unshift("#" + CSS.escape(e.id));
      break;
    }
    const p: Element | null = e.parentElement;
    const same = p ? Array.from(p.children).filter((c) => c.tagName === e!.tagName) : [];
    parts.unshift(e.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : ""));
  }
  return parts.join(" > ");
}

/** After coming back from Google: clean the address, scroll back, open the option they clicked. */
function resumeAfterRedirect() {
  const q = new URLSearchParams(location.search);
  const result = q.get("signin");
  if (!result) return;
  q.delete("signin");
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  let r: Resume = {};
  try {
    r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || "{}");
    sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
  if (result !== "ok") {
    set({ asking: true, error: t("Google sign-in did not finish. Please try again.", "Google உள்நுழைவு முடியவில்லை. மீண்டும் முயலுங்கள்.") });
    return;
  }
  const go = () => {
    if (typeof r.y === "number") scrollTo(0, r.y);
    const el = r.path ? (document.querySelector(r.path) as HTMLElement | null) : null;
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setTimeout(() => (r.act === "focus" ? el.focus() : el.click()), 150);
  };
  // wait for the page (and its lazy parts) to be drawn
  setTimeout(go, 600);
}

export async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    /* offline: the cookie stays until it expires */
  }
  try {
    (window as unknown as { google?: { accounts: { id: { disableAutoSelect(): void } } } }).google?.accounts.id.disableAutoSelect();
  } catch {
    /* ignore */
  }
  set({ user: null });
}

/** Parts of the page anyone can use without signing in. */
const PUBLIC = ".site-brand, .lang-btn, .theme-btn, .menu-btn, .auth-btn, .auth-modal, .faq-list, .site-foot a:not([href^='#']), [data-public]";
const ACTIVE = "button, input, textarea, select, a[href^='#'], label, summary, audio, video, [role='button'], [role='radio'], [role='tab'], [contenteditable='true']";

function gated(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element) || state.user) return null;
  const hit = el.closest(ACTIVE) as HTMLElement | null;
  if (!hit || hit.closest(PUBLIC)) return null;
  return hit;
}

/** Catches clicks, typing and dropped files anywhere on the page while signed out. Mount once. */
export function LoginGate() {
  const { user, asking } = useAuth();

  useEffect(() => {
    void refreshUser().then(() => state.user && resumeAfterRedirect());
    if (new URLSearchParams(location.search).get("signin") === "error") resumeAfterRedirect();
  }, []);

  useEffect(() => {
    if (user) return;
    const onClick = (e: MouseEvent) => {
      const el = gated(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      askLogin({ path: cssPath(el), act: "click" });
    };
    const onFocus = (e: FocusEvent) => {
      const el = gated(e.target);
      if (!el || !el.matches("input, textarea, select, [contenteditable='true']")) return;
      el.blur();
      askLogin({ path: cssPath(el), act: "focus" });
    };
    const onDrop = (e: DragEvent) => {
      if (state.user) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      askLogin();
    };
    const onDragOver = (e: DragEvent) => !state.user && e.preventDefault();
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragover", onDragOver, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragover", onDragOver, true);
    };
  }, [user]);

  return asking ? <LoginModal /> : null;
}

type Gis = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback?: (r: { credential: string }) => void; ux_mode?: "popup" | "redirect"; login_uri?: string; auto_select?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
      disableAutoSelect(): void;
    };
  };
};

let gisLoad: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  gisLoad ??= new Promise<Gis>((ok, bad) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? ok(w.google) : bad(new Error("gis")));
    s.onerror = () => {
      gisLoad = null;
      bad(new Error("gis"));
    };
    document.head.appendChild(s);
  });
  return gisLoad;
}

function LoginModal() {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(state.error ?? null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    set({ asking: false, error: undefined });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let live = true;
    loadGis()
      .then((g) => {
        if (!live || !box.current) return;
        // Redirect mode: the page goes to Google and comes back signed in. Works where pop-ups are blocked
        // (phones, WhatsApp / Instagram browsers). The server checks the token and sets the session cookie.
        g.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: "redirect",
          login_uri: location.origin + "/api/auth/google-redirect",
          callback: () => setBusy(true),
        });
        g.accounts.id.renderButton(box.current, { type: "standard", theme: "filled_blue", size: "large", shape: "pill", text: "continue_with", width: 280, locale: document.documentElement.lang === "ta" ? "ta" : "en" });
      })
      .catch(() => live && setErr(t("Could not load Google sign-in. Check your internet and try again.", "Google உள்நுழைவை ஏற்ற முடியவில்லை. இணையத்தை சரிபார்த்து மீண்டும் முயலுங்கள்.")));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="auth-card">
        <button className="auth-x" onClick={close} aria-label={t("Close", "மூடு")}>
          <Ic.X />
        </button>
        <img src="/brand/sansa-mark.svg" width={44} height={44} alt="" aria-hidden="true" />
        <h2 id="auth-title">{t("Sign in to continue", "தொடர உள்நுழையுங்கள்")}</h2>
        <p>{t("Sign in with your Google account to use SANSA's free voice tools.", "SANSA-வின் இலவச குரல் கருவிகளைப் பயன்படுத்த உங்கள் Google account-ல் உள்நுழையுங்கள்.")}</p>
        <div className="auth-gbtn" ref={box} aria-busy={busy} />
        {busy && <p className="small">{t("Signing you in…", "உள்நுழைகிறது…")}</p>}
        {err && (
          <p className="clone-err" role="alert">
            {err}
          </p>
        )}
        <p className="auth-fine">
          {t("We keep only your name, email and photo from Google. ", "Google-லிருந்து உங்கள் பெயர், email, படம் மட்டும் வைக்கிறோம். ")}
          <a href="/privacy.html">{t("Privacy", "தனியுரிமை")}</a> · <a href="/terms.html">{t("Terms", "விதிமுறைகள்")}</a>
        </p>
      </div>
    </div>
  );
}

/** Header button: "Sign in" when signed out, photo + Log out when signed in. */
export function AuthButton({ wide = false }: { wide?: boolean }) {
  const { user, checked } = useAuth();
  const [open, setOpen] = useState(false);
  if (!checked) return <span className="auth-btn auth-wait" aria-hidden="true" />;
  if (!user)
    return (
      <button className={wide ? "auth-btn btn-dark wide" : "auth-btn btn-dark"} onClick={() => askLogin()}>
        {t("Sign in", "உள்நுழை")}
      </button>
    );
  const first = (user.name || user.email).split(" ")[0];
  return (
    <span className="auth-btn auth-user">
      <button className="auth-me" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t(`Account: ${user.email}`, `கணக்கு: ${user.email}`)}>
        {user.picture ? <img src={user.picture} alt="" width={28} height={28} referrerPolicy="no-referrer" /> : <span className="auth-initial">{first[0]?.toUpperCase()}</span>}
        {wide && <span>{first}</span>}
      </button>
      {open && (
        <span className="auth-menu" role="menu">
          <span className="auth-email">{user.email}</span>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            {t("Log out", "வெளியேறு")}
          </button>
        </span>
      )}
    </span>
  );
}
