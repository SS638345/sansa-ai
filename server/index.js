import "dotenv/config";
import express from "express";
import OpenAI, { toFile } from "openai";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { ensureCompatibleFormat } from "./audio.js";

const PORT = Number(process.env.PORT) || 3001;
const MODEL = process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const MAX_MB = 25; // OpenAI transcription upload limit

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined })
  : null;

const app = express();

app.get("/api/status", (_req, res) => {
  res.json({ ai: Boolean(openai), model: openai ? MODEL : null });
});

// Body is the raw audio file. ?lang=ta | en (optional; omit for auto-detect).
app.post(
  "/api/transcribe",
  express.raw({ type: () => true, limit: `${MAX_MB}mb` }),
  async (req, res) => {
    if (!openai) {
      return res.status(503).json({ error: "AI transcription is off. Add OPENAI_API_KEY to .env and restart." });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "No audio received." });
    }
    try {
      const { buffer, ext } = await ensureCompatibleFormat(req.body);
      const lang = typeof req.query.lang === "string" && /^[a-z]{2}$/.test(req.query.lang) ? req.query.lang : undefined;
      const result = await openai.audio.transcriptions.create({
        file: await toFile(buffer, `audio.${ext}`),
        model: MODEL,
        ...(lang ? { language: lang } : {}),
      });
      res.json({ text: result.text });
    } catch (err) {
      console.error("transcribe failed:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Transcription failed." });
    }
  },
);

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: `File is too big. Max ${MAX_MB} MB.` });
  }
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

// In production, serve the built frontend from dist/.
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Voice to text server on http://localhost:${PORT} (AI ${openai ? `on, ${MODEL}` : "off"})`);
});
