/**
 * My library: every conversion is saved on this device (IndexedDB), with its timed lines and,
 * when small enough, its audio so the timeline can play again later. Nothing leaves the browser.
 */
import type { Segment } from "./transcript";

export type LibraryItem = {
  id: string;
  title: string;
  createdAt: number;
  text: string;
  segments: Segment[];
  lang: string;
  /** Original audio or video, kept only when ≤ MAX_MEDIA bytes. */
  media?: Blob;
  mediaType?: "audio" | "video";
};

const DB = "sansa-library";
const STORE = "items";
const MAX_MEDIA = 60 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Library storage is not available in this browser."));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Library storage failed."));
    });
  } finally {
    db.close();
  }
}

export async function listItems(): Promise<LibraryItem[]> {
  const items = await run<LibraryItem[]>("readonly", (s) => s.getAll() as IDBRequest<LibraryItem[]>);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveItem(item: Omit<LibraryItem, "id" | "createdAt"> & Partial<Pick<LibraryItem, "id" | "createdAt">>) {
  const full: LibraryItem = {
    ...item,
    id: item.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: item.createdAt ?? Date.now(),
  };
  if (full.media && full.media.size > MAX_MEDIA) {
    delete full.media;
    delete full.mediaType;
  }
  await run("readwrite", (s) => s.put(full));
  return full;
}

export const renameItem = async (item: LibraryItem, title: string) => saveItem({ ...item, title });

export const deleteItem = (id: string) => run("readwrite", (s) => s.delete(id));

/** A short default title from the first words, e.g. "இன்று காலை நான்…". */
export function titleFrom(text: string, fallback: string) {
  const words = text.trim().split(/\s+/).slice(0, 6).join(" ");
  return words ? (text.trim().split(/\s+/).length > 6 ? `${words}…` : words) : fallback;
}
