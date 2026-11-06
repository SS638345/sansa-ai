// Optional private proxy so every visitor can use Sarvam AI without their own key.
// Deploy on Cloudflare Workers (free tier):
//   npx wrangler deploy proxy/worker.js --name sansa-sarvam-proxy
//   npx wrangler secret put SARVAM_API_KEY --name sansa-sarvam-proxy
// Then set the repo Actions variable VITE_SARVAM_PROXY_URL to the worker URL.
const ALLOWED_ORIGINS = ["https://ss638345.github.io", "https://voice.sansaai.in", "http://localhost:5173"];
const MAX_BYTES = 2 * 1024 * 1024; // one ≤25 s 16 kHz WAV piece is ~0.8 MB

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || !allowed) return new Response("Forbidden", { status: 403, headers: cors });
    const len = Number(request.headers.get("Content-Length") ?? 0);
    if (len > MAX_BYTES) return new Response("Too large", { status: 413, headers: cors });

    const upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: {
        "api-subscription-key": env.SARVAM_API_KEY,
        "Content-Type": request.headers.get("Content-Type") ?? "",
      },
      body: request.body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  },
};
