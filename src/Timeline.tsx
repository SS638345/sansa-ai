import { useEffect, useRef, useState } from "react";
import { clock, type Segment } from "./transcript";

/**
 * The last converted audio with its text line by line. The line being played lights up;
 * tap any line to jump the audio there. Audio is not stored, so after a reload only the
 * times stay (subtitles still download).
 */
export function Timeline({ segments, audioUrl }: { segments: Segment[]; audioUrl: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [now, setNow] = useState(-1);

  const active = segments.findIndex((s, i) => now >= s.start && (now < s.end || (i === segments.length - 1 && now <= s.end + 0.5)));

  useEffect(() => {
    const list = listRef.current;
    const el = active >= 0 ? (list?.children[active] as HTMLElement | undefined) : undefined;
    if (!list || !el) return;
    // Scroll only inside the list, never the page.
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [active]);

  const seek = (s: Segment) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = s.start;
    setNow(s.start);
    void a.play().catch(() => undefined);
  };

  return (
    <div className="timeline">
      <div className="timeline-head">
        <h3>Timeline</h3>
        <span className="count">{segments.length} lines · tap a line to play from there</span>
      </div>
      {audioUrl ? (
        <audio ref={audioRef} src={audioUrl} controls preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
      ) : (
        <p className="hint left">Audio is not kept after a reload. Times and subtitles are still here.</p>
      )}
      <ol ref={listRef} className="lines">
        {segments.map((s, i) => (
          <li key={i}>
            <button className={i === active ? "on" : ""} onClick={() => seek(s)} disabled={!audioUrl} aria-current={i === active}>
              <time>{clock(s.start)}</time>
              <span dir="auto">{s.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
