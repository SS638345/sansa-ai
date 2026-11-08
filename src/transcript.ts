import { tamilToTanglish } from "./translit";
import { toCodemix } from "./codemix";

/**
 * Timed transcript pieces, subtitle export (SRT / VTT), Clean mode and "My words".
 * Everything here is plain text processing in the browser: free, no network.
 */

/** One timed piece of the transcript, times in seconds from the start of the audio. */
/** `check`: the engine was unsure about this piece, so the app asks the user to listen and fix it. */
export type Segment = { start: number; end: number; text: string; check?: boolean };

/** Engine result: the full text plus timed pieces (empty when the engine gives no times). */
export type Transcript = { text: string; segments: Segment[] };

export const joinSegments = (segs: Segment[]) =>
  segs
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ");

/** Start offset (seconds) of each piece produced by splitOnSilence, which returns contiguous slices. */
export function pieceOffsets(pieces: Float32Array[], rate = 16000): number[] {
  const out: number[] = [];
  let t = 0;
  for (const p of pieces) {
    out.push(t);
    t += p.length / rate;
  }
  return out;
}

// ---------- Subtitles ----------

const MAX_CUE_SEC = 7;
const MAX_CUE_WORDS = 12;

/** Break long pieces into subtitle-sized cues, sharing the time by text length. */
export function toCues(segs: Segment[]): Segment[] {
  const cues: Segment[] = [];
  for (const s of segs) {
    const words = s.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const dur = Math.max(0.5, s.end - s.start);
    const parts = Math.max(Math.ceil(dur / MAX_CUE_SEC), Math.ceil(words.length / MAX_CUE_WORDS));
    if (parts <= 1) {
      cues.push({ start: s.start, end: Math.max(s.end, s.start + 0.5), text: words.join(" ") });
      continue;
    }
    const per = Math.ceil(words.length / parts);
    const total = words.join(" ").length;
    let t = s.start;
    for (let i = 0; i < words.length; i += per) {
      const chunk = words.slice(i, i + per).join(" ");
      const end = i + per >= words.length ? s.start + dur : t + (dur * (chunk.length + 1)) / (total + 1);
      cues.push({ start: t, end, text: chunk });
      t = end;
    }
  }
  return cues;
}

function stamp(sec: number, sep: "," | ".") {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export const toSrt = (segs: Segment[]) =>
  toCues(segs)
    .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`)
    .join("\n");

export const toVtt = (segs: Segment[]) =>
  "WEBVTT\n\n" + toCues(segs).map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n");

/** Plain text with a [mm:ss] time before each piece. */
export const toTimedText = (segs: Segment[]) => segs.map((s) => `[${clock(s.start)}] ${s.text}`).join("\n");

export function clock(sec: number) {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// ---------- Clean mode ----------

/** Sounds people make while thinking, in English and Indian scripts. Matched as whole words only. */
const FILLERS = new Set(
  [
    "um", "umm", "ummm", "uh", "uhh", "uhm", "erm", "er", "hmm", "hmmm", "hm", "mmm",
    // Not "ah"/"aah" or "ம்": in Tamil and Tanglish those carry meaning ("seri ah?", "ம்" = yes).
    "ம்ம்", "ம்ம", "உம்", "ஹ்ம்", "ஹ்ம்ம்", "அஅ", "ஆஆ",
    "उम्म", "हम्म", "अम्म",
    "అమ్", "హ్మ్", "ಹ್ಮ್", "ഹ്മ്",
  ].map((w) => w.normalize("NFC")),
);

const EDGE_PUNCT = /^[\s"'“”‘’(),.!?…:;।-]+|[\s"'“”‘’(),.!?…:;।-]+$/gu;

/** Remove fillers (umm, aah, ம்ம்…) and tidy spaces and punctuation. Keeps real repeated words like "konjam konjam". */
export function cleanText(text: string): string {
  const kept = text
    .split(/\s+/)
    .filter((w) => w && !FILLERS.has(w.replace(EDGE_PUNCT, "").toLowerCase().normalize("NFC")));
  return kept
    .join(" ")
    .replace(/\s+([,.!?;:।…])/gu, "$1")
    .replace(/([,.!?;:])\1+/g, "$1")
    .replace(/^[,.;:\s]+/, "")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    .trim();
}

// ---------- My words ----------

/** One rule per line: "wrong = Right" fixes a mistake; a plain "Right" fixes its spelling and capitals. */
export type WordRule = { from: string; to: string };

export function parseMyWords(input: string): WordRule[] {
  return input
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.split(/\s*(?:=>|=|→)\s*/);
      return m.length >= 2 && m[0] && m[1] ? { from: m[0], to: m[1] } : { from: line, to: line };
    });
}

/** The correct spellings, used as hints for engines that accept them (Sarvam keyterms). */
export const keyTerms = (rules: WordRule[]) => [...new Set(rules.map((r) => r.to.slice(0, 64)))].slice(0, 50);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function applyMyWords(text: string, rules: WordRule[]): string {
  let out = text;
  for (const r of rules) {
    const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRe(r.from)}(?![\\p{L}\\p{M}\\p{N}])`, "giu");
    out = out.replace(re, r.to);
  }
  return out;
}

/** Clean mode and My words, applied the same way to the text and to every timed piece. */
export function polish(t: Transcript, opts: { clean: boolean; rules: WordRule[]; codemix?: boolean; tanglish?: boolean }): Transcript {
  const fix = (s: string) => {
    // Mixed first, so a My words rule can still override what it picks.
    const mixed = opts.codemix ? toCodemix(s) : s;
    const fixed = opts.rules.length ? applyMyWords(mixed, opts.rules) : mixed;
    const done = opts.clean ? cleanText(fixed) : fixed.trim();
    // Tanglish last, after My words, so the visitor's own spellings are romanised too
    return opts.tanglish ? tamilToTanglish(done) : done;
  };
  const segments = t.segments.map((s) => ({ ...s, text: fix(s.text) })).filter((s) => s.text);
  return { text: segments.length ? joinSegments(segments) : fix(t.text), segments };
}
