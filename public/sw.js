// Service worker: makes the board load instantly and work without Wi-Fi.
// VERSION is stamped at image build time (Dockerfile), so every deploy ships a new cache.
const VERSION = "__SW_VERSION__";
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = "data-v1";

// Scripts and styles live under a per-build path so browsers (and Cloudflare's 4 h browser TTL)
// can never mix an old script with a new page.
const ASSET = `/_v/${VERSION}`;
const SHELL = [
  "/",
  "/index.html",
  `${ASSET}/styles.css`,
  `${ASSET}/app.js`,
  `${ASSET}/lib/api.js`,
  `${ASSET}/lib/html.js`,
  `${ASSET}/lib/model.js`,
  `${ASSET}/lib/time.js`,
  `${ASSET}/views/board.js`,
  `${ASSET}/views/now.js`,
  `${ASSET}/views/person.js`,
  `${ASSET}/views/sheet.js`,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // PUT/DELETE/POST go straight to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    // Data: network first, last good copy when offline.
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA_CACHE);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(request);
          if (cached) {
            // Tell the page this is a stale copy so it can show the offline banner.
            const h = new Headers(cached.headers);
            h.set("X-From-Cache", "1");
            return new Response(await cached.arrayBuffer(), { status: 200, headers: h });
          }
          return new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
        }
      })()
    );
    return;
  }

  // App shell: cache first (it is versioned per deploy), network as fallback.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const key = request.mode === "navigate" ? "/index.html" : request;
      const cached = await cache.match(key, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(key, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match("/index.html")) ?? Response.error();
      }
    })()
  );
});
