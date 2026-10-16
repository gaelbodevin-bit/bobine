// Bobine — notifier (GitHub Actions, 2×/jour)
// Lit les séries/films de chaque utilisateur abonné aux push, interroge TMDB,
// et envoie une notification pour chaque nouvel épisode / sortie de film.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import webpush from "web-push";

const env = process.env;
const need = k => { if (!env[k]) { console.error(`Secret manquant : ${k}`); process.exit(1); } return env[k]; };
const SA = JSON.parse(need("FIREBASE_SERVICE_ACCOUNT"));
const TMDB_KEY = need("TMDB_KEY").trim();
webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:bobine@example.com", need("VAPID_PUBLIC_KEY").trim(), need("VAPID_PRIVATE_KEY").trim());
const TEST = env.TEST === "true";
const LOOKBACK = +(env.LOOKBACK_DAYS || 2);   // épisodes sortis depuis N jours
const APP_URL = (env.APP_URL || "./").replace(/\/?$/, "/");

initializeApp({ credential: cert(SA) });
const db = getFirestore();

// ── Dates (fuseau du runner = TZ, Europe/Paris par défaut dans le workflow) ──
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const TODAY = iso(new Date());
const SINCE = iso(new Date(Date.now() - LOOKBACK * 864e5));
const SE = (s, e) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;

// ── TMDB avec cache mémoire et limiteur ──
const cache = new Map();
let active = 0; const q = [];
const slot = () => new Promise(r => { if (active < 8) { active++; r(); } else q.push(r); });
const free = () => { const n = q.shift(); n ? n() : active--; };
async function tmdb(path, params = {}) {
  const k = path + JSON.stringify(params);
  if (cache.has(k)) return cache.get(k);
  const p = (async () => {
    await slot();
    try {
      const u = new URL("https://api.themoviedb.org/3" + path);
      u.searchParams.set("language", "fr-FR");
      for (const [a, b] of Object.entries(params)) u.searchParams.set(a, b);
      const bearer = TMDB_KEY.startsWith("eyJ");
      if (!bearer) u.searchParams.set("api_key", TMDB_KEY);
      for (let i = 0; i < 4; i++) {
        const r = await fetch(u, { headers: bearer ? { Authorization: "Bearer " + TMDB_KEY } : {} });
        if (r.status === 429) { await new Promise(s => setTimeout(s, 1500 * (i + 1))); continue; }
        if (!r.ok) throw new Error(`TMDB ${r.status} ${path}`);
        return r.json();
      }
      throw new Error("TMDB 429");
    } finally { free(); }
  })();
  cache.set(k, p);
  return p;
}

const watched = (show, s, e) => !!show.watched?.[s]?.includes(e);
const IMG = "https://image.tmdb.org/t/p/";

// ── Envoi ──
let sent = 0, dead = 0;
async function send(subs, payload) {
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.data.endpoint, keys: s.data.keys }, body, { TTL: 86400, urgency: "normal" });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { dead++; await s.ref.delete(); }
      else console.warn("push err", e.statusCode, e.body || e.message);
    }
  }));
}

// ── Par utilisateur ──
async function runUser(uid, subs) {
  if (TEST) {
    await send(subs, { title: "Bobine 🎬", body: "Notification de test envoyée par le serveur. Tout fonctionne !", url: APP_URL + "#upnext", tag: "test" });
    return;
  }
  const [showsSnap, moviesSnap] = await Promise.all([
    db.collection(`users/${uid}/shows`).get(),
    db.collection(`users/${uid}/movies`).where("status", "==", "watchlist").get()
  ]);
  const notes = []; let badge = 0;

  await Promise.all(showsSnap.docs.map(async d => {
    const show = d.data();
    if (show.status === "stopped") return;
    try {
      const t = await tmdb(`/tv/${show.id}`);
      const la = t.last_episode_to_air;
      if (!la?.air_date || la.air_date < SINCE) {
        return;
      }
      const sea = await tmdb(`/tv/${show.id}/season/${la.season_number}`);
      const fresh = (sea.episodes || []).filter(e => e.air_date && e.air_date >= SINCE && e.air_date <= TODAY && !watched(show, e.season_number, e.episode_number));
      if (fresh.length) badge++;
      const already = new Set(show.notified || []);
      const todo = fresh.filter(e => !already.has(SE(e.season_number, e.episode_number)));
      if (!todo.length) return;
      const first = todo[0], last = todo.at(-1);
      const name = (e) => e.name && !/^Épisode \d+$/.test(e.name) ? ` · ${e.name}` : "";
      notes.push({
        kind: "tv", name: t.name,
        payload: {
          title: t.name,
          body: todo.length === 1
            ? `Nouvel épisode : ${SE(first.season_number, first.episode_number)}${name(first)}`
            : `${todo.length} nouveaux épisodes : ${SE(first.season_number, first.episode_number)} → ${SE(last.season_number, last.episode_number)}`,
          image: first.still_path ? IMG + "w780" + first.still_path : (t.backdrop_path ? IMG + "w780" + t.backdrop_path : undefined),
          icon: t.poster_path ? IMG + "w185" + t.poster_path : undefined,
          url: APP_URL + "#tv-" + show.id,
          tag: "tv-" + show.id
        },
        mark: () => d.ref.update({ notified: [...already, ...todo.map(e => SE(e.season_number, e.episode_number))].slice(-60) })
      });
    } catch (e) { console.warn(uid, show.id, e.message); }
  }));

  await Promise.all(moviesSnap.docs.map(async d => {
    const m = d.data();
    try {
      const det = await tmdb(`/movie/${m.id}`, { append_to_response: "release_dates" });
      const fr = det.release_dates?.results?.find(r => r.iso_3166_1 === "FR");
      const us = det.release_dates?.results?.find(r => r.iso_3166_1 === "US");
      const pick = (src, ty) => src?.release_dates?.find(x => x.type === ty)?.release_date?.slice(0, 10);
      const rel = [
        ["cine", pick(fr, 3) || pick(fr, 2) || (!fr ? det.release_date : null), "sort aujourd'hui au cinéma 🍿"],
        ["digital", pick(fr, 4) || pick(us, 4), "est disponible en VOD / streaming 📺"]
      ];
      const already = new Set(m.notified || []);
      for (const [k, date, txt] of rel) {
        if (!date || date < SINCE || date > TODAY || already.has(k)) continue;
        notes.push({
          kind: "movie", name: det.title,
          payload: { title: det.title, body: `${det.title} ${txt}`, image: det.backdrop_path ? IMG + "w780" + det.backdrop_path : undefined, icon: det.poster_path ? IMG + "w185" + det.poster_path : undefined, url: APP_URL + "#mv-" + m.id, tag: `mv-${m.id}-${k}` },
          mark: () => d.ref.update({ notified: FieldValue.arrayUnion(k) })
        });
      }
    } catch (e) { console.warn(uid, "movie", m.id, e.message); }
  }));

  if (!notes.length) return;
  // Beaucoup de nouveautés d'un coup → une seule notification récapitulative
  if (notes.length > 4) {
    const names = notes.map(n => n.name);
    await send(subs, {
      title: `${notes.length} nouveautés dans Bobine`,
      body: names.slice(0, 5).join(", ") + (names.length > 5 ? ` et ${names.length - 5} autres` : ""),
      url: APP_URL + "#upnext", tag: "digest", badge
    });
  } else {
    for (const n of notes) await send(subs, { ...n.payload, badge });
  }
  await Promise.all(notes.map(n => n.mark()));
  console.log(`${uid}: ${notes.length} notification(s)`);
}

// ── Main ──
const pushSnap = await db.collectionGroup("push").get();
const byUser = new Map();
for (const d of pushSnap.docs) {
  const uid = d.ref.parent.parent.id;
  if (!byUser.has(uid)) byUser.set(uid, []);
  byUser.get(uid).push({ ref: d.ref, data: d.data() });
}
console.log(`${TODAY} — ${byUser.size} utilisateur(s), ${pushSnap.size} appareil(s), fenêtre depuis ${SINCE}${TEST ? " [TEST]" : ""}`);
for (const [uid, subs] of byUser) {
  try { await runUser(uid, subs); } catch (e) { console.error(uid, e); }
}
console.log(`Envoyées : ${sent}, abonnements expirés supprimés : ${dead}`);
process.exit(0);
