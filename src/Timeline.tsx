import { useEffect, useMemo, useRef, useState } from "react";
import { tr } from "./i18n";
import { clock, toVtt, type Segment } from "./transcript";

export type MediaKind = "audio" | "video";

/**
 * The last converted audio with its text line by line. The line being played lights up;
 * tap any line to jump the audio there. Audio is not stored, so after a reload only the
 * times stay (subtitles still download).
 */
export function Timeline({ segments, mediaUrl, kind }: { segments: Segment[]; mediaUrl: string | null; kind: MediaKind }) {
  const audioUrl = mediaUrl;
  const audioRef = useRef<HTMLMediaElement | null>(null);
  // Video plays with the subtitles drawn on it, from the same timed lines.
  const vtt = useMemo(() => (kind === "video" ? toVtt(segments) : null), [kind, segments]);
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!vtt) return setVttUrl(null);
    const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    setVttUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [vtt]);
  const listRef = useRef<HTMLOListElement>(null);
  const checks = segments.filter((s) => s.check).length;
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
        <h3>{tr("Timeline")}</h3>
        <span className="count">
          {tr("{n} lines · tap a line to play from there").replace("{n}", String(segments.length))}
          {checks > 0 && <b className="check-count"> · {tr("{n} to check").replace("{n}", String(checks))}</b>}
        </span>
      </div>
      {audioUrl && kind === "video" ? (
        <video
          ref={(el) => {
            audioRef.current = el;
          }}
          src={audioUrl}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        >
          {vttUrl && <track kind="subtitles" src={vttUrl} srcLang="und" label="SANSA subtitles" default />}
        </video>
      ) : audioUrl ? (
        <audio
          ref={(el) => {
            audioRef.current = el;
          }}
          src={audioUrl}
          controls
          preload="metadata"
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        />
      ) : (
        <p className="hint left">{tr("Audio is not loaded. Open this from My library to play it again; subtitles still download.")}</p>
      )}
      <ol ref={listRef} className="lines">
        {segments.map((s, i) => (
          <li key={i}>
            <button
              className={[i === active ? "on" : "", s.check ? "check" : ""].join(" ").trim() || undefined}
              onClick={() => seek(s)}
              disabled={!audioUrl}
              aria-current={i === active}
              title={s.check ? tr("The engine was not sure about this line. Listen and fix it in the text above.") : undefined}
            >
              <time>{clock(s.start)}</time>
              <span dir="auto">
                {tr(s.text)}
                {s.check && <em className="check-tag">{tr("check")}</em>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
