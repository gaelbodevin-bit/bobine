// Playwatch — relais « jeux vidéo » (Google Cloud Functions 2e gén., europe-west1)
// URL : https://europe-west1-bobine-4d524.cloudfunctions.net/games/<chemin RAWG>?<paramètres RAWG>
//   ex. /games?search=zelda&page_size=30   ·   /games/3498   ·   /games/3498/screenshots
//
// 1. Cache commun (Firestore gcache/{hash}) : une réponse obtenue pour un utilisateur sert à tous.
// 2. RAWG d'abord (6 s max).
// 3. Si RAWG ne répond pas : la dernière réponse connue, même ancienne.
// 4. Sinon : IGDB (base de jeux de Twitch), converti au format RAWG. Les jeux venus d'IGDB ont un identifiant
//    décalé de IGDB_OFFSET (900 000 000 + id IGDB) pour ne jamais se mélanger aux identifiants RAWG.
import functions from "@google-cloud/functions-framework";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

initializeApp();
const db = getFirestore();
const RAWG_KEY = (process.env.RAWG_KEY || "").trim();
const IGDB_ID = (process.env.IGDB_CLIENT_ID || "").trim();
const IGDB_SECRET = (process.env.IGDB_CLIENT_SECRET || "").trim();
export const IGDB_OFFSET = 900000000;
const H = 3600e3;
const ORIGINS = [/^https:\/\/gaelbodevin-bit\.github\.io$/, /^https:\/\/(www\.)?playwatch\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

// ─────────────── Cache Firestore ───────────────
const keyOf = (path, params) => createHash("sha1").update(path + "?" + new URLSearchParams(Object.entries(params).sort()).toString()).digest("hex");
async function cacheGet(k) { try { const d = await db.doc(`gcache/${k}`).get(); return d.exists ? d.data() : null; } catch { return null; } }
async function cachePut(k, body, src) {
  if (body.length > 900000) return;   // limite d'un document Firestore
  try { await db.doc(`gcache/${k}`).set({ body, t: Date.now(), src }); } catch { }
}

// ─────────────── RAWG ───────────────
// Disjoncteur : après un échec, on n'attend plus RAWG pendant 5 min (réponse IGDB immédiate), état partagé via Firestore
let rawgDownUntil = 0, rawgCheckedAt = 0;
async function rawgIsDown() {
  if (Date.now() < rawgDownUntil) return true;
  if (Date.now() - rawgCheckedAt > 60e3) {
    rawgCheckedAt = Date.now();
    const d = await cacheGet("_rawgstatus"); if (d?.downUntil > Date.now()) { rawgDownUntil = d.downUntil; return true; }
  }
  return false;
}
function markRawgDown() { rawgDownUntil = Date.now() + 5 * 60e3; db.doc("gcache/_rawgstatus").set({ downUntil: rawgDownUntil, t: Date.now(), src: "status" }).catch(() => { }); }
async function rawg(path, params) {
  const u = new URL("https://api.rawg.io/api" + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", RAWG_KEY);
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    const body = await r.text();
    return { status: r.status, body };
  } finally { clearTimeout(to); }
}

// ─────────────── IGDB ───────────────
let igTok = null;
async function igdbToken() {
  if (igTok && igTok.exp > Date.now() + 60e3) return igTok.v;
  const saved = await cacheGet("_igdbtoken");
  if (saved?.exp > Date.now() + 60e3) { igTok = { v: saved.body, exp: saved.exp }; return igTok.v; }
  const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(IGDB_ID)}&client_secret=${encodeURIComponent(IGDB_SECRET)}&grant_type=client_credentials`, { method: "POST" });
  if (!r.ok) throw new Error("Twitch token " + r.status);
  const j = await r.json();
  igTok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  db.doc("gcache/_igdbtoken").set({ body: igTok.v, exp: igTok.exp, t: Date.now(), src: "token" }).catch(() => { });
  return igTok.v;
}
async function igdb(query) {
  const tok = await igdbToken();
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch("https://api.igdb.com/v4/games", { method: "POST", signal: ctl.signal, headers: { "Client-ID": IGDB_ID, Authorization: "Bearer " + tok, Accept: "application/json" }, body: query });
    if (r.status === 401) igTok = null;
    if (!r.ok) throw new Error("IGDB " + r.status + " " + (await r.text()).slice(0, 200));
    return r.json();
  } finally { clearTimeout(to); }
}

// Correspondances RAWG → IGDB
const PLAT = { // familles RAWG (parent_platforms) → plateformes IGDB
  1: [6], 2: [7, 8, 9, 38, 46, 48, 167], 3: [11, 12, 49, 169], 7: [4, 5, 18, 19, 20, 21, 37, 41, 130], 4: [39], 8: [34], 5: [14], 6: [3]
};
const FAMILY = {}; // plateforme IGDB → nom de famille RAWG
for (const [f, ids] of Object.entries({ PC: [6], PlayStation: PLAT[2], Xbox: PLAT[3], Nintendo: PLAT[7], iOS: [39], Android: [34], "Apple Macintosh": [14], Linux: [3] })) ids.forEach(i => FAMILY[i] = f);
const PNAME = { 6: "PC", 167: "PlayStation 5", 48: "PlayStation 4", 9: "PlayStation 3", 8: "PlayStation 2", 7: "PlayStation", 46: "PS Vita", 38: "PSP", 169: "Xbox Series S/X", 49: "Xbox One", 12: "Xbox 360", 11: "Xbox", 130: "Nintendo Switch", 41: "Wii U", 5: "Wii", 37: "Nintendo 3DS", 20: "Nintendo DS", 39: "iOS", 34: "Android", 14: "macOS", 3: "Linux" };
const GENRE_IN = { // slug RAWG → { genres IGDB } ou { themes IGDB } ou { modes IGDB }
  action: { themes: [1] }, adventure: { genres: [31, 2] }, "role-playing-games-rpg": { genres: [12] }, shooter: { genres: [5] },
  strategy: { genres: [15, 11, 16, 24] }, simulation: { genres: [13] }, puzzle: { genres: [9] }, platformer: { genres: [8] },
  racing: { genres: [10] }, sports: { genres: [14] }, fighting: { genres: [4] }, indie: { genres: [32] }, arcade: { genres: [33] },
  "massively-multiplayer": { modes: [5] }, family: { themes: [41] }, casual: { genres: [26, 35] }, card: { genres: [35] }, educational: { themes: [34] }
};
const GENRE_OUT = {
  "Role-playing (RPG)": "RPG", Platform: "Platformer", Simulator: "Simulation", Sport: "Sports", "Real Time Strategy (RTS)": "Strategy",
  "Turn-based strategy (TBS)": "Strategy", Tactical: "Strategy", "Hack and slash/Beat 'em up": "Action", "Point-and-click": "Adventure",
  "Card & Board Game": "Card", "Quiz/Trivia": "Casual", "Visual Novel": "Adventure", "MOBA": "Strategy"
};
const FIELDS = "fields name,slug,first_release_date,cover.image_id,artworks.image_id,screenshots.image_id,platforms,genres.name,themes,aggregated_rating,total_rating,total_rating_count,hypes";
const img = (id, size) => id ? `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg` : null;
const day = s => s ? new Date(s * 1000).toISOString().slice(0, 10) : null;
const uniq = a => [...new Set(a)];

export function toRawg(g) {
  const plats = g.platforms || [];
  return {
    id: IGDB_OFFSET + g.id, slug: g.slug, name: g.name,
    released: day(g.first_release_date), tba: !g.first_release_date,
    background_image: img(g.artworks?.[0]?.image_id, "t_screenshot_big") || img(g.screenshots?.[0]?.image_id, "t_screenshot_big") || img(g.cover?.image_id, "t_cover_big"),
    metacritic: g.aggregated_rating ? Math.round(g.aggregated_rating) : null,
    rating: g.total_rating ? Math.round(g.total_rating / 2) / 10 : 0,
    playtime: 0,
    parent_platforms: uniq(plats.map(p => FAMILY[p]).filter(Boolean)).map(name => ({ platform: { name } })),
    platforms: plats.map(p => ({ platform: { name: PNAME[p] || null } })).filter(p => p.platform.name),
    genres: uniq((g.genres || []).map(x => GENRE_OUT[x.name] || x.name)).map(name => ({ name })),
    source: "igdb"
  };
}

// Traduit une requête de liste RAWG en requête IGDB
export function igdbListQuery(params) {
  const w = ["version_parent = null"], now = Math.floor(Date.now() / 1000);
  const size = Math.min(+params.page_size || 30, 50);
  if (params.dates) {
    const [a, b] = String(params.dates).split(",");
    if (a) w.push(`first_release_date >= ${Math.floor(Date.parse(a + "T00:00:00Z") / 1000)}`);
    if (b) w.push(`first_release_date <= ${Math.floor(Date.parse(b + "T23:59:59Z") / 1000)}`);
  }
  if (params.metacritic) { const [lo, hi] = String(params.metacritic).split(","); if (lo) w.push(`aggregated_rating >= ${+lo}`); if (hi && +hi < 100) w.push(`aggregated_rating <= ${+hi}`); }
  const pp = String(params.parent_platforms || params.platforms || "").split(",").filter(Boolean).flatMap(f => PLAT[f] || []);
  if (pp.length) w.push(`platforms = (${uniq(pp).join(",")})`);
  const gs = String(params.genres || "").split(",").filter(Boolean).map(s => GENRE_IN[s]).filter(Boolean);
  if (gs.length) {
    const ors = gs.map(m => m.genres ? `genres = (${m.genres.join(",")})` : m.themes ? `themes = (${m.themes.join(",")})` : `game_modes = (${m.modes.join(",")})`);
    w.push(ors.length > 1 ? `(${ors.join(" | ")})` : ors[0]);
  }
  if (params.search) {
    // IGDB n'accepte pas « sort » avec « search » : la pertinence fait foi
    return `${FIELDS}; search "${String(params.search).replace(/["\\]/g, " ").slice(0, 80)}"; where ${w.join(" & ")}; limit ${size};`;
  }
  let sort = "total_rating_count desc";
  const o = String(params.ordering || "-added");
  const future = params.dates && Date.parse(String(params.dates).split(",")[0] + "T00:00:00Z") / 1000 > now - 86400;
  if (o === "-metacritic" || o === "-rating") { sort = "aggregated_rating desc"; w.push("aggregated_rating_count >= 3"); }
  else if (o === "-released") { sort = "first_release_date desc"; w.push(`first_release_date <= ${now}`); }
  else if (future) { sort = "hypes desc"; }
  else w.push("total_rating_count >= 1");
  return `${FIELDS}; where ${w.join(" & ")}; sort ${sort}; limit ${size};`;
}

async function igdbAnswer(path, params) {
  const m = path.match(/^\/games\/(\d+)(\/screenshots)?$/);
  if (m) {
    const id = +m[1] - (+m[1] >= IGDB_OFFSET ? IGDB_OFFSET : 0);
    if (+m[1] < IGDB_OFFSET) return null;   // une fiche RAWG ne se retrouve pas dans IGDB par son numéro
    const [g] = await igdb(`${FIELDS},summary,storyline,websites.url,involved_companies.company.name,involved_companies.developer,involved_companies.publisher; where id = ${id};`);
    if (!g) return { status: 404, body: JSON.stringify({ detail: "Not found." }) };
    if (m[2]) return { status: 200, body: JSON.stringify({ results: (g.screenshots || []).map(s => ({ image: img(s.image_id, "t_screenshot_big") })) }) };
    const comp = role => uniq((g.involved_companies || []).filter(c => c[role]).map(c => c.company?.name).filter(Boolean)).map(name => ({ name }));
    return { status: 200, body: JSON.stringify({ ...toRawg(g), description_raw: g.summary || g.storyline || "", developers: comp("developer"), publishers: comp("publisher"), website: g.websites?.[0]?.url || "", esrb_rating: null, background_image_additional: img(g.screenshots?.[1]?.image_id, "t_screenshot_big") }) };
  }
  if (path === "/games") {
    let list = await igdb(igdbListQuery(params));
    // recherche « précise » : on garde d'abord les titres qui contiennent tous les mots tapés
    if (params.search && params.search_precise) {
      const words = String(params.search).toLowerCase().split(/\s+/).filter(Boolean);
      const hit = list.filter(g => words.every(x => g.name.toLowerCase().includes(x)));
      if (hit.length) list = hit;
    }
    return { status: 200, body: JSON.stringify({ count: list.length, results: list.map(toRawg) }) };
  }
  return null;
}

// ─────────────── Point d'entrée ───────────────
const ttlFor = (path, params) => {
  const hint = Math.min(Math.max(+params._ttl || 0, 1), 168);
  if (hint) return hint * H;
  if (/\/screenshots$/.test(path)) return 168 * H;
  if (/^\/games\/\d+$/.test(path)) return 72 * H;
  return params.search ? 6 * H : 24 * H;
};

export async function handle(path, query) {
  const params = { ...query }; delete params.key;
  const ttl = ttlFor(path, params); delete params._ttl;
  if (!/^\/games(\/\d+(\/screenshots)?)?$/.test(path)) return { status: 404, body: '{"detail":"Not found."}', src: "none" };
  const k = keyOf(path, params);
  const c = await cacheGet(k);
  if (c && Date.now() - c.t < (c.src === "igdb" ? Math.min(ttl, 2 * H) : ttl)) return { status: 200, body: c.body, src: "cache-" + c.src };
  const isIgdbId = (path.match(/^\/games\/(\d+)/) || [])[1] >= IGDB_OFFSET;
  if (!isIgdbId) {
    if (!(await rawgIsDown())) {
      try {
        const r = await rawg(path, params);
        if (r.status === 200) { cachePut(k, r.body, "rawg"); return { ...r, src: "rawg" }; }
        if (r.status === 404) return { ...r, src: "rawg" };
        if (r.status >= 500 || r.status === 429) markRawgDown();
      } catch { markRawgDown(); /* RAWG injoignable : on continue */ }
    }
    if (c) return { status: 200, body: c.body, src: "stale-" + c.src };
  }
  if (IGDB_ID && IGDB_SECRET) {
    try {
      const r = await igdbAnswer(path, params);
      if (r) { if (r.status === 200) cachePut(k, r.body, "igdb"); return { ...r, src: "igdb" }; }
    } catch (e) { console.error("igdb", e.message); }
  }
  return { status: 502, body: '{"detail":"Le service de jeux vidéo ne répond pas."}', src: "none" };
}

functions.http("games", async (req, res) => {
  const origin = req.get("origin") || "";
  if (ORIGINS.some(r => r.test(origin))) { res.set("Access-Control-Allow-Origin", origin); res.set("Vary", "Origin"); }
  if (req.method === "OPTIONS") { res.set("Access-Control-Allow-Methods", "GET"); res.set("Access-Control-Max-Age", "86400"); return res.status(204).send(""); }
  if (req.method !== "GET") return res.status(405).send("");
  // Réservé à l'appli (navigateur sur les adresses autorisées) — limite les abus de la clé RAWG
  if (origin && !ORIGINS.some(r => r.test(origin))) return res.status(403).send("");
  const out = await handle(req.path.replace(/\/+$/, "") || "/", req.query || {});
  res.set("X-Source", out.src);
  res.set("Access-Control-Expose-Headers", "X-Source");
  res.set("Cache-Control", out.status === 200 ? "public, max-age=600" : "no-store");
  res.status(out.status).type("application/json").send(out.body);
});
