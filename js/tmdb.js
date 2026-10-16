// TMDB client : cache IndexedDB, file d'attente, objets allégés, repli anglais.
import { TMDB_KEY, LANG, REGION } from "./config.js";

const BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p/";
export const img = (path, size = "w342") => (path ? IMG + size + path : "");

export function getKey() {
  try { return localStorage.getItem("bobine:tmdb") || TMDB_KEY; } catch { return TMDB_KEY; }
}
export function setKey(k) { try { localStorage.setItem("bobine:tmdb", k.trim()); } catch {} }

// ── Mini IndexedDB clé/valeur ───────────────────────────────
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open("bobine-cache", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch(() => null);
  return dbp;
}
async function idbGet(k) {
  const d = await db(); if (!d) return null;
  return new Promise(res => {
    const r = d.transaction("kv").objectStore("kv").get(k);
    r.onsuccess = () => res(r.result || null); r.onerror = () => res(null);
  });
}
async function idbSet(k, v) {
  const d = await db(); if (!d) return;
  return new Promise(res => {
    const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k);
    t.oncomplete = res; t.onerror = res;
  });
}
export async function clearCache() {
  const d = await db(); if (!d) return;
  return new Promise(res => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").clear(); t.oncomplete = res; });
}

// ── File d'attente (TMDB ~40 req/s, on reste sage) ──────────
const MAX = 6; let active = 0; const queue = [];
function schedule(fn) {
  return new Promise((res, rej) => { queue.push({ fn, res, rej }); pump(); });
}
function pump() {
  while (active < MAX && queue.length) {
    const { fn, res, rej } = queue.shift(); active++;
    fn().then(res, rej).finally(() => { active--; pump(); });
  }
}

const mem = new Map();
const inflight = new Map();

async function raw(path, params = {}, attempt = 0) {
  const key = getKey();
  if (!key) throw new Error("NO_KEY");
  const u = new URL(BASE + path);
  const p = { language: LANG, ...params };
  const bearer = key.startsWith("eyJ");
  if (!bearer) p.api_key = key;
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: bearer ? { Authorization: "Bearer " + key, accept: "application/json" } : { accept: "application/json" } });
  if (r.status === 429 && attempt < 3) { await new Promise(s => setTimeout(s, 1200 * (attempt + 1))); return raw(path, params, attempt + 1); }
  if (r.status === 401) throw new Error("BAD_KEY");
  if (!r.ok) throw new Error("TMDB " + r.status);
  return r.json();
}

// get avec cache (ttl en heures). opts.fresh = ignore cache. opts.slim = fonction d'allègement.
export async function get(path, params = {}, { ttl = 12, fresh = false, slim } = {}) {
  const ck = path + "?" + new URLSearchParams(params).toString();
  if (!fresh) {
    const m = mem.get(ck);
    if (m && Date.now() - m.t < ttl * 3600e3) return m.v;
    const c = await idbGet(ck);
    if (c && Date.now() - c.t < ttl * 3600e3) { mem.set(ck, c); return c.v; }
  }
  if (inflight.has(ck)) return inflight.get(ck);
  const p = schedule(() => raw(path, params)).then(j => {
    const v = slim ? slim(j) : j;
    const e = { t: Date.now(), v };
    mem.set(ck, e); idbSet(ck, e);
    return v;
  }).finally(() => inflight.delete(ck));
  inflight.set(ck, p);
  return p;
}

// Version "stale-while-revalidate" : renvoie le cache tout de suite (même périmé) + rafraîchit.
export async function peek(path, params = {}) {
  const ck = path + "?" + new URLSearchParams(params).toString();
  const m = mem.get(ck); if (m) return m.v;
  const c = await idbGet(ck); if (c) { mem.set(ck, c); return c.v; }
  return null;
}

// ── Allègement ──────────────────────────────────────────────
const slimEp = e => e ? ({
  id: e.id, name: e.name, overview: e.overview, air_date: e.air_date,
  season_number: e.season_number, episode_number: e.episode_number,
  still_path: e.still_path, runtime: e.runtime, vote_average: e.vote_average
}) : null;

const slimTv = t => ({
  id: t.id, name: t.name, original_name: t.original_name, overview: t.overview, tagline: t.tagline,
  poster_path: t.poster_path, backdrop_path: t.backdrop_path,
  first_air_date: t.first_air_date, last_air_date: t.last_air_date,
  status: t.status, in_production: t.in_production,
  genres: (t.genres || []).map(g => g.name),
  networks: (t.networks || []).map(n => n.name),
  episode_run_time: t.episode_run_time || [],
  number_of_seasons: t.number_of_seasons, number_of_episodes: t.number_of_episodes,
  vote_average: t.vote_average,
  seasons: (t.seasons || []).map(s => ({ season_number: s.season_number, episode_count: s.episode_count, air_date: s.air_date, name: s.name, poster_path: s.poster_path })),
  last_episode_to_air: slimEp(t.last_episode_to_air),
  next_episode_to_air: slimEp(t.next_episode_to_air),
  external_ids: t.external_ids ? { imdb_id: t.external_ids.imdb_id, tvdb_id: t.external_ids.tvdb_id } : undefined,
  cast: t.aggregate_credits ? t.aggregate_credits.cast.slice(0, 12).map(c => ({ name: c.name, character: c.roles?.[0]?.character, profile_path: c.profile_path })) : undefined
});

const slimSeason = s => ({
  season_number: s.season_number, name: s.name, overview: s.overview, air_date: s.air_date, poster_path: s.poster_path,
  episodes: (s.episodes || []).map(slimEp)
});

const slimMovie = m => ({
  id: m.id, title: m.title, original_title: m.original_title, overview: m.overview, tagline: m.tagline,
  poster_path: m.poster_path, backdrop_path: m.backdrop_path, release_date: m.release_date,
  runtime: m.runtime, genres: (m.genres || []).map(g => g.name), vote_average: m.vote_average,
  imdb_id: m.imdb_id, status: m.status,
  release_fr: m.release_dates ? frReleases(m.release_dates) : undefined,
  cast: m.credits ? m.credits.cast.slice(0, 12).map(c => ({ name: c.name, character: c.character, profile_path: c.profile_path })) : undefined
});

// Dates de sortie FR : 3 = cinéma, 4 = numérique, 5 = physique, 6 = TV
function frReleases(rd) {
  const fr = (rd.results || []).find(r => r.iso_3166_1 === REGION);
  const us = (rd.results || []).find(r => r.iso_3166_1 === "US");
  const pick = (src, type) => src?.release_dates.find(d => d.type === type)?.release_date?.slice(0, 10);
  return {
    theatrical: pick(fr, 3) || pick(fr, 2) || null,
    digital: pick(fr, 4) || pick(us, 4) || null
  };
}

// ── API publique ────────────────────────────────────────────
export async function tv(id, opts = {}) {
  const v = await get(`/tv/${id}`, { append_to_response: "external_ids,aggregate_credits" }, { ttl: 12, slim: slimTv, ...opts });
  return v;
}
export async function tvOverviewEN(id) {
  const t = await get(`/tv/${id}`, { language: "en-US" }, { ttl: 168, slim: x => ({ overview: x.overview }) });
  return t.overview;
}
export async function season(id, n, opts = {}) {
  const s = await get(`/tv/${id}/season/${n}`, {}, { ttl: 24, slim: slimSeason, ...opts });
  return s;
}
// Saison avec synopsis anglais en repli pour les épisodes sans traduction
export async function seasonFilled(id, n) {
  const s = await season(id, n);
  if (s.episodes.some(e => !e.overview)) {
    try {
      const en = await get(`/tv/${id}/season/${n}`, { language: "en-US" }, { ttl: 168, slim: slimSeason });
      const byN = new Map(en.episodes.map(e => [e.episode_number, e]));
      s.episodes = s.episodes.map(e => {
        const x = byN.get(e.episode_number);
        return e.overview || !x ? e : { ...e, overview: x.overview, _en: true, name: /^Épisode \d+$/.test(e.name) && x.name ? x.name : e.name };
      });
    } catch {}
  }
  return s;
}
export async function movie(id, opts = {}) {
  return get(`/movie/${id}`, { append_to_response: "release_dates,credits" }, { ttl: 24, slim: slimMovie, ...opts });
}
export async function movieOverviewEN(id) {
  const m = await get(`/movie/${id}`, { language: "en-US" }, { ttl: 168, slim: x => ({ overview: x.overview }) });
  return m.overview;
}
export async function providers(type, id) {
  const r = await get(`/${type}/${id}/watch/providers`, {}, { ttl: 24 });
  const fr = r.results?.[REGION];
  if (!fr) return null;
  return { link: fr.link, flatrate: fr.flatrate || [], rent: fr.rent || [], buy: fr.buy || [], free: [...(fr.free || []), ...(fr.ads || [])] };
}
export async function search(q, page = 1) {
  const r = await get("/search/multi", { query: q, page, include_adult: "false", region: REGION }, { ttl: 1 });
  return (r.results || []).filter(x => x.media_type === "tv" || x.media_type === "movie");
}
export async function searchTv(q, year) {
  const r = await get("/search/tv", { query: q, first_air_date_year: year || undefined }, { ttl: 168 });
  return r.results || [];
}
export async function searchMovie(q, year) {
  const r = await get("/search/movie", { query: q, year: year || undefined }, { ttl: 168 });
  return r.results || [];
}
export async function findExternal(id, source) {
  return get(`/find/${id}`, { external_source: source }, { ttl: 720 });
}
export async function trending(type = "all") {
  const r = await get(`/trending/${type}/week`, {}, { ttl: 6 });
  return (r.results || []).filter(x => x.media_type === "tv" || x.media_type === "movie");
}
export async function upcomingMovies() {
  const r = await get("/movie/upcoming", { region: REGION }, { ttl: 12 });
  return (r.results || []).map(x => ({ ...x, media_type: "movie" }));
}
export async function popularTv() {
  const r = await get("/tv/on_the_air", {}, { ttl: 12 });
  return (r.results || []).map(x => ({ ...x, media_type: "tv" }));
}

// ── Logique épisodes ────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);

// Liste ordonnée des épisodes déjà diffusés [{s,e}] (hors spéciaux), à partir du seul détail série.
export function airedList(t) {
  if (!t) return [];
  const last = t.last_episode_to_air;
  const out = [];
  const seasons = (t.seasons || []).filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
  for (const s of seasons) {
    if (!last) break;
    if (s.season_number < last.season_number) for (let e = 1; e <= s.episode_count; e++) out.push({ s: s.season_number, e });
    else if (s.season_number === last.season_number) {
      // si la série est terminée, toute la saison est sortie
      const n = (t.next_episode_to_air && t.next_episode_to_air.season_number === s.season_number) ? last.episode_number : Math.max(last.episode_number, s.episode_count);
      for (let e = 1; e <= n; e++) out.push({ s: s.season_number, e });
    }
  }
  return out;
}
export const isWatched = (show, s, e) => !!show?.watched?.[s]?.includes(e);
export function watchedCount(show) {
  let n = 0; for (const k in show?.watched || {}) if (k !== "0") n += show.watched[k].length; return n;
}
export function progress(show, t) {
  const aired = airedList(t);
  const unwatched = aired.filter(x => !isWatched(show, x.s, x.e));
  return { aired: aired.length, watched: aired.length - unwatched.length, next: unwatched[0] || null, remaining: unwatched.length };
}
export { today };
