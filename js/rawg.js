// RAWG (jeux vidéo) : recherche, fiches, listes. Cache mémoire + IndexedDB.
import { RAWG_KEY } from "./config.js";
import { idbGet, idbSet } from "./tmdb.js";

const BASE = "https://api.rawg.io/api";
// Relais Playwatch (cache commun + secours IGDB quand RAWG est en panne). S'il n'est pas joignable, on appelle RAWG directement.
const PROXY = "https://europe-west1-bobine-4d524.cloudfunctions.net/games";
let proxyOff = false;
const ownKey = () => { try { return !!localStorage.getItem("bobine:rawg"); } catch { return false; } };

export function getKey() {
  try { return localStorage.getItem("bobine:rawg") || RAWG_KEY; } catch { return RAWG_KEY; }
}
export function setKey(k) { try { localStorage.setItem("bobine:rawg", k.trim()); } catch { } }

// Images RAWG redimensionnées côté serveur (beaucoup plus légères)
export function gimg(url, w = 640) {
  if (!url) return "";
  return url.replace("/media/games/", `/media/resize/${w}/-/games/`).replace("/media/screenshots/", `/media/resize/${w}/-/screenshots/`);
}

const mem = new Map(), inflight = new Map();
let active = 0; const queue = [];
const pump = () => { while (active < 4 && queue.length) { const { fn, res, rej } = queue.shift(); active++; fn().then(res, rej).finally(() => { active--; pump(); }); } };
// File d'attente (4 requêtes à la fois) ; une recherche tapée par l'utilisateur passe devant les listes de Découvrir
const schedule = (fn, prio) => new Promise((res, rej) => { queue[prio ? "unshift" : "push"]({ fn, res, rej }); pump(); });

export async function get(path, params = {}, { ttl = 24, slim, prio } = {}) {
  const key = getKey();
  if (!key) throw new Error("NO_RAWG_KEY");
  const ck = "rawg:" + path + "?" + new URLSearchParams(params).toString();
  const m = mem.get(ck); if (m && Date.now() - m.t < ttl * 3600e3) return m.v;
  const c = await idbGet(ck); if (c && Date.now() - c.t < ttl * 3600e3) { mem.set(ck, c); return c.v; }
  if (inflight.has(ck)) return inflight.get(ck);
  const p = schedule(async () => {
    if (!proxyOff && !ownKey()) {
      const pu = new URL(PROXY + path);
      for (const [k, v] of Object.entries({ ...params, _ttl: ttl })) if (v !== undefined && v !== null && v !== "") pu.searchParams.set(k, v);
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 18000);
      let r = null;
      try { r = await fetch(pu, { signal: ctl.signal }); }
      catch (e) { if (e.name === "AbortError") { const err = new Error("RAWG timeout (relais)"); err.code = "RAWG_HTTP"; throw err; } proxyOff = true; }
      finally { clearTimeout(to); }
      if (r) {
        if (r.headers.get("X-Source")) {   // réponse du relais (y compris « introuvable » ou « service en panne »)
          if (r.ok) return r.json();
          const err = new Error(`RAWG ${r.status} (relais ${r.headers.get("X-Source")})`); err.code = r.status === 404 ? "RAWG_404" : "RAWG_HTTP"; throw err;
        }
        proxyOff = true;   // relais pas encore déployé : RAWG en direct
      }
    }
    const u = new URL(BASE + path);
    for (const [k, v] of Object.entries({ ...params, key })) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), prio ? 12000 : 20000);
    const r = await fetch(u, { signal: ctl.signal }); clearTimeout(to);
    if (!r.ok) {
      // le détail de la réponse part dans le journal des plantages (limite mensuelle atteinte, clé refusée…)
      const body = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
      const err = new Error(`RAWG ${r.status}${body ? " " + body : ""}`);
      err.code = r.status === 401 || r.status === 403 ? "BAD_RAWG_KEY" : r.status === 429 ? "RAWG_LIMIT" : "RAWG_HTTP";
      throw err;
    }
    return r.json();
  }, prio).then(j => {
    const v = slim ? slim(j) : j;
    // une recherche vide n'est pas gardée en cache : si RAWG a eu un raté, on retentera à la prochaine frappe
    if (!(params.search && Array.isArray(v) && !v.length)) { const e = { t: Date.now(), v }; mem.set(ck, e); idbSet(ck, e); }
    return v;
  })
    .finally(() => inflight.delete(ck));
  inflight.set(ck, p);
  return p;
}
export async function peek(path, params = {}) {
  const ck = "rawg:" + path + "?" + new URLSearchParams(params).toString();
  const m = mem.get(ck); if (m) return m.v;
  const c = await idbGet(ck); if (c) { mem.set(ck, c); return c.v; }
  return null;
}

const slimItem = g => ({
  id: g.id, name: g.name, released: g.released, tba: g.tba, background_image: g.background_image,
  metacritic: g.metacritic, rating: g.rating, playtime: g.playtime,
  platforms: (g.parent_platforms || g.platforms || []).map(p => p.platform?.name).filter(Boolean),
  genres: (g.genres || []).map(x => x.name)
});
const slimList = j => (j.results || []).map(slimItem);
const slimGame = g => ({
  ...slimItem(g),
  platformsFull: (g.platforms || []).map(p => p.platform?.name).filter(Boolean),
  description: (g.description_raw || "").trim(),
  developers: (g.developers || []).map(d => d.name),
  publishers: (g.publishers || []).map(d => d.name),
  esrb: g.esrb_rating?.name || null,
  website: g.website || "",
  background_image_additional: g.background_image_additional || null
});

export const game = id => get(`/games/${id}`, {}, { ttl: 72, slim: slimGame });
export const screenshots = id => get(`/games/${id}/screenshots`, {}, { ttl: 168, slim: j => (j.results || []).map(s => s.image).slice(0, 8) });
// Recherche précise d'abord ; si rien ne sort (faute de frappe, accents, titre partiel), recherche élargie
export const search = async q => {
  const r = await get("/games", { search: q, page_size: 30, search_precise: "true" }, { ttl: 6, slim: slimList, prio: true });
  return r.length ? r : get("/games", { search: q, page_size: 30 }, { ttl: 6, slim: slimList, prio: true });
};
export const list = (params, ttl = 24) => get("/games", { page_size: 30, ...params }, { ttl, slim: slimList });
export const searchOne = async name => (await get("/games", { search: name, page_size: 5, search_precise: "true" }, { ttl: 720, slim: slimList }))[0] || null;
