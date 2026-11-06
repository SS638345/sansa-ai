export interface Status {
  ai: boolean;
  model: string | null;
}

export async function getStatus(): Promise<Status> {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error();
    return (await res.json()) as Status;
  } catch {
    return { ai: false, model: null };
  }
}

/** Send an audio Blob/File to the server and get text back. */
export async function transcribe(audio: Blob, lang: string): Promise<string> {
  const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(lang)}`, {
    method: "POST",
    headers: { "Content-Type": audio.type || "application/octet-stream" },
    body: audio,
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data.text ?? "";
}
