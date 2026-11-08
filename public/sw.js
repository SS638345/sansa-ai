/* Sansa Voice service worker (2026-11-08).
 * Only one job: receive audio/video shared from other apps (Android "Share → Sansa Voice",
 * e.g. a WhatsApp voice note), keep it for the page, and open the app. No offline caching,
 * so site updates always show immediately. */
const SHARE_CACHE = "sansa-share";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || !url.pathname.endsWith("/share-target")) return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const file = form.getAll("audio").find((f) => f && typeof f !== "string");
        if (file) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            "shared-file",
            new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream", "X-Name": encodeURIComponent(file.name || "shared-audio") } }),
          );
        }
      } catch {
        /* nothing shared: just open the app */
      }
      return Response.redirect(new URL("./?shared=1#app", self.registration.scope).href, 303);
    })(),
  );
});
