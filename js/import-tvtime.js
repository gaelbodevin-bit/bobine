// Import de l'export RGPD TV Time (zip ou CSV/JSON) + sauvegarde Bobine.
// Les noms de colonnes TV Time ont changé au fil des années : détection par alias.
import * as tmdb from "./tmdb.js";

// ── CSV ─────────────────────────────────────────────────────
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0);
  const sep = [",", ";", "\t"].map(s => [s, firstLine.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift().map(norm);
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
const norm = h => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function flatten(o, p = "", out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = norm(p ? p + "_" + k : k);
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (!Array.isArray(v)) out[key] = v == null ? "" : String(v);
  }
  return out;
}

// JSON : tableaux d'objets à plat, ou structure série > saisons > épisodes
function rowsFromJSON(j) {
  const rows = [];
  const walk = (x, ctx = {}) => {
    if (Array.isArray(x)) return x.forEach(y => walk(y, ctx));
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x.seasons)) {
      const flat = flatten(x);
      const sname = pick(flat, A.seriesName) || flat.name || flat.title;
      const tvdb = pick(flat, A.seriesTvdb) || flat.id_tvdb || flat.ids_tvdb || flat.tvdb;
      let any = false;
      for (const s of x.seasons) for (const e of (s.episodes || [])) {
        const fe = flatten(e);
        if (fe.is_watched === "false" || fe.watched === "false") continue;
        any = true;
        rows.push({ series_name: sname, tvdb_series_id: tvdb, season_number: s.number ?? s.season_number ?? fe.season_number, episode_number: e.number ?? e.episode_number, watched_at: fe.watched_at || fe.date || "" });
      }
      if (!any) rows.push({ series_name: sname, tvdb_series_id: tvdb });
      return;
    }
    const vals = Object.values(x);
    if (vals.some(v => Array.isArray(v) && v.length && typeof v[0] === "object")) {
      vals.forEach(v => Array.isArray(v) && walk(v, ctx));
      return;
    }
    rows.push(flatten(x));
  };
  walk(j);
  return rows;
}

// ── Alias de colonnes ───────────────────────────────────────
const A = {
  type: ["type", "entity_type", "media_type", "object_type", "kind", "content_type"],
  seriesName: ["series_name", "show_name", "tv_show_name", "tvshow_name", "serie_name", "series_title", "show_title", "series", "show", "show_original_name"],
  seriesTvdb: ["tvdb_series_id", "series_tvdb_id", "tvdb_show_id", "show_tvdb_id", "series_id", "s_id", "show_id", "tv_show_id", "tvdb_id_series", "tvdb_id"],
  season: ["season_number", "s_no", "episode_season_number", "season", "season_num", "seasonnumber"],
  episode: ["episode_number", "ep_no", "episode", "episode_num", "number", "episodenumber"],
  epTvdb: ["episode_id", "ep_id", "tvdb_episode_id", "episode_tvdb_id"],
  movieName: ["movie_name", "movie_title", "film_name", "movie", "original_title"],
  title: ["title", "name", "entity_name"],
  imdb: ["imdb_id", "imdb", "movie_imdb_id", "ids_imdb"],
  tmdb: ["tmdb_id", "ids_tmdb", "movie_tmdb_id"],
  tvdb: ["tvdb_id", "ids_tvdb", "movie_tvdb_id"],
  year: ["year", "release_year", "movie_year"],
  date: ["watched_at", "seen_at", "seen_date", "created_at", "date", "updated_at", "timestamp"],
  watchlist: ["is_watchlist", "watchlist", "to_watch", "is_followed_not_seen"]
};
function pick(r, list) { for (const k of list) if (r[k] !== undefined && r[k] !== "") return r[k]; return ""; }

const SKIP = /comment|meme|emotion|reaction|vote|friend|badge|notif|device|login|session|token|profile|user_|avatar|character|list_|share|report|ad_|ads|push|email|gdpr_request/i;
const FOLLOWISH = /follow|favorite|show|series|track|watch|seen|record/i;

function toDate(v) {
  if (!v) return 0;
  if (/^\d{10}$/.test(v)) return +v * 1000;
  if (/^\d{13}$/.test(v)) return +v;
  const t = Date.parse(v.replace(" ", "T")); return isNaN(t) ? 0 : t;
}
const nkey = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ── Analyse ─────────────────────────────────────────────────
// files: FileList / File[] (zip, csv, json). Renvoie { shows, movies, files, bobine }
export async function analyze(files, onFile) {
  const entries = []; // { name, text }
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(f);
      for (const [path, ent] of Object.entries(zip.files)) {
        if (ent.dir || !/\.(csv|json)$/i.test(path) || /__MACOSX/.test(path)) continue;
        entries.push({ name: path, text: await ent.async("string") });
      }
    } else entries.push({ name: f.name, text: await f.text() });
  }

  const shows = new Map(), movies = new Map(), report = [];
  let bobine = null;

  for (const { name, text } of entries) {
    const base = name.split("/").pop();
    onFile?.(base);
    let rows = [];
    try {
      if (/\.json$/i.test(base)) {
        const j = JSON.parse(text);
        if (j && j.app === "bobine") { bobine = j; report.push({ file: base, kind: "Sauvegarde Bobine", n: (j.shows?.length || 0) + (j.movies?.length || 0) }); continue; }
        rows = rowsFromJSON(j);
      } else rows = parseCSV(text);
    } catch (e) { report.push({ file: base, kind: "illisible", n: 0 }); continue; }
    if (SKIP.test(base) && !/record|seen|track/i.test(base)) { report.push({ file: base, kind: "ignoré", n: rows.length }); continue; }

    let ep = 0, mv = 0, fo = 0;
    for (const r of rows) {
      const type = pick(r, A.type).toLowerCase();
      const isMovieType = /movie|film/.test(type);
      const isTvType = /episode|show|series|tv/.test(type);
      const season = parseInt(pick(r, A.season), 10);
      const episode = parseInt(pick(r, A.episode), 10);
      const sName = pick(r, A.seriesName);
      const sTvdb = pick(r, A.seriesTvdb);
      const mName = pick(r, A.movieName) || (isMovieType ? pick(r, A.title) : "");
      const date = toDate(pick(r, A.date));

      if (isMovieType || (!isTvType && mName && !sName && isNaN(season))) {
        const imdb = (pick(r, A.imdb).match(/tt\d+/) || [""])[0];
        const tmdbId = pick(r, A.tmdb);
        const name = mName || pick(r, A.title);
        if (!name && !imdb && !tmdbId) continue;
        const key = imdb || (tmdbId && "t" + tmdbId) || nkey(name);
        const wl = /^(1|true|yes)$/i.test(pick(r, A.watchlist)) || /watchlist|to_watch|towatch/.test(type);
        const prev = movies.get(key);
        movies.set(key, {
          name: name || prev?.name, imdb: imdb || prev?.imdb, tmdb: tmdbId || prev?.tmdb, tvdb: pick(r, A.tvdb) || prev?.tvdb,
          year: pick(r, A.year) || prev?.year, date: Math.max(date, prev?.date || 0), watchlist: prev ? prev.watchlist && wl : wl
        });
        mv++; continue;
      }

      const name = sName || (isTvType ? pick(r, A.title) : "");
      if (!name && !sTvdb) continue;
      const key = sTvdb ? "v" + sTvdb : nkey(name);
      let s = shows.get(key);
      if (!s) { s = { name, tvdb: sTvdb, eps: new Set(), epIds: new Set(), date: 0 }; shows.set(key, s); }
      if (!s.name && name) s.name = name;
      s.date = Math.max(s.date, date);
      if (!isNaN(season) && !isNaN(episode) && episode > 0) { s.eps.add(season + ":" + episode); ep++; }
      else {
        const eid = pick(r, A.epTvdb);
        if (eid && /record|seen|track/i.test(base)) { s.epIds.add(eid); ep++; }
        else if (FOLLOWISH.test(base)) fo++;
      }
    }
    // Les fichiers de séries suivies sans épisode n'ajoutent que la série
    report.push({ file: base, kind: ep ? "épisodes vus" : mv ? "films" : fo ? "séries suivies" : "sans données utiles", n: ep || mv || fo });
  }

  // Fusion des doublons nom/tvdb
  const byName = new Map();
  for (const [k, s] of [...shows]) {
    const nk = nkey(s.name);
    if (!nk) continue;
    const other = byName.get(nk);
    if (other && other !== s) {
      s.eps.forEach(x => other.eps.add(x)); s.epIds.forEach(x => other.epIds.add(x));
      other.tvdb = other.tvdb || s.tvdb; other.date = Math.max(other.date, s.date);
      shows.delete(k);
    } else byName.set(nk, s);
  }

  const epCount = [...shows.values()].reduce((n, s) => n + s.eps.size + s.epIds.size, 0);
  return { shows: [...shows.values()], movies: [...movies.values()], report, bobine, epCount };
}

// ── Résolution TMDB ─────────────────────────────────────────
function similar(a, b) {
  a = nkey(a); b = nkey(b);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

async function resolveShow(s) {
  if (s.tvdb && /^\d+$/.test(s.tvdb)) {
    try {
      const f = await tmdb.findExternal(s.tvdb, "tvdb_id");
      const t = f.tv_results?.[0];
      if (t && (!s.name || similar(t.name, s.name) || similar(t.original_name, s.name))) return t;
    } catch { }
  }
  if (!s.name) return null;
  const clean = s.name.replace(/\s*\((19|20)\d\d\)\s*$/, "");
  const year = (s.name.match(/\(((19|20)\d\d)\)\s*$/) || [])[1];
  const res = await tmdb.searchTv(clean, year);
  return res.find(x => nkey(x.name) === nkey(clean) || nkey(x.original_name) === nkey(clean)) || res[0] || null;
}

async function resolveMovie(m) {
  if (m.tmdb && /^\d+$/.test(m.tmdb)) return { id: +m.tmdb, title: m.name };
  if (m.imdb) {
    try { const f = await tmdb.findExternal(m.imdb, "imdb_id"); if (f.movie_results?.[0]) return f.movie_results[0]; } catch { }
  }
  if (m.tvdb && /^\d+$/.test(m.tvdb)) {
    try { const f = await tmdb.findExternal(m.tvdb, "tvdb_id"); if (f.movie_results?.[0]) return f.movie_results[0]; } catch { }
  }
  if (!m.name) return null;
  const res = await tmdb.searchMovie(m.name, m.year);
  return res.find(x => nkey(x.title) === nkey(m.name) || nkey(x.original_title) === nkey(m.name)) || res[0] || null;
}

// Episodes identifiés seulement par leur id TVDB → /find (plafonné)
async function resolveEpIds(ids, max = 600) {
  const out = [];
  for (const id of [...ids].slice(0, max)) {
    try {
      const f = await tmdb.findExternal(id, "tvdb_id");
      const e = f.tv_episode_results?.[0];
      if (e) out.push(e);
    } catch { }
  }
  return out;
}

export async function resolve(analysis, existing, onProgress) {
  const total = analysis.shows.length + analysis.movies.length;
  let done = 0; const tick = label => onProgress?.(++done, total, label);
  const unresolved = [];
  const showsOut = new Map(), moviesOut = new Map();

  await Promise.all(analysis.shows.map(async s => {
    try {
      const t = await resolveShow(s);
      if (!t) { unresolved.push("Série : " + (s.name || "TVDB " + s.tvdb)); return tick(s.name); }
      const base = showsOut.get(t.id) || existing.shows.get(t.id) || {
        id: t.id, name: t.name, poster_path: t.poster_path, backdrop_path: t.backdrop_path,
        status: "watching", addedAt: s.date || Date.now(), watched: {}
      };
      const watched = { ...(base.watched || {}) };
      for (const k of s.eps) {
        const [se, ep] = k.split(":").map(Number);
        const arr = new Set(watched[se] || []); arr.add(ep); watched[se] = [...arr].sort((a, b) => a - b);
      }
      if (s.epIds.size) {
        for (const e of await resolveEpIds(s.epIds)) {
          if (e.show_id !== t.id) continue;
          const arr = new Set(watched[e.season_number] || []); arr.add(e.episode_number); watched[e.season_number] = [...arr].sort((a, b) => a - b);
        }
      }
      showsOut.set(t.id, { ...base, watched, lastWatchedAt: Math.max(base.lastWatchedAt || 0, s.date || 0) || Date.now() });
    } catch (e) { unresolved.push("Série : " + s.name + " (" + e.message + ")"); }
    tick(s.name);
  }));

  await Promise.all(analysis.movies.map(async m => {
    try {
      const r = await resolveMovie(m);
      if (!r) { unresolved.push("Film : " + (m.name || m.imdb)); return tick(m.name); }
      const prev = moviesOut.get(r.id) || existing.movies.get(r.id);
      const watched = !m.watchlist || prev?.status === "watched";
      moviesOut.set(r.id, {
        ...(prev || {}),
        id: r.id, title: r.title || prev?.title || m.name, poster_path: r.poster_path ?? prev?.poster_path ?? null,
        backdrop_path: r.backdrop_path ?? prev?.backdrop_path ?? null, release_date: r.release_date || prev?.release_date || "",
        status: watched ? "watched" : "watchlist",
        watchedAt: watched ? (prev?.watchedAt || m.date || Date.now()) : null,
        addedAt: prev?.addedAt || m.date || Date.now()
      });
    } catch (e) { unresolved.push("Film : " + m.name + " (" + e.message + ")"); }
    tick(m.name);
  }));

  // Complète les fiches films sans poster (résolution via id TMDB direct)
  await Promise.all([...moviesOut.values()].filter(m => !m.poster_path || !m.runtime).map(async m => {
    try { const d = await tmdb.movie(m.id); Object.assign(m, { title: d.title, poster_path: d.poster_path, backdrop_path: d.backdrop_path, release_date: d.release_date, runtime: d.runtime }); } catch { }
  }));

  return { shows: [...showsOut.values()], movies: [...moviesOut.values()], unresolved };
}

let jszipP;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  jszipP ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error("JSZip indisponible"));
    document.head.appendChild(s);
  });
  return jszipP;
}
