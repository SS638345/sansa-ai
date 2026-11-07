import { useState } from "react";
import type { LibraryItem } from "./library";

/** Saved conversions on this device: search, open, rename, delete. */
export function Library({
  items,
  currentId,
  onOpen,
  onRename,
  onDelete,
}: {
  items: LibraryItem[];
  currentId: string | null;
  onOpen: (item: LibraryItem) => void;
  onRename: (item: LibraryItem, title: string) => void;
  onDelete: (item: LibraryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.title.toLowerCase().includes(q) || i.text.toLowerCase().includes(q)) : items;
  const fmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <section className="card library">
      <button className="library-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <b>My library</b> <small>{items.length ? `${items.length} saved on this device` : "every conversion is saved here"}</small>
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          {items.length > 3 && (
            <input type="search" className="search" placeholder="Search your transcripts" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          {!items.length && <p className="hint left">Upload or record something and it will be kept here, only in this browser.</p>}
          <ul className="items">
            {shown.map((item) => (
              <li key={item.id} className={item.id === currentId ? "on" : ""}>
                <button className="item-main" onClick={() => onOpen(item)}>
                  <span className="item-title" dir="auto">{item.title}</span>
                  <small>
                    {fmt.format(item.createdAt)} · {item.text.split(/\s+/).filter(Boolean).length} words
                    {item.segments.length ? " · subtitles" : ""}
                    {item.media ? (item.mediaType === "video" ? " · video" : " · audio") : ""}
                  </small>
                </button>
                <button
                  className="icon"
                  title="Rename"
                  aria-label={`Rename ${item.title}`}
                  onClick={() => {
                    const t = window.prompt("New name", item.title);
                    if (t?.trim()) onRename(item, t.trim());
                  }}
                >
                  ✎
                </button>
                <button
                  className="icon"
                  title="Delete"
                  aria-label={`Delete ${item.title}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${item.title}"? This cannot be undone.`)) onDelete(item);
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
          {q && !shown.length && <p className="hint left">Nothing matches "{query}".</p>}
        </>
      )}
    </section>
  );
}
