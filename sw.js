// Bobine — service worker : cache hors-ligne + notifications push
const VERSION = "bobine-v14";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/config.js", "./js/tmdb.js", "./js/store.js", "./js/push.js", "./js/import-tvtime.js", "./js/rawg.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];
const IMG_CACHE = "bobine-img";
const IMG_MAX = 600;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== IMG_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Visuels TMDB : cache d'abord (ils ne changent jamais)
  if (url.hostname === "image.tmdb.org") {
    e.respondWith((async () => {
      const c = await caches.open(IMG_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        let res;
        try { res = await fetch(url.href, { mode: "cors" }); } catch { res = await fetch(req); }
        c.put(req, res.clone()).then(() => trim(c));
        return res;
      } catch { return new Response("", { status: 504 }); }
    })());
    return;
  }

  // App : réseau d'abord, cache en secours (mises à jour immédiates)
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
        return res;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? caches.match("./index.html") : Response.error());
      }
    })());
  }
});

let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (let i = 0; i < keys.length - IMG_MAX; i++) await c.delete(keys[i]); }
  finally { trimming = false; }
}

// ── Push ──
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Bobine", body: e.data && e.data.text() }; }
  const title = d.title || "Bobine";
  const opts = {
    body: d.body || "",
    icon: d.icon || "icons/icon-192.png",
    badge: "icons/icon-192.png",
    image: d.image,
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || "./#upnext" }
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    typeof d.badge === "number" && self.navigator.setAppBadge ? self.navigator.setAppBadge(d.badge).catch(() => { }) : null
  ]));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  try { self.navigator.clearAppBadge?.(); } catch { }
  const target = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: "open", url: target });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

// iOS peut renouveler l'abonnement : l'app le resynchronise à la prochaine ouverture (push.refresh)
self.addEventListener("pushsubscriptionchange", () => { });
