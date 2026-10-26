// Playwatch — calendrier abonnable (.ics), fonction Cloud Run (Google Cloud Functions 2e gén.)
// URL : https://europe-west1-bobine-4d524.cloudfunctions.net/calendar/<lien secret>.ics
// Le lien secret (calToken) est créé dans l'app (Paramètres → Calendrier) et stocké dans users/{uid}.
// Contenu : épisodes des séries suivies (30 jours en arrière → 4 mois en avant), sorties FR des films « à voir »,
// sorties des jeux attendus. Réservé à Premium. Respecte le mode sans spoiler. Mis en cache 6 h (calcache/{token}).
import functions from "@google-cloud/functions-framework";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();
const TMDB_KEY = (process.env.TMDB_KEY || "").trim();
const APP_URL = "https://gaelbodevin-bit.github.io/bobine/";
const DAY = 864e5, TTL = 6 * 3600e3;
const SE = (s, e) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
const iso = t => new Date(t).toISOString().slice(0, 10);

// ── TMDB (limiteur simple) ──
let active = 0; const waiting = [];
const slot = () => new Promise(r => { if (active < 8) { active++; r(); } else waiting.push(r); });
const free = () => { const n = waiting.shift(); n ? n() : active--; };
async function tmdb(path, params = {}) {
  await slot();
  try {
    const u = new URL("https://api.themoviedb.org/3" + path);
    u.searchParams.set("language", "fr-FR");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const bearer = TMDB_KEY.startsWith("eyJ");
    if (!bearer) u.searchParams.set("api_key", TMDB_KEY);
    for (let i = 0; i < 3; i++) {
      const r = await fetch(u, { headers: bearer ? { Authorization: "Bearer " + TMDB_KEY } : {} });
      if (r.status === 429) { await new Promise(s => setTimeout(s, 1200 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`TMDB ${r.status} ${path}`);
      return r.json();
    }
    throw new Error("TMDB 429");
  } finally { free(); }
}

// ── iCalendar ──
const esc = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Lignes de 75 octets max (UTF-8), sans couper un caractère
function fold(line) {
  const out = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
function vcal(events, name = "Playwatch") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Blue Cell Production//Playwatch//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`, "X-WR-CALDESC:Sorties de tes séries\\, films et jeux (Playwatch)", "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  for (const e of events) {
    const d = e.date.replace(/-/g, ""), end = iso(Date.parse(e.date + "T12:00:00Z") + DAY).replace(/-/g, "");
    L.push("BEGIN:VEVENT", `UID:${e.uid}@playwatch`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(e.title)}`, ...(e.desc ? [`DESCRIPTION:${esc(e.desc)}`] : []), ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

// ── Construction du calendrier d'un utilisateur ──
async function build(uid, nospoil) {
  const now = Date.now(), from = iso(now - 30 * DAY), to = iso(now + 120 * DAY);
  const inWin = d => d && d >= from && d <= to;
  const events = [];
  const [shows, movies, games] = await Promise.all([
    db.collection(`users/${uid}/shows`).get(),
    db.collection(`users/${uid}/movies`).where("status", "==", "watchlist").get(),
    db.collection(`users/${uid}/games`).get()
  ]);

  await Promise.all(shows.docs.map(async doc => {
    const s = doc.data();
    if (s.deleted || s.status === "stopped") return;
    try {
      const t = await tmdb(`/tv/${s.id}`);
      const la = t.last_episode_to_air, nx = t.next_episode_to_air;
      if (!inWin(la?.air_date) && !nx) return;
      const ns = new Set([la?.season_number, nx?.season_number].filter(n => n > 0));
      for (const n of ns) {
        const sea = await tmdb(`/tv/${s.id}/season/${n}`);
        for (const e of sea.episodes || []) {
          if (!inWin(e.air_date)) continue;
          const seen = !!s.watched?.[n]?.includes(e.episode_number);
          const hide = nospoil && !seen;
          const title = !hide && e.name && !/^Épisode \d+$/.test(e.name) ? ` · ${e.name}` : "";
          events.push({
            uid: `tv-${s.id}-${n}-${e.episode_number}`, date: e.air_date,
            title: `${t.name} — ${SE(n, e.episode_number)}${title}`,
            desc: [t.networks?.[0]?.name, !hide && e.overview ? e.overview : "", seen ? "✓ Déjà vu" : ""].filter(Boolean).join("\n\n"),
            url: `${APP_URL}#tv-${s.id}`
          });
        }
      }
    } catch (e) { console.warn("série", s.id, e.message); }
  }));

  await Promise.all(movies.docs.map(async doc => {
    const m = doc.data();
    if (m.deleted) return;
    try {
      const d = await tmdb(`/movie/${m.id}`, { append_to_response: "release_dates" });
      const fr = d.release_dates?.results?.find(r => r.iso_3166_1 === "FR");
      const us = d.release_dates?.results?.find(r => r.iso_3166_1 === "US");
      const pick = (src, ty) => src?.release_dates?.find(x => x.type === ty)?.release_date?.slice(0, 10);
      const cine = pick(fr, 3) || pick(fr, 2) || (!fr ? d.release_date : null), vod = pick(fr, 4) || pick(us, 4);
      if (inWin(cine)) events.push({ uid: `mv-${m.id}-cine`, date: cine, title: `🎬 ${d.title} — au cinéma`, desc: d.overview || "", url: `${APP_URL}#mv-${m.id}` });
      if (inWin(vod)) events.push({ uid: `mv-${m.id}-vod`, date: vod, title: `📺 ${d.title} — en VOD / streaming`, desc: d.overview || "", url: `${APP_URL}#mv-${m.id}` });
    } catch (e) { console.warn("film", m.id, e.message); }
  }));

  for (const doc of games.docs) {
    const g = doc.data();
    if (g.deleted || !["wishlist", "backlog", "paused"].includes(g.status) || !inWin(g.released)) continue;
    events.push({ uid: `gm-${g.id}`, date: g.released, title: `🎮 ${g.name} — sortie`, url: `${APP_URL}#gm-${g.id}` });
  }
  events.sort((a, b) => a.date < b.date ? -1 : 1);
  return vcal(events.slice(0, 1500));
}

// ── Point d'entrée HTTP ──
const mem = new Map();   // cache mémoire de l'instance
functions.http("calendar", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).send("Méthode non autorisée");
  const token = (String(req.path || "").match(/([A-Za-z0-9_-]{16,64})(?:\.ics)?\/?$/) || [])[1] || String(req.query.t || "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return res.status(404).send("Calendrier introuvable");
  try {
    const send = ics => { res.set("Content-Type", "text/calendar; charset=utf-8"); res.set("Cache-Control", "private, max-age=1800"); res.set("Content-Disposition", 'inline; filename="playwatch.ics"'); res.status(200).send(ics); };
    const hit = mem.get(token);
    if (hit && Date.now() - hit.at < 30 * 60e3) return send(hit.ics);

    const u = await db.collection("users").where("calToken", "==", token).limit(1).get();
    if (u.empty) return res.status(404).send("Calendrier introuvable (lien remplacé ou supprimé)");
    const uid = u.docs[0].id, nospoil = !!u.docs[0].data().nospoil;
    const ent = await db.doc(`entitlements/${uid}`).get();
    if (!ent.data()?.premium) {
      return send(vcal([{ uid: "premium", date: iso(Date.now()), title: "Calendrier Playwatch : Premium requis", desc: "Le calendrier abonnable fait partie de Playwatch Premium.", url: APP_URL }]));
    }
    const ref = db.doc(`calcache/${token}`);
    const c = (await ref.get()).data();
    let ics;
    if (c && c.uid === uid && c.nospoil === nospoil && Date.now() - c.at < TTL) ics = c.ics;
    else {
      ics = await build(uid, nospoil);
      if (Buffer.byteLength(ics) < 900000) await ref.set({ uid, at: Date.now(), nospoil, ics }).catch(e => console.warn("cache", e.message));
    }
    mem.set(token, { at: Date.now(), ics });
    send(ics);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur temporaire, réessaie plus tard");
  }
});
export { vcal, fold };
