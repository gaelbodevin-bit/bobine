// Playwatch — service worker : cache hors-ligne + notifications push
const VERSION = "bobine-v46";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/config.js", "./js/tmdb.js", "./js/store.js", "./js/push.js", "./js/import-tvtime.js", "./js/rawg.js", "./js/premium.js", "./js/i18n.js", "./js/i18n-en.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];
const IMG_CACHE = "bobine-img";
// Firebase (chargé depuis gstatic) : gardé sur le téléphone pour pouvoir ouvrir l'app sans réseau.
// Les URL sont versionnées (le contenu ne change jamais) → cache d'abord. Garder FB_V aligné sur js/store.js.
const LIB_CACHE = "bobine-lib";
const FB_V = "12.19.0";
const LIBS = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(f => `https://www.gstatic.com/firebasejs/${FB_V}/${f}`);
const IMG_MAX = 600;
let slowUntil = 0;   // réseau lent repéré : on sert la copie locale sans attendre pendant 15 s

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    caches.open(VERSION).then(c => c.addAll(SHELL)),
    // au mieux : un échec ici (réseau) ne doit pas bloquer la mise à jour de l'app
    caches.open(LIB_CACHE).then(c => Promise.all(LIBS.map(u => c.match(u).then(hit => hit || c.add(new Request(u, { mode: "cors" }))).catch(() => { }))))
  ]).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== IMG_CACHE && k !== LIB_CACHE) await caches.delete(k);
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

  // Firebase : cache d'abord (fichiers versionnés), réseau sinon
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith((async () => {
      const c = await caches.open(LIB_CACHE);
      const hit = await c.match(req, { ignoreVary: true }) || await c.match(url.href, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(url.href, res.clone()).catch(() => { });
      return res;
    })());
    return;
  }

  // App : réseau d'abord (mises à jour immédiates), mais si le réseau traîne plus de 3 s on sert la copie locale
  // pour ne jamais rester bloqué sur le logo ; la réponse réseau, quand elle arrive, met la copie à jour.
  if (url.origin === location.origin) {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => { }); }
      return res;
    });
    e.waitUntil(net.then(() => { }, () => { }));
    e.respondWith((async () => {
      const local = () => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : null)).catch(() => null);
      // Réseau déjà repéré comme lent : copie locale tout de suite pour les fichiers suivants
      if (Date.now() < slowUntil) { const c = await local(); if (c) return c; }
      try {
        return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("lent")), 3000))]);
      } catch {
        slowUntil = Date.now() + 15000;
        const c = await local();
        if (c) return c;
        try { return await net; } catch { return Response.error(); }
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
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Playwatch", body: e.data && e.data.text() }; }
  const title = d.title || "Playwatch";
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
