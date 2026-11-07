/**
 * Read aloud with the voices built into the browser / phone (free, offline on most devices).
 * Long text is spoken sentence by sentence because some browsers stop a single long utterance.
 */
export const readAloudSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export function voiceFor(langTag: string): SpeechSynthesisVoice | null {
  if (!readAloudSupported) return null;
  const voices = speechSynthesis.getVoices();
  const base = langTag.split("-")[0].toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === langTag.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

/** Voices load asynchronously in Chrome; resolves once the list is ready (or after 1.5 s). */
export function voicesReady(): Promise<void> {
  if (!readAloudSupported || speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

function sentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?।\n]+[.!?।]*\s*/gu) ?? [text];
  // Merge tiny pieces and cut very long ones so each utterance stays short.
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (out.length && out[out.length - 1].length + t.length < 160) out[out.length - 1] += ` ${t}`;
    else for (let i = 0; i < t.length; i += 220) out.push(t.slice(i, i + 220));
  }
  return out;
}

/** Speak the text; returns a stop function. onEnd fires when finished or stopped. */
export function speak(text: string, langTag: string, rate: number, onEnd: () => void): () => void {
  speechSynthesis.cancel();
  const voice = voiceFor(langTag);
  const queue = sentences(text);
  let stopped = false;
  const next = (i: number) => {
    if (stopped || i >= queue.length) {
      onEnd();
      return;
    }
    const u = new SpeechSynthesisUtterance(queue[i]);
    u.lang = voice?.lang ?? langTag;
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => next(i + 1);
    u.onerror = () => {
      stopped = true;
      onEnd();
    };
    speechSynthesis.speak(u);
  };
  next(0);
  return () => {
    stopped = true;
    speechSynthesis.cancel();
  };
}
