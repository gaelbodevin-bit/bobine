// RAWG (jeux vidéo) : recherche, fiches, listes. Cache mémoire + IndexedDB.
import { RAWG_KEY } from "./config.js";
import { idbGet, idbSet } from "./tmdb.js";

const BASE = "https://api.rawg.io/api";

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
const schedule = fn => new Promise((res, rej) => { queue.push({ fn, res, rej }); pump(); });

export async function get(path, params = {}, { ttl = 24, slim } = {}) {
  const key = getKey();
  if (!key) throw new Error("NO_RAWG_KEY");
  const ck = "rawg:" + path + "?" + new URLSearchParams(params).toString();
  const m = mem.get(ck); if (m && Date.now() - m.t < ttl * 3600e3) return m.v;
  const c = await idbGet(ck); if (c && Date.now() - c.t < ttl * 3600e3) { mem.set(ck, c); return c.v; }
  if (inflight.has(ck)) return inflight.get(ck);
  const p = schedule(async () => {
    const u = new URL(BASE + path);
    for (const [k, v] of Object.entries({ ...params, key })) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(u, { signal: ctl.signal }); clearTimeout(to);
    if (r.status === 401 || r.status === 403) throw new Error("BAD_RAWG_KEY");
    if (!r.ok) throw new Error("RAWG " + r.status);
    return r.json();
  }).then(j => { const v = slim ? slim(j) : j; const e = { t: Date.now(), v }; mem.set(ck, e); idbSet(ck, e); return v; })
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
export const search = q => get("/games", { search: q, page_size: 30, search_precise: "true" }, { ttl: 6, slim: slimList });
export const list = (params, ttl = 24) => get("/games", { page_size: 30, ...params }, { ttl, slim: slimList });
export const searchOne = async name => (await get("/games", { search: name, page_size: 5, search_precise: "true" }, { ttl: 720, slim: slimList }))[0] || null;
