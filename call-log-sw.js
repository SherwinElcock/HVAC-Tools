// Call Log offline support: keeps the app itself on the phone so it opens with no signal.
// Your call data is stored separately by the page (IndexedDB) and synced to Supabase.
const CACHE = "call-log-v1";
const FILES = [
  "./call-log.html",
  "./call-log.webmanifest",
  "./call-log-icon-192.png",
  "./call-log-icon-512.png",
  "./call-log-apple-touch.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&display=swap",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FILES.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("call-log-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;          // data always goes straight to Supabase
  const mine = url.origin === location.origin && /\/call-log[^/]*$/.test(url.pathname);
  const lib = (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/npm/@supabase/"))
    || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (mine) e.respondWith(networkFirst(req));
  else if (lib) e.respondWith(cacheThenUpdate(req));
});

// Page: try the internet first so updates show up; fall back to the saved copy
// if there's no signal or the signal is too weak to answer within 4 seconds.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
  const saved = await cache.match(req, { ignoreSearch: true });
  if (!saved) return net;
  const slow = new Promise(r => setTimeout(() => r(saved), 4000));
  return Promise.race([net.catch(() => saved), slow]);
}

// Libraries and fonts: use the saved copy right away, refresh it in the background.
async function cacheThenUpdate(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; });
  if (saved) { net.catch(() => {}); return saved; }
  return net;
}
