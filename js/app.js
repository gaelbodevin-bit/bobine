// Playwatch — suivi de séries & films (PWA)
import * as tmdb from "./tmdb.js";
import * as store from "./store.js";
import * as push from "./push.js";
import * as imp from "./import-tvtime.js";
import * as rawg from "./rawg.js";
import * as premium from "./premium.js";
import { gimg } from "./rawg.js";
import { img, airedList, isWatched, progress, watchedCount, seenCount } from "./tmdb.js";

// ═════════════ Utilitaires ═════════════
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const svg = (p, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  edit: svg('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  crown: svg('<path d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z"/>'),
  play: svg('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>'),
  cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  tv: svg('<rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M8 3l4 3.5L16 3"/>'),
  film: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 3.5v17M16 3.5v17M3.5 8.5H8M3.5 15.5H8M16 8.5h4.5M16 15.5h4.5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  user: svg('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  chev: svg('<path d="M9 5l7 7-7 7"/>', "chev"),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor" stroke="none"/>'),
  bell: svg('<path d="M6 16v-5a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>'),
  share: svg('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 11H5.5v9.5h13V11H17"/>'),
  mark: svg('<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>'),
  down: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>'),
  up: svg('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  pause: svg('<path d="M9 6v12M15 6v12"/>'),
  stop: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>'),
  trash: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  list: svg('<rect x="3.5" y="5" width="6" height="4" rx="1"/><rect x="3.5" y="15" width="6" height="4" rx="1"/><path d="M12.5 7h8M12.5 17h8"/>'),
  pad: svg('<path d="M7 8h10a4.5 4.5 0 014.4 5.4l-.8 3.6a2.4 2.4 0 01-4.2 1L14.6 16H9.4l-1.8 2a2.4 2.4 0 01-4.2-1l-.8-3.6A4.5 4.5 0 017 8z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="12" r=".9" fill="currentColor"/><circle cx="17.3" cy="13.8" r=".9" fill="currentColor"/>'),
  spark: svg('<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>'),
  ff: svg('<path d="M4 6.5l7.5 5.5L4 17.5zM12.5 6.5L20 12l-7.5 5.5z"/>'),
};

const DAY = 864e5;
const isoToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const dParse = s => s ? new Date(s + "T12:00:00") : null;
const daysFrom = s => s ? Math.round((dParse(s) - dParse(isoToday())) / DAY) : null;
const fmtLong = s => s ? dParse(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "";
const fmtShort = s => s ? dParse(s).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "";
const fmtFull = s => s ? dParse(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
const year = s => (s || "").slice(0, 4);
function rel(s) {
  const d = daysFrom(s); if (d === null) return "";
  if (d === 0) return "aujourd'hui"; if (d === 1) return "demain"; if (d === -1) return "hier";
  if (d > 1 && d < 7) return fmtLong(s).split(" ")[0];
  if (d < 0 && d > -30) return `il y a ${-d} j`;
  return fmtShort(s);
}
const SE = (s, e) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
const STATUS_FR = { "Returning Series": "En cours de diffusion", "Ended": "Terminée", "Canceled": "Annulée", "In Production": "En production", "Planned": "Annoncée", "Pilot": "Pilote", "Released": "Sorti", "Post Production": "Post-production", "Rumored": "Rumeur" };
const SHOW_ST = { watching: "En cours", later: "À voir", stopped: "Arrêtée" };
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
function dur(min) {
  if (!min) return "0 h";
  const h = Math.round(min / 60);
  if (h < 48) return h + " h";
  const d = Math.floor(h / 24); return d >= 365 ? `${(d / 365).toFixed(1).replace(".", ",")} an${d >= 730 ? "s" : ""}` : `${d} j ${h % 24} h`;
}
const pimg = (path, alt, size = "w342") => path
  ? `<img src="${img(path, size)}" alt="" loading="lazy" decoding="async">`
  : `<div class="noimg">${esc(alt)}</div>`;

// ═════════════ État UI + caches de détails ═════════════
const ui = { tab: "series", seriesFilter: "watching", sugSeg: "movie", sug: {}, movieSeg: "watchlist", seriesView: (() => { try { return localStorage.getItem("bobine:sview") || "grid"; } catch { return "grid"; } })(), q: "", pushStatus: null, mode: null };
const details = new Map();   // tv id -> détail allégé
const seasons = new Map();   // "id:n" -> saison
const movieD = new Map();    // movie id -> détail
const requested = new Set();
const TVP = { append_to_response: "external_ids" };
const tvErr = new Set();

// Ne redessine que si la donnée a réellement changé (le cache affiché au démarrage est souvent déjà à jour)
function setIfChanged(map, k, v) {
  const o = map.get(k);
  if (o && JSON.stringify(o) === JSON.stringify(v)) return false;
  map.set(k, v); return true;
}
function needTv(id) {
  const k = "tv" + id;
  if (!requested.has(k)) {
    requested.add(k);
    (async () => {
      if (!details.has(id)) { const c = await tmdb.peek(`/tv/${id}`, TVP); if (c && !details.has(id)) { details.set(id, c); later(); } }
      try { const v = await tmdb.tv(id); tvErr.delete(id); if (setIfChanged(details, id, v)) later(); } catch (e) { if (!details.has(id)) { tvErr.add(id); later(); } onErr(e); }
    })();
  }
  return details.get(id);
}
function needSeason(id, n) {
  const k = id + ":" + n;
  if (!requested.has("s" + k)) {
    requested.add("s" + k);
    (async () => {
      if (!seasons.has(k)) { const c = await tmdb.peek(`/tv/${id}/season/${n}`, {}); if (c && !seasons.has(k)) { seasons.set(k, c); later(); } }
      try { if (setIfChanged(seasons, k, await tmdb.season(id, n))) later(); } catch (e) { onErr(e); }
    })();
  }
  return seasons.get(k);
}
function needMovie(id) {
  const k = "mv" + id;
  if (!requested.has(k)) {
    requested.add(k);
    (async () => {
      const P = { append_to_response: "release_dates,credits" };
      if (!movieD.has(id)) { const c = await tmdb.peek(`/movie/${id}`, P); if (c && !movieD.has(id)) { movieD.set(id, c); later(); } }
      try { if (setIfChanged(movieD, id, await tmdb.movie(id))) later(); } catch (e) { onErr(e); }
    })();
  }
  return movieD.get(id);
}
const epOf = (id, s, e) => needSeason(id, s)?.episodes?.find(x => x.episode_number === e);

let errShown = 0;
function onErr(e) {
  console.warn(e);
  if (Date.now() - errShown < 8000) return; errShown = Date.now();
  if (e.message === "BAD_KEY") toast("Clé TMDB refusée — vérifie-la dans le profil");
  else if (e.message === "NO_KEY") renderKey();
  else if (!navigator.onLine) toast("Hors ligne — affichage du cache");
}


// ═════════════ Rendu sans clignotement ═════════════
// Met à jour le DOM existant au lieu de tout recréer : les affiches déjà affichées ne sont pas rechargées.
const keyOf = n => n.nodeType === 1 && n.dataset && n.dataset.id ? n.tagName + "|" + (n.dataset.a || "") + "|" + n.dataset.id + "|" + (n.dataset.s || "") + "|" + (n.dataset.e || "") : null;
function syncNode(o, n) {
  if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) { o.replaceWith(n); return; }
  if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
  if (o.isEqualNode(n)) return;
  for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of [...n.attributes]) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(o.tagName)) { if (document.activeElement !== o && "value" in n && o.value !== n.value) o.value = n.value; return; }
  morphKids(o, n);
}
function morphKids(from, to) {
  const keyed = new Map();
  for (const o of from.childNodes) { const k = keyOf(o); if (k && !keyed.has(k)) keyed.set(k, o); }
  const kids = [...to.childNodes];
  kids.forEach((n, i) => {
    const cur = from.childNodes[i] || null;
    const k = keyOf(n);
    let o = null;
    if (k) { o = keyed.get(k) || null; if (o) { keyed.delete(k); if (o !== cur) from.insertBefore(o, cur); } }
    else if (cur && !keyOf(cur) && cur.nodeName === n.nodeName) o = cur;
    if (o) syncNode(o, n); else from.insertBefore(n, cur);
  });
  while (from.childNodes.length > kids.length) from.lastChild.remove();
}
function patch(el, html) {
  if (!el.firstChild) { el.innerHTML = html; return; }
  const t = document.createElement("template"); t.innerHTML = html;
  morphKids(el, t.content);
}

// ═════════════ Rendu planifié ═════════════
let raf = 0;
let lastRender = 0;
function later() {
  if (raf) return;
  const wait = Math.max(0, 250 - (performance.now() - lastRender));
  raf = setTimeout(() => requestAnimationFrame(() => { raf = 0; lastRender = performance.now(); if (ui.mode === "app") { renderView(); sheets.at(-1)?.refresh(); } }), wait);
}
store.onChange(st => {
  if (store.hasFirebase && !st.user) return renderAuth();
  if (st.user && ui.mode === "auth") return startApp();
  later();
});

// ═════════════ Navigation ═════════════
const AV_TABS = [["series", "Séries", I.tv], ["movies", "Films", I.film], ["discover", "Découvrir", I.search], ["upcoming", "À venir", I.cal]];
const G_TABS = [["games", "Jeux", I.pad], ["gdiscover", "Découvrir", I.search], ["gupcoming", "À venir", I.cal]];
// Anciens onglets (liens, notifications) → Découvrir
const TAB_ALIAS = { suggest: "discover", explore: "discover", gsuggest: "gdiscover", gexplore: "gdiscover" };
const TABS = [...AV_TABS, ...G_TABS];
// Contenus affichés (Profil) et univers actif
function loadDomains() { try { const d = JSON.parse(localStorage.getItem("bobine:domains") || "null"); if (d && (d.av || d.games)) return d; } catch { } return { av: true, games: true }; }
ui.domains = loadDomains();
ui.domain = (() => { try { return localStorage.getItem("bobine:domain") || "av"; } catch { return "av"; } })();
ui.lastTab = { av: "series", games: "games" };
const domainOf = tab => G_TABS.some(t => t[0] === tab) ? "games" : "av";
function fixDomain() { if (!ui.domains[ui.domain]) ui.domain = ui.domains.av ? "av" : "games"; }
fixDomain();
const curTabs = () => ui.domain === "games" ? G_TABS : AV_TABS;
function renderTabs(badge = 0) {
  $("#tabs").innerHTML = curTabs().map(([k, l, ic]) =>
    `<button data-a="tab" data-v="${k}" class="${ui.tab === k ? "on" : ""}">${ic}${l}</button>`).join("");
}
function go(tab) {
  tab = TAB_ALIAS[tab] || tab;
  if (tab === ui.tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  ui.tab = tab; if (tab !== "profile") { ui.domain = domainOf(tab); ui.lastTab[ui.domain] = tab; }
  history.replaceState(history.state, "", "#" + tab);
  renderView(true); window.scrollTo(0, 0);
}

function renderView(force) {
  if (ui.mode !== "app") return;
  if (sheets.length && !force) { ui.dirty = true; return; }
  const v = $("#view");
  if (TAB_ALIAS[ui.tab]) ui.tab = TAB_ALIAS[ui.tab];
  ({ series: vSeries, upcoming: vUpcoming, movies: vMovies, discover: vExplore, profile: vProfile,
     games: vGames, gupcoming: vGUpcoming, gdiscover: vGExplore }[ui.tab] || vSeries)(v, force);
  renderTabs(ui.badge);
}

const domainSwitch = () => ui.domains.av && ui.domains.games
  ? `<div class="dswitch"><button data-a="domain" data-v="av" class="${ui.domain === "av" ? "on" : ""}">${I.film}Films & séries</button><button data-a="domain" data-v="games" class="${ui.domain === "games" ? "on" : ""}">${I.pad}Jeux vidéo</button></div>` : "";
const top = (title, sub = "", right = "") => domainSwitch() +
  `<div class="top"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${right}</div>`;
const profileBtn = `<button class="iconbtn" data-a="tab" data-v="profile" aria-label="Profil">${I.user}</button>`;

// ═════════════ Vue : À voir ═════════════
function classify() {
  const out = { watching: [], waiting: [], later: [], finished: [], stopped: [] };
  for (const s of store.data.shows.values()) {
    const t = needTv(s.id);
    // « Arrêtée » toujours respectée ; « À voir » choisi à la main respecté ; sinon c'est la progression qui range la série
    if (s.statusManual && s.status === "later") { out.later.push({ s, t }); continue; }
    if (s.status === "stopped") { out.stopped.push({ s, t }); continue; }  // arrêtée = abandonnée, toujours respectée
    if (!t) { (watchedCount(s) ? out.watching : out.later).push({ s, t: null, p: null }); continue; }
    const p = progress(s, t);
    if (p.watched === 0) out.later.push({ s, t, p });
    else if (p.next) out.watching.push({ s, t, p });
    else if (["Ended", "Canceled"].includes(t.status) && p.aired > 0) out.finished.push({ s, t, p });
    else out.waiting.push({ s, t, p });
  }
  return out;
}

const nSeasons = t => t ? ((t.seasons || []).filter(x => x.season_number > 0 && x.episode_count).length || t.number_of_seasons || 0) : 0;

// Activité d'une série : dernier visionnage, ou date de sortie du dernier épisode s'il n'est pas encore vu
// → une série qui reçoit un nouvel épisode (nouvelle saison comprise) remonte en haut de la liste.
function actKey(x) {
  let k = x.s.lastWatchedAt || x.s.addedAt || 0;
  const la = x.t?.last_episode_to_air;
  if (la?.air_date && la.season_number > 0 && la.air_date <= isoToday() && x.s.status !== "stopped" && !isWatched(x.s, la.season_number, la.episode_number))
    k = Math.max(k, dParse(la.air_date).getTime());
  return k;
}
// Liste "En cours" : prochain épisode de chaque série, la dernière regardée en haut
function upNextItems(c) {
  const nowISO = isoToday();
  return c.watching.map(x => {
    const ep = x.p?.next ? epOf(x.s.id, x.p.next.s, x.p.next.e) : null;
    const air = ep?.air_date || (x.p?.next && x.t?.last_episode_to_air && x.t.last_episode_to_air.season_number === x.p.next.s && x.t.last_episode_to_air.episode_number === x.p.next.e ? x.t.last_episode_to_air.air_date : null);
    const la = x.t?.last_episode_to_air;
    const fresh = !!(la?.air_date && la.season_number > 0 && daysFrom(la.air_date) >= -7 && la.air_date <= nowISO && !isWatched(x.s, la.season_number, la.episode_number));
    return { ...x, ep, air, fresh, la };
  }).sort((a, b) => actKey(b) - actKey(a));
}
const sec = (t, n) => `<div class="sec"><h2>${t}</h2>${n !== undefined ? `<span class="c">${n}</span>` : ""}</div>`;
const skel = () => Array.from({ length: 4 }, () => `<div class="up"><div class="th sk"></div><div class="tx"><div class="sk" style="height:14px;width:60%;border-radius:6px"></div><div class="sk" style="height:12px;width:40%;border-radius:6px;margin-top:8px"></div></div></div>`).join("");

function upCard(x) {
  const { s, t, p, ep, air, fresh } = x;
  const name = esc(t?.name || s.name);
  if (!p) return `<div class="up"><div class="th sk"></div><div class="tx"><div class="n">${name}</div><div class="m">Chargement…</div></div></div>`;
  const n = p.next;
  const still = ep?.still_path ? img(ep.still_path, "w300") : img(t.backdrop_path || s.backdrop_path, "w300");
  const la = x.la;
  const meta = p.watched === 0 ? `Pas commencée · ${plural(p.aired, "épisode")}` : "" + (p.remaining > 1 ? `${fresh ? " · " : ""}+${p.remaining - 1} ensuite` : (fresh ? "" : "Dernier épisode dispo"));
  return `<div class="up ${fresh ? "fresh" : ""}" data-a="ep" data-id="${s.id}" data-s="${n.s}" data-e="${n.e}">
    <div class="th">${still ? `<img src="${still}" alt="" loading="lazy">` : ""}${fresh ? `<span class="new">NOUVEL ÉP.</span>` : ""}</div>
    <div class="tx"><div class="n">${name}</div><div class="e">${SE(n.s, n.e)}${ep?.name ? " · " + esc(ep.name) : ""}</div><div class="m">${meta}</div>
    <div class="prow"><div class="bar"><i style="width:${p.aired ? Math.round(p.watched / p.aired * 100) : 0}%"></i></div><small>${p.watched}/${p.aired} ép. · ${plural(nSeasons(t), "saison")}</small></div></div>
    <button class="chk" data-a="watchNext" data-id="${s.id}" data-s="${n.s}" data-e="${n.e}" aria-label="Marquer comme vu">${I.check}</button>
  </div>`;
}

// « S2 E4 » : prochain épisode à voir, affiché discrètement à droite du titre
const seTag = p => p?.next && p.watched > 0 ? `<em>S${p.next.s} E${p.next.e}</em>` : "";
function poster(s, t, sub, done) {
  const p = t ? progress(s, t) : null;
  const pct = p && p.aired ? Math.round(p.watched / p.aired * 100) : 0;
  return `<button class="pc" data-a="tv" data-id="${s.id}"><div class="p">${pimg(t?.poster_path || s.poster_path, t?.name || s.name)}${done ? `<span class="badge">${I.check}</span>` : ""}${!done && pct ? `<div class="pbar"><i style="width:${pct}%"></i></div>` : ""}</div><div class="t">${esc(t?.name || s.name)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</button>`;
}

function banners() {
  let h = "";
  if (push.isIOS && !push.isStandalone() && !localStorage.getItem("bobine:noinstall"))
    h += `<div class="banner">${I.share}<div><b>Installe Playwatch</b><br>Partager → « Sur l'écran d'accueil » pour l'app plein écran et les notifications.</div><button class="x" data-a="dismiss" data-v="noinstall">${I.x}</button></div>`;
  else if (ui.pushStatus === "off" && !localStorage.getItem("bobine:nopush"))
    h += `<div class="banner">${I.bell}<div><b>Nouveaux épisodes</b><br>Active les notifications pour être prévenu dès leur sortie.</div><button class="btn sm pri" data-a="pushOn">Activer</button><button class="x" data-a="dismiss" data-v="nopush">${I.x}</button></div>`;
  return h;
}

// ═════════════ Vue : À venir ═════════════
function vUpcoming(v) {
  const now = isoToday(), max = new Date(Date.now() + 120 * DAY).toISOString().slice(0, 10);
  const recentMin = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  const items = [], recent = [];
  for (const s of store.data.shows.values()) {
    if (s.status === "stopped") continue;
    const t = needTv(s.id); if (!t) continue;
    const seen = new Set();
    const addEp = (e, arr) => { const k = e.season_number + ":" + e.episode_number; if (seen.has(k)) return; seen.add(k); arr.push({ date: e.air_date, s, t, e }); };
    const nx = t.next_episode_to_air, la = t.last_episode_to_air;
    if (nx?.air_date) {
      const sea = needSeason(s.id, nx.season_number);
      const eps = sea ? sea.episodes.filter(e => e.air_date && e.air_date >= now && e.air_date <= max) : [nx];
      eps.forEach(e => addEp(e, items));
    }
    if (la?.air_date && la.air_date >= recentMin) {
      const sea = needSeason(s.id, la.season_number);
      (sea ? sea.episodes.filter(e => e.air_date && e.air_date >= recentMin && e.air_date < now) : [la]).forEach(e => addEp(e, recent));
    }
  }
  for (const m of store.data.movies.values()) {
    if (m.status !== "watchlist") continue;
    const d = needMovie(m.id);
    const rf = d?.release_fr || {};
    const add = (date, label) => date && date >= now && date <= max && items.push({ date, m, d, label });
    add(rf.theatrical || (!rf.digital && d?.release_date), "Au cinéma");
    add(rf.digital, "En numérique / streaming");
  }
  items.sort((a, b) => a.date > b.date ? 1 : -1);
  recent.sort((a, b) => a.date < b.date ? 1 : -1);

  let h = top("À venir", "Épisodes et sorties de ta liste", profileBtn);
  if (!items.length && !recent.length) {
    h += `<div class="empty">${I.cal}<h3>Calendrier vide</h3><p>Les prochains épisodes de tes séries et les sorties des films de ta liste « À voir » apparaîtront ici.</p></div>`;
  }
  const groups = new Map();
  items.forEach(x => { if (!groups.has(x.date)) groups.set(x.date, []); groups.get(x.date).push(x); });
  for (const [date, arr] of groups) {
    const d = daysFrom(date);
    h += `<div class="day"><h3>${d === 0 ? "<b>Aujourd'hui</b>" : d === 1 ? "<b>Demain</b>" : esc(fmtLong(date))}${d > 1 ? ` · <span style="text-transform:none;letter-spacing:0">dans ${d} j</span>` : ""}</h3>${arr.map(calRow).join("")}</div>`;
  }
  if (recent.length) {
    h += sec("Sortis ces 7 derniers jours") + recent.map(x => calRow(x, true)).join("");
  }
  patch(v, h);
}
function calRow(x, past) {
  if (x.m) return `<button class="cal" data-a="mv" data-id="${x.m.id}"><div class="ps">${pimg(x.d?.poster_path || x.m.poster_path, x.m.title, "w154")}</div><div class="tx" style="flex:1;min-width:0"><div class="n" style="font-weight:650">${esc(x.d?.title || x.m.title)}</div><div class="d" style="color:var(--mu);font-size:13px"><span class="tag">Film</span>${esc(x.label)}</div></div></button>`;
  const w = isWatched(x.s, x.e.season_number, x.e.episode_number);
  return `<button class="cal" data-a="ep" data-id="${x.s.id}" data-s="${x.e.season_number}" data-e="${x.e.episode_number}"><div class="ps">${pimg(x.t.poster_path, x.t.name, "w154")}</div>
    <div class="tx" style="flex:1;min-width:0"><div class="n" style="font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.t.name)}</div>
    <div style="color:var(--mu);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${SE(x.e.season_number, x.e.episode_number)}${x.e.name && !/^Épisode \d+$/.test(x.e.name) ? " · " + esc(x.e.name) : ""}${past ? " · " + rel(x.date) : ""}</div>
    ${x.t.networks?.[0] ? `<div style="color:var(--mu2);font-size:12px">${esc(x.t.networks[0])}</div>` : ""}</div>
    ${past ? `<span class="chk ${w ? "on" : ""}" style="width:34px;height:34px" data-a="toggleEp" data-id="${x.s.id}" data-s="${x.e.season_number}" data-e="${x.e.episode_number}">${I.check}</span>` : ""}</button>`;
}

// ═════════════ Vue : Séries ═════════════
const SERIES_F = [["watching", "En cours"], ["later", "À voir"], ["waiting", "À jour"], ["finished", "Terminées"], ["stopped", "Arrêtées"], ["all", "Toutes"]];
const MOVIE_F = [["watchlist", "À voir"], ["watched", "Vus"]];
const viewToggle = () => `<div style="display:flex;gap:8px"><button class="iconbtn" data-a="sview" aria-label="Changer l'affichage">${ui.seriesView === "grid" ? I.list : I.grid}</button>${profileBtn}</div>`;
function vSeries(v) {
  const toggle = viewToggle();
  if (!store.data.ready) { patch(v, top("Séries", "", toggle) + skel()); return; }
  const shows = store.data.shows;
  if (!shows.size) {
    v.innerHTML = top("Séries", "", toggle) + banners() + `
      <div class="empty">${I.tv}<h3>Aucune série suivie</h3><p>Ajoute tes séries depuis Découvrir, ou importe ton historique.</p>
      <div class="btns"><button class="btn pri" data-a="tab" data-v="discover">${I.search}Découvrir</button><button class="btn" data-a="tab" data-v="profile">${I.up}Importer</button></div></div>`;
    ui.badge = 0; return;
  }
  const c = classify();
  const items = upNextItems(c);
  const freshN = items.filter(x => x.fresh).length;
  ui.badge = freshN;
  const F = SERIES_F;
  let h = top("Séries", "", toggle) + banners();
  h += `<div class="chips">${F.map(([k, l]) => `<button class="chip ${ui.seriesFilter === k ? "on" : ""}" data-a="sfilter" data-v="${k}">${l}</button>`).join("")}</div>`;

  let list;
  if (ui.seriesFilter === "watching") {
    const left = items.reduce((n, x) => n + (x.p?.remaining || 0), 0);
    if (!items.length) { patch(v, h + `<div class="empty" style="padding:24px">${I.check}<h3>À jour !</h3><p>Rien à rattraper pour l'instant.</p></div>`); return; }
    if (ui.seriesView === "list") { patch(v, h + items.map(upCard).join("")); return; }
    list = items;
  } else {
    const all = [...c.watching, ...c.waiting, ...c.later, ...c.finished, ...c.stopped];
    list = (ui.seriesFilter === "all" ? all : c[ui.seriesFilter] || [])
      .sort((a, b) => actKey(b) - actKey(a));
  }
  if (!list.length) { patch(v, h + `<div class="empty">${I.tv}<h3>Rien ici</h3><p>Aucune série dans cette catégorie.</p></div>`); return; }

  const subOf = x => {
    const p = x.t ? progress(x.s, x.t) : null;
    if (ui.seriesFilter === "waiting" && x.t?.next_episode_to_air) return `${SE(x.t.next_episode_to_air.season_number, x.t.next_episode_to_air.episode_number)} · ${rel(x.t.next_episode_to_air.air_date)}`;
    if (p?.next && x.s.status !== "later" && x.s.status !== "stopped") return `${SE(p.next.s, p.next.e)} · ${p.remaining} à voir`;
    if (x.s.status === "later") return "À voir";
    if (x.s.status === "stopped") return "Arrêtée";
    return x.t ? (STATUS_FR[x.t.status] || "") : "";
  };
  if (ui.seriesView === "list") {
    h += list.map(x => {
      const p = x.t ? progress(x.s, x.t) : null;
      return `<button class="li" data-a="tv" data-id="${x.s.id}"><div class="ps">${pimg(x.t?.poster_path || x.s.poster_path, x.t?.name || x.s.name, "w154")}</div>
        <div class="tx"><div class="n tse"><span>${esc(x.t?.name || x.s.name)}</span>${seTag(p)}</div><div class="d">${esc(subOf(x))}</div>
        ${p ? `<div class="prow"><div class="bar"><i style="width:${p.aired ? p.watched / p.aired * 100 : 0}%"></i></div><small>${p.watched}/${p.aired} ép. · ${plural(nSeasons(x.t), "saison")}</small></div>` : ""}</div></button>`;
    }).join("");
  } else {
    h += `<div class="grid">${list.map(x => {
      const p = x.t ? progress(x.s, x.t) : null;
      const pct = p?.aired ? Math.round(p.watched / p.aired * 100) : 0;
      const fresh = x.fresh;
      return `<button class="gp ${fresh ? "fresh" : ""}" data-a="tv" data-id="${x.s.id}"><div class="p">${pimg(x.t?.poster_path || x.s.poster_path, x.t?.name || x.s.name)}${fresh ? `<span class="newb">NOUVEL ÉP.</span>` : ""}${pct === 100 ? `<span class="badge">${I.check}</span>` : ""}${pct && pct < 100 ? `<div class="pbar"><i style="width:${pct}%"></i></div>` : ""}</div><div class="t">${esc(x.t?.name || x.s.name)}</div>${p?.next && p.watched > 0 ? `<div class="se">S${p.next.s} E${p.next.e}</div>` : ""}</button>`;
    }).join("")}</div>`;
  }
  patch(v, h);
}

// ═════════════ Vue : Suggestions ═════════════
// Palmarès sélectionnés (titre original + année de sortie) — résolus via la recherche TMDB
const AWARDS = {
  movie: [
    ["Anora", 2024, "Oscar + Palme d'or"], ["Oppenheimer", 2023, "Oscar"], ["Anatomie d'une chute", 2023, "Palme d'or"],
    ["Everything Everywhere All at Once", 2022, "Oscar"], ["Triangle of Sadness", 2022, "Palme d'or"], ["Titane", 2021, "Palme d'or"],
    ["CODA", 2021, "Oscar"], ["Nomadland", 2020, "Oscar"], ["Parasite", 2019, "Oscar + Palme d'or"], ["Green Book", 2018, "Oscar"],
    ["Shoplifters", 2018, "Palme d'or"], ["The Shape of Water", 2017, "Oscar"], ["Moonlight", 2016, "Oscar"], ["I, Daniel Blake", 2016, "Palme d'or"],
    ["Spotlight", 2015, "Oscar"], ["Birdman", 2014, "Oscar"], ["12 Years a Slave", 2013, "Oscar"], ["La Vie d'Adèle", 2013, "Palme d'or"],
    ["Amour", 2012, "Palme d'or"], ["The Artist", 2011, "Oscar"], ["The Tree of Life", 2011, "Palme d'or"], ["The King's Speech", 2010, "Oscar"],
    ["No Country for Old Men", 2007, "Oscar"], ["The Departed", 2006, "Oscar"], ["The Lord of the Rings: The Return of the King", 2003, "Oscar"],
    ["Gladiator", 2000, "Oscar"], ["Pulp Fiction", 1994, "Palme d'or"], ["Forrest Gump", 1994, "Oscar"], ["Schindler's List", 1993, "Oscar"],
    ["The Silence of the Lambs", 1991, "Oscar"], ["Apocalypse Now", 1979, "Palme d'or"], ["Taxi Driver", 1976, "Palme d'or"], ["The Godfather", 1972, "Oscar"]
  ],
  tv: [
    ["Shōgun", 2024, "Emmy meilleure série"], ["The Bear", 2022, "Emmy comédie"], ["Succession", 2018, "Emmy meilleure série"],
    ["Ted Lasso", 2020, "Emmy comédie"], ["The Crown", 2016, "Emmy meilleure série"], ["Fleabag", 2016, "Emmy comédie"],
    ["Chernobyl", 2019, "Emmy mini-série"], ["Game of Thrones", 2011, "Emmy meilleure série"], ["Breaking Bad", 2008, "Emmy meilleure série"],
    ["Mad Men", 2007, "Emmy meilleure série"], ["The Sopranos", 1999, "Emmy meilleure série"], ["The West Wing", 1999, "Emmy meilleure série"],
    ["Band of Brothers", 2001, "Emmy mini-série"], ["The Queen's Gambit", 2020, "Emmy mini-série"], ["Beef", 2023, "Emmy mini-série"],
    ["Schitt's Creek", 2015, "Emmy comédie"], ["Veep", 2012, "Emmy comédie"], ["Modern Family", 2009, "Emmy comédie"]
  ]
};
const SUG = {
  movie: [
    ["awards", "Récompensés", "Oscars du meilleur film et Palmes d'or"],
    ["/movie/top_rated", "Les incontournables", "Les mieux notés de tous les temps"],
    ["/discover/movie|primary_release_date.lte=1989-12-31&sort_by=vote_count.desc&vote_average.gte=7.4", "Classiques à avoir vus", "Les grands films d'avant 1990"],
    ["/discover/movie|sort_by=vote_average.desc&vote_count.gte=400&vote_count.lte=4000&vote_average.gte=7.6&without_original_language=en", "Pépites cinéphiles", "Cinéma d'auteur et international, moins connu"],
    ["/discover/movie|with_original_language=fr&sort_by=vote_count.desc&vote_average.gte=7.2", "Cinéma français culte", ""]
  ],
  tv: [
    ["awards", "Récompensées", "Emmy Awards"],
    ["/tv/top_rated", "Séries cultes", "Les mieux notées de tous les temps"],
    ["/discover/tv|sort_by=vote_count.desc&vote_average.gte=8", "Incontournables", "Celles qu'il faut avoir vues"],
    ["/discover/tv|with_type=2&sort_by=vote_count.desc&vote_average.gte=7.5", "Mini-séries", "Une saison, une histoire complète"],
    ["/discover/tv|sort_by=vote_average.desc&vote_count.gte=200&vote_count.lte=3000&vote_average.gte=8&without_original_language=en", "Pépites", "Séries internationales à découvrir"]
  ]
};
async function loadSug(type) {
  if (ui.sug[type]) return;
  ui.sug[type] = {};
  await Promise.all(SUG[type].map(async ([src]) => {
    try {
      let items;
      if (src === "awards") {
        items = (await Promise.all(AWARDS[type].map(async ([t, y, prize]) => {
          const r = type === "movie" ? await tmdb.searchMovie(t, y) : await tmdb.searchTv(t, y);
          return r[0] ? { ...r[0], media_type: type, prize } : null;
        }))).filter(Boolean);
      } else {
        const [path, qs] = src.split("|");
        const params = Object.fromEntries(new URLSearchParams(qs || ""));
        const pages = await Promise.all([1, 2].map(page => tmdb.get(path, { ...params, page }, { ttl: 72 })));
        items = pages.flatMap(p => p.results || []).map(x => ({ ...x, media_type: type }));
      }
      ui.sug[type][src] = items;
    } catch (e) { onErr(e); ui.sug[type][src] = []; }
    if (ui.tab === "discover") renderResults();
  }));
}
function sugHtml() {
  const type = ui.sugSeg;
  const lib = type === "movie" ? store.data.movies : store.data.shows;
  let h = `<div class="seg" style="margin-top:6px"><button data-a="sugseg" data-v="movie" class="${type === "movie" ? "on" : ""}">Films</button><button data-a="sugseg" data-v="tv" class="${type === "tv" ? "on" : ""}">Séries</button></div>`;
  for (const [src, title, sub] of SUG[type]) {
    const data = ui.sug[type]?.[src];
    h += sec(title) + (sub ? `<div class="sugsub">${esc(sub)}</div>` : "");
    if (!data) { h += `<div class="row">${Array.from({ length: 5 }, () => `<div class="pc"><div class="p sk"></div></div>`).join("")}</div>`; continue; }
    const seen = new Set();
    const items = data.filter(x => !lib.has(x.id) && !seen.has(x.id) && seen.add(x.id) && x.poster_path).slice(0, 20);
    h += items.length ? `<div class="row">${items.map(x => `<button class="pc" data-a="${type === "tv" ? "tv" : "mv"}" data-id="${x.id}"><div class="p">${pimg(x.poster_path, x.title || x.name)}</div><div class="t">${esc(x.title || x.name)}</div><div class="s">${esc(x.prize || year(x.release_date || x.first_air_date))}${x.vote_average && !x.prize ? ` · ★ ${x.vote_average.toFixed(1)}` : ""}</div></button>`).join("")}</div>`
      : `<div class="sugsub">Tu as déjà tout vu dans cette liste 👏</div>`;
  }
  return h;
}

// ═════════════ Vue : Films ═════════════
function vMovies(v) {
  const all = [...store.data.movies.values()];
  const watched = all.filter(m => m.status === "watched").sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));
  const wl = all.filter(m => m.status === "watchlist").sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  let h = top("Films", "", viewToggle());
  h += `<div class="segrow"><div class="seg"><button data-a="mseg" data-v="watchlist" class="${ui.movieSeg === "watchlist" ? "on" : ""}">À voir</button><button data-a="mseg" data-v="watched" class="${ui.movieSeg === "watched" ? "on" : ""}">Vus</button></div>${ui.movieSeg !== "watched" && wl.length > 1 ? `<button class="iconbtn roul" data-a="roulette" aria-label="Roulette : un film au hasard">${I.dice}</button>` : ""}</div>`;
  const list = ui.seriesView === "list";
  const star = m => m.rating ? `<span class="badge" style="width:auto;padding:0 6px;border-radius:8px;font-size:11px;font-weight:800">${m.rating}★</span>` : "";
  const cell = (m, sub, fresh) => list
    ? `<button class="li" data-a="mv" data-id="${m.id}"><div class="ps">${pimg(m.poster_path, m.title, "w154")}</div><div class="tx"><div class="n">${esc(m.title)}${fresh ? ` <span class="tagnew">SORTIE</span>` : ""}</div><div class="d">${esc(sub)}${m.rating ? ` · <span style="color:var(--ac)">${"★".repeat(m.rating)}</span>` : ""}</div></div></button>`
    : `<button class="gp ${fresh ? "fresh" : ""}" data-a="mv" data-id="${m.id}"><div class="p">${pimg(m.poster_path, m.title)}${fresh ? `<span class="newb">SORTIE</span>` : ""}${star(m)}</div><div class="t">${esc(m.title)}</div><div class="s">${esc(sub)}</div></button>`;
  const wrap = inner => list ? inner : `<div class="grid">${inner}</div>`;
  if (ui.movieSeg === "watched") {
    if (!watched.length) h += `<div class="empty">${I.film}<h3>Aucun film vu</h3><p>Cherche un film dans Découvrir et marque-le comme vu.</p></div>`;
    const byMonth = new Map();
    watched.forEach(m => { const k = m.watchedAt ? new Date(m.watchedAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "Date inconnue"; if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(m); });
    for (const [k, arr] of byMonth) h += sec(k.charAt(0).toUpperCase() + k.slice(1), arr.length) + wrap(arr.map(m => cell(m, year(m.release_date) + (list && m.runtime ? ` · ${Math.floor(m.runtime / 60)} h ${String(m.runtime % 60).padStart(2, "0")}` : ""))).join(""));
  } else {
    if (!wl.length) h += `<div class="empty">${I.mark}<h3>Liste vide</h3><p>Ajoute des films à voir (onglet Découvrir) : tu seras notifié à leur sortie.</p></div>`;
    else h += wrap(wl.map(m => {
      const d = needMovie(m.id); const rf = d?.release_fr || {}; const td = isoToday(); const nd = [rf.theatrical, rf.digital, m.release_date].filter(Boolean).find(x => x >= td);
      const wk = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
      const out = [rf.theatrical || m.release_date, rf.digital].filter(Boolean).find(x => x <= td && x >= wk);
      return cell(m, out ? (out === rf.digital ? "Dispo en VOD / streaming" : "Au cinéma depuis " + fmtShort(out)) : nd ? "Sortie " + fmtShort(nd) : year(m.release_date), !!out);
    }).join(""));
  }
  patch(v, h);
}

// ═════════════ Vue : Explorer ═════════════
let searchT, searchSeq = 0;
function vExplore(v, force) {
  if (!force && $("#q")) { renderResults(); return; }
  v.innerHTML = top("Découvrir", "", profileBtn) + `<label class="search">${I.search}<input id="q" type="search" placeholder="Rechercher une série, un film…" autocomplete="off" autocapitalize="off" enterkeyhint="search" value="${esc(ui.q)}"></label><div id="results"></div>`;
  $("#q").addEventListener("input", e => { ui.q = e.target.value; clearTimeout(searchT); searchT = setTimeout(doSearch, 320); });
  $("#q").addEventListener("keydown", e => { if (e.key === "Enter") { e.target.blur(); clearTimeout(searchT); doSearch(); } });
  if (ui.q && !ui.results) doSearch(); else renderResults();
  if (!ui.discover) loadDiscover();
  loadSug(ui.sugSeg);
}
async function doSearch() {
  const q = ui.q.trim(); const seq = ++searchSeq;
  if (!q) { ui.results = null; return renderResults(); }
  ui.results = "loading"; renderResults();
  try { const r = await tmdb.search(q); if (seq === searchSeq) { ui.results = r; renderResults(); } }
  catch (e) { onErr(e); if (seq === searchSeq) { ui.results = []; renderResults(); } }
}
async function loadDiscover() {
  ui.discover = {};
  try {
    const [tr, on, up] = await Promise.all([tmdb.trending("all"), tmdb.popularTv(), tmdb.upcomingMovies()]);
    ui.discover = { tr, on, up }; renderResults();
  } catch (e) { onErr(e); }
}
function inLib(x) {
  return x.media_type === "tv" ? store.data.shows.has(x.id) : store.data.movies.has(x.id);
}
function renderResults() {
  const r = $("#results"); if (!r) return;
  if (ui.results === "loading") { r.innerHTML = `<div class="empty" style="padding:30px">Recherche…</div>`; return; }
  if (Array.isArray(ui.results)) {
    r.innerHTML = ui.results.length ? ui.results.map(x => {
      const title = x.name || x.title; const d = x.first_air_date || x.release_date;
      const lib = inLib(x);
      return `<div class="li" data-a="${x.media_type === "tv" ? "tv" : "mv"}" data-id="${x.id}"><div class="ps">${pimg(x.poster_path, title, "w154")}</div>
        <div class="tx"><div class="n">${esc(title)}</div><div style="font-size:13px;color:var(--mu);margin:1px 0 3px"><span class="tag">${x.media_type === "tv" ? "Série" : "Film"}</span>${year(d)}</div><div class="d">${esc(x.overview || "")}</div></div>
        <button class="add ${lib ? "on" : ""}" data-a="quick" data-t="${x.media_type}" data-id="${x.id}" aria-label="Ajouter">${lib ? I.check : I.plus}</button></div>`;
    }).join("") : `<div class="empty" style="padding:30px">Aucun résultat pour « ${esc(ui.q)} »</div>`;
    return;
  }
  const d = ui.discover || {};
  r.innerHTML = sugHtml() + discoverRows(d);
}
function discoverRows(d) {
  const row = (arr) => `<div class="row">${(arr || []).slice(0, 20).map(x => `<button class="pc" data-a="${x.media_type === "tv" ? "tv" : "mv"}" data-id="${x.id}"><div class="p">${pimg(x.poster_path, x.name || x.title)}${inLib(x) ? `<span class="badge">${I.check}</span>` : ""}</div><div class="t">${esc(x.name || x.title)}</div><div class="s">${x.media_type === "tv" ? "Série" : "Film"} · ${year(x.first_air_date || x.release_date)}</div></button>`).join("")}</div>`;
  return !d.tr ? Array.from({ length: 2 }, () => `<div class="sec"><h2 class="sk" style="width:160px;height:20px;border-radius:6px"></h2></div><div class="row">${Array.from({ length: 5 }, () => `<div class="pc"><div class="p sk"></div></div>`).join("")}</div>`).join("")
    : sec("Tendances de la semaine") + row(d.tr) + sec("Séries en cours de diffusion") + row(d.on) + sec("Bientôt au cinéma") + row(d.up);
}

// ═════════════ Vue : Profil ═════════════
function vProfile(v, force) {
  if (ui.profPremium !== premium.isPremium()) { ui.profPremium = premium.isPremium(); force = true; }
  if (!force && $("#pstats")) { $("#pstats").innerHTML = profStats(); $("#pushcard").innerHTML = pushCard(); const a = $("#advstats"); if (a && premium.isPremium()) a.innerHTML = advStats(); return; }
  const u = store.data.user;
  v.innerHTML = top("Profil", u?.email ? esc(u.email) : "Mode local (sans compte)", `<button class="iconbtn" data-a="tab" data-v="${ui.lastTab[ui.domain]}" aria-label="Fermer">${I.x}</button>`) + `
  ${premiumCard()}
  <div class="stats" id="pstats">${profStats()}</div>
  ${premium.isPremium() ? `<div class="card" id="advstats">${advStats()}</div>` : lockedCard("Statistiques avancées", "Récap de l'année, temps passé, genres et chaînes préférés, décennies, notes moyennes, top séries, plateformes de jeux.")}
  <div class="card" id="pushcard">${pushCard()}</div>
  <div class="card"><h3>Contenus affichés</h3><p>Décoche ce que tu ne suis pas : le sélecteur du haut disparaît s'il ne reste qu'un univers.</p>
    <label class="colrow"><span>${I.film.replace("<svg", '<svg style="width:18px;height:18px;vertical-align:-4px;margin-right:8px"')}Films & séries</span><input type="checkbox" class="tgl" data-dom="av" ${ui.domains.av ? "checked" : ""}></label>
    <label class="colrow"><span>${I.pad.replace("<svg", '<svg style="width:18px;height:18px;vertical-align:-4px;margin-right:8px"')}Jeux vidéo</span><input type="checkbox" class="tgl" data-dom="games" ${ui.domains.games ? "checked" : ""}></label></div>
  <div class="card">${themeCard()}</div>
  <div class="card"><h3>Importer mon historique${premium.isPremium() ? "" : lockTag()}</h3><p>Export <b>Binge Boxd</b> (le .zip, ou sélectionne tous les .csv du dossier), export RGPD <b>TV Time</b>, ou sauvegarde Playwatch (.json).</p>
    <input type="file" id="impfile" accept=".zip,.csv,.json,application/zip,text/csv,application/json" multiple hidden>
    <button class="btn pri" data-a="impPick" style="width:100%">${I.up}Choisir le fichier</button><div id="impzone"></div></div>

  <div class="card"><h3>Sauvegarde</h3><p>Exporte toutes tes données (séries, épisodes vus, films, notes) en JSON.</p>
    <button class="btn" data-a="export" style="width:100%">${I.down}Exporter mes données</button></div>

  <div class="card"><h3>Clé TMDB</h3><p>Utilisée pour les visuels, synopsis et dates de diffusion.</p>
    <input class="field" id="tmdbk" value="${esc(tmdb.getKey())}" autocomplete="off" autocapitalize="off" spellcheck="false">
    <div class="btns" style="margin:0"><button class="btn" data-a="saveKey">Enregistrer</button><button class="btn ghost" data-a="refresh">Vider le cache</button></div></div>

  ${ui.domains.games ? `<div class="card"><h3>Clé RAWG (jeux vidéo)</h3><p>Jaquettes, fiches et sorties des jeux. Clé gratuite sur <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a>.</p>
    <input class="field" id="rawgk" value="${esc(rawg.getKey())}" placeholder="Clé API RAWG" autocomplete="off" autocapitalize="off" spellcheck="false">
    <button class="btn" data-a="saveRawg" style="width:100%">Enregistrer</button></div>` : ""}

  <div class="btns">${u && !u.local ? `<button class="btn ghost" data-a="logout">Se déconnecter</button>` : ""}<button class="btn ghost danger" data-a="wipe">Tout effacer</button></div>
  ${u && !u.local ? `<div class="card"><h3>Supprimer mon compte</h3><p>Supprime définitivement ton compte et toutes tes données (séries, films, jeux, notifications). Pense à exporter une sauvegarde avant.</p>
    <div id="delzone"><button class="btn ghost danger" data-a="delAccount" style="width:100%">${I.trash}Supprimer mon compte</button></div></div>` : ""}
  <div class="foot"><a href="privacy.html" target="_blank" rel="noopener">Politique de confidentialité</a> · <a href="delete-account.html" target="_blank" rel="noopener">Suppression des données</a><br>Ce produit utilise l'API <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> mais n'est ni approuvé ni certifié par TMDB. Jeux : <a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a>.</div>
`;
  $("#impfile").addEventListener("change", e => runImport([...e.target.files]));
  v.querySelectorAll("input[data-dom]").forEach(cb => cb.addEventListener("change", () => {
    const d = { ...ui.domains, [cb.dataset.dom]: cb.checked };
    if (!d.av && !d.games) { cb.checked = true; return toast("Garde au moins un des deux"); }
    ui.domains = d; try { localStorage.setItem("bobine:domains", JSON.stringify(d)); } catch { }
    fixDomain(); renderView(true);
  }));
}
function profStats() {
  const shows = [...store.data.shows.values()];
  let eps = 0, smin = 0;
  for (const s of shows) {
    const n = seenCount(s, details.get(s.id)); eps += n;
    const t = details.get(s.id);
    smin += n * (s.runtime || t?.episode_run_time?.[0] || t?.last_episode_to_air?.runtime || 40);
  }
  const mw = [...store.data.movies.values()].filter(m => m.status === "watched");
  const mmin = mw.reduce((n, m) => n + (m.runtime || movieD.get(m.id)?.runtime || 110), 0);
  return `<div class="stat"><b>${shows.length}</b><span>séries suivies</span></div>
    <div class="stat"><b>${eps.toLocaleString("fr-FR")}</b><span>épisodes vus</span></div>
    <div class="stat"><b>${dur(smin)}</b><span>devant des séries</span></div>
    <div class="stat"><b>${mw.length}</b><span>films vus · ${dur(mmin)}</span></div>` + (ui.domains.games ? (() => {
    const gs = [...store.data.games.values()];
    const done = gs.filter(g => g.status === "beaten" || g.status === "completed").length;
    return `<div class="stat"><b>${gs.filter(g => g.status === "playing").length}</b><span>jeux en cours</span></div><div class="stat"><b>${done}</b><span>jeux terminés</span></div>`;
  })() : "");
}
function pushCard() {
  const ps = ui.pushStatus;
  const [label, txt] = {
    on: ["Activées", "Tu reçois une notif à chaque nouvel épisode et à la sortie des films de ta liste « À voir »."],
    off: ["Désactivées", "Active-les pour être prévenu des nouveaux épisodes."],
    denied: ["Bloquées", "Autorise Playwatch dans Réglages iOS → Notifications → Playwatch."],
    install: ["Installe l'app d'abord", "Sur iPhone, les notifications ne marchent que depuis l'écran d'accueil : Partager → « Sur l'écran d'accueil », puis rouvre Playwatch depuis l'icône."],
    local: ["Indisponibles en mode local", "Configure Firebase (voir README) pour la synchro et les notifications."],
    noconfig: ["Non configurées", "Ajoute la clé VAPID publique dans js/config.js (voir README)."],
    unsupported: ["Non supportées", "Ce navigateur ne gère pas le Web Push."]
  }[ps] || ["…", ""];
  return `<h3>${I.bell.replace("<svg", '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px;color:var(--ac)"')}Notifications : ${label}</h3><p>${txt}</p>
    <div class="btns" style="margin:0">${ps === "off" ? `<button class="btn pri" data-a="pushOn">${premium.isPremium() ? "Activer" : I.lock + "Activer avec Premium"}</button>` : ""}${ps === "on" ? `<button class="btn" data-a="pushTest">Tester</button><button class="btn ghost" data-a="pushOff">Désactiver</button>` : ""}</div>`;
}


// ═════════════ Premium ═════════════
const lockTag = () => ` <span class="ptag">${I.crown}Premium</span>`;
function lockedCard(title, txt) {
  return `<div class="card locked" data-a="paywall" data-v="stats"><h3>${title}${lockTag()}</h3><p>${txt}</p>
    <div class="ghostbars"><i style="width:82%"></i><i style="width:64%"></i><i style="width:45%"></i><i style="width:30%"></i></div>
    <button class="btn pri" style="width:100%">${I.lock}Débloquer avec Premium</button></div>`;
}
function premiumCard() {
  const u = store.data.user; if (!u || u.local) return "";
  if (premium.isPremium()) return `<div class="card pcard on"><h3>${I.crown}Playwatch Premium</h3><p>Merci pour ton soutien ! Toutes les fonctions sont débloquées, à vie, sur tous tes appareils.</p></div>`;
  return `<div class="card pcard" data-a="paywall" data-v="card"><h3>${I.crown}Passe à Premium</h3><p>Notifications, statistiques avancées, thèmes et import d'historique. Un seul paiement, à vie.</p>
    <button class="btn pri" style="width:100%">Découvrir Premium</button></div>`;
}
const PERKS = [
  ["push", I.bell, "Notifications", "Nouvel épisode, sortie ciné/VOD d'un film de ta liste, sortie d'un jeu attendu."],
  ["stats", I.spark, "Statistiques avancées", "Récap de l'année, temps passé, genres, chaînes, décennies, notes, top séries."],
  ["theme", I.star, "Thèmes & couleurs", "7 thèmes et réglage libre du fond, des bandeaux et de l'accent."],
  ["import", I.up, "Import d'historique", "Reprends tout depuis TV Time, Binge Boxd ou une sauvegarde."]
];
function openPaywall(why) {
  if (store.data.user?.local) return toast("Premium nécessite un compte");
  const sh = openSheet(sh => {
    if (premium.isPremium()) return `<div class="body pw"><div class="pwhero">${I.crown}</div><h2>Premium activé</h2><p class="pwsub">Tout est débloqué. Merci !</p><button class="btn pri" data-a="closeSheet" style="width:100%">Continuer</button></div>`;
    const ch = premium.channel();
    return `<div class="body pw"><div class="pwhero">${I.crown}</div><h2>Playwatch Premium</h2>
      <p class="pwsub">Un seul paiement, débloqué à vie sur tous tes appareils.</p>
      <div class="perks">${PERKS.map(([k, ic, t, d]) => `<div class="perk ${k === why ? "hi" : ""}">${ic}<div><b>${t}</b><span>${d}</span></div></div>`).join("")}</div>
      ${ch === "none" ? `<p class="pwsub" style="margin-top:18px">Le paiement arrive bientôt sur cet appareil.</p>` :
        `<button class="btn pri big" data-a="buyPremium" style="width:100%;margin-top:18px">Débloquer — ${esc(sh.state.price || premium.PRICE_FALLBACK)}</button>`}
      <button class="btn ghost" data-a="restorePremium" style="width:100%;margin-top:10px">Restaurer mes achats</button>
      <p class="pwlegal">Paiement unique, sans abonnement. ${ch === "play" ? "Paiement sécurisé par Google Play." : ch === "stripe" ? "Paiement sécurisé par Stripe. En achetant, tu demandes l'accès immédiat à Premium et renonces à ton droit de rétractation de 14 jours pour ce contenu numérique." : ""} Le suivi de tes séries, films et jeux reste gratuit et illimité.</p></div>`;
  });
  premium.price().then(p => { sh.state.price = p; sh.refresh(); }).catch(() => { });
  return sh;
}

// Statistiques avancées (Premium) — calculées sur l'appareil, aucune lecture Firestore
function advStats() {
  const Y = new Date().getFullYear(), inY = ts => ts && new Date(ts).getFullYear() === Y;
  const shows = [...store.data.shows.values()], movies = [...store.data.movies.values()], games = [...store.data.games.values()];
  const mw = movies.filter(m => m.status === "watched");
  const count = (arr) => { const m = new Map(); arr.forEach(k => k && m.set(k, (m.get(k) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const bars = (rows, unit = "") => { const max = Math.max(1, ...rows.map(r => r[1])); return `<div class="bars">${rows.map(([k, n]) => `<div class="br"><span class="bl">${esc(String(k))}</span><span class="bt"><i style="width:${Math.max(4, n / max * 100)}%"></i></span><b>${n.toLocaleString("fr-FR")}${unit}</b></div>`).join("")}</div>`; };
  const block = (t, inner) => inner ? `<h4 class="ast">${t}</h4>${inner}` : "";
  // Récap de l'année
  const myr = mw.filter(m => inY(m.watchedAt)), mmin = myr.reduce((n, m) => n + (m.runtime || movieD.get(m.id)?.runtime || 110), 0);
  const syr = shows.filter(s => inY(s.lastWatchedAt)).length, gyr = games.filter(g => inY(g.finishedAt)).length;
  let h = `<h3>${I.crown}Récap ${Y}</h3><div class="stats mini"><div class="stat"><b>${myr.length}</b><span>films · ${dur(mmin)}</span></div><div class="stat"><b>${syr}</b><span>séries regardées</span></div>${ui.domains.games ? `<div class="stat"><b>${gyr}</b><span>jeux terminés</span></div>` : ""}</div>`;
  // Top séries par épisodes vus
  const topS = shows.map(s => [s.name || "?", seenCount(s, details.get(s.id))]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  h += block("Séries les plus regardées (épisodes)", topS.length ? bars(topS) : "");
  // Genres de séries + chaînes
  const tvs = shows.map(s => details.get(s.id)).filter(Boolean);
  const gen = count(tvs.flatMap(t => (t.genres || []).map(g => g?.name || g))).slice(0, 6);
  h += block("Genres de séries préférés", gen.length ? bars(gen) : "");
  const net = count(tvs.map(t => t.networks?.[0]?.name || t.networks?.[0])).slice(0, 5);
  h += block("Chaînes et plateformes", net.length ? bars(net) : "");
  // Films vus par année
  const yrs = count(mw.map(m => m.watchedAt ? new Date(m.watchedAt).getFullYear() : null)).sort((a, b) => b[0] - a[0]).slice(0, 6);
  h += block("Films vus par année", yrs.length ? bars(yrs) : "");
  // Décennies
  const dec = count(mw.map(m => m.release_date ? Math.floor(+m.release_date.slice(0, 4) / 10) * 10 + "s" : null)).sort((a, b) => b[1] - a[1]).slice(0, 6);
  h += block("Décennies des films vus", dec.length ? bars(dec) : "");
  // Notes
  const rated = mw.filter(m => m.rating);
  if (rated.length) h += block("Tes notes de films", `<p class="ast2">Moyenne <b>${(rated.reduce((n, m) => n + m.rating, 0) / rated.length).toFixed(1).replace(".", ",")}</b> sur ${rated.length} film${rated.length > 1 ? "s" : ""} noté${rated.length > 1 ? "s" : ""}</p>` + bars([5, 4, 3, 2, 1].map(n => ["★".repeat(n), rated.filter(m => m.rating === n).length]).filter(x => x[1])));
  // Jeux
  if (ui.domains.games && games.length) {
    h += block("Plateformes de jeux", bars(count(games.map(g => g.platform)).slice(0, 5)) );
    const gg = count(games.flatMap(g => (g.genres || []).map(x => x.name || x))).slice(0, 5);
    h += block("Genres de jeux", gg.length ? bars(gg) : "");
  }
  return h;
}

// ═════════════ Jeux vidéo ═════════════
const G_F = [["playing", "En cours"], ["backlog", "À jouer"], ["beaten", "Terminés"], ["abandoned", "Abandonnés"], ["all", "Tous"]];
// Anciens statuts regroupés : Envies / En pause → À jouer, 100 % → Terminés
const G_MAP = { wishlist: "backlog", paused: "backlog", completed: "beaten" };
const gst = g => G_MAP[g?.status] || g?.status;
const G_LABEL = Object.fromEntries(G_F);
const G_ICON = { playing: I.play, backlog: I.mark, beaten: I.check, abandoned: I.stop };
ui.gameFilter = "playing"; ui.gsug = {}; ui.gq = "";
const gameD = new Map(), gameLite = new Map();
function needGame(id) {
  const k = "g" + id;
  if (!requested.has(k)) {
    requested.add(k);
    (async () => {
      if (!gameD.has(id)) { const c = await rawg.peek(`/games/${id}`); if (c) { gameD.set(id, c); later(); } }
      try { gameD.set(id, await rawg.game(id)); later(); } catch (e) { gameErr(e); }
    })();
  }
  return gameD.get(id);
}
let gErrShown = 0;
function gameErr(e) {
  console.warn(e);
  if (Date.now() - gErrShown < 8000) return; gErrShown = Date.now();
  if (e.message === "BAD_RAWG_KEY") toast("Clé RAWG refusée — vérifie-la dans le profil");
  else if (!navigator.onLine) toast("Hors ligne — affichage du cache");
}
const gcover = (url, alt) => url ? `<img src="${gimg(url, 640)}" alt="" loading="lazy" decoding="async">` : `<div class="noimg">${esc(alt)}</div>`;
const noKey = () => `<div class="card"><h3>${I.pad.replace("<svg", '<svg style="width:20px;height:20px;vertical-align:-4px;margin-right:8px;color:var(--ac)"')}Une clé RAWG pour les jeux</h3>
  <p>Les jaquettes, fiches et dates de sortie viennent de RAWG. Crée un compte gratuit sur <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a>, clique « Get API Key » et colle la clé ici.</p>
  <input class="field" id="rawgk" placeholder="Clé API RAWG" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn pri" data-a="saveRawg" style="width:100%">Enregistrer</button></div>`;
const isNewRelease = g => gst(g) === "backlog" && g.released && g.released <= isoToday() && daysFrom(g.released) >= -7;

async function setGame(id, status) {
  const prev = store.data.games.get(id);
  let d = gameD.get(id) || gameLite.get(id);
  if (!d || !d.platforms) { try { d = await rawg.game(id); gameD.set(id, d); } catch (e) { if (!d) throw e; } }
  const now = Date.now();
  await store.saveGame({
    ...(prev || {}), id, name: d.name, background_image: d.background_image || null, released: d.released || null, tba: !!d.tba,
    genres: d.genres || [], status, addedAt: prev?.addedAt || now, lastAt: now,
    startedAt: status === "playing" ? (prev?.startedAt || now) : (prev?.startedAt || null),
    finishedAt: ["beaten", "completed"].includes(status) ? (prev?.finishedAt || now) : (prev?.finishedAt || null)
  });
}

function vGames(v) {
  let h = top("Jeux", "", viewToggle());
  if (!rawg.getKey()) { patch(v, h + noKey()); return; }
  const all = [...store.data.games.values()];
  if (!G_LABEL[ui.gameFilter]) ui.gameFilter = "playing";
  const fresh = all.filter(isNewRelease).length;
  h += `<div class="chips">${G_F.map(([k, l]) => `<button class="chip ${ui.gameFilter === k ? "on" : ""}" data-a="gfilter" data-v="${k}">${l}${k === "backlog" && fresh ? `<i class="dot">${fresh}</i>` : ""}</button>`).join("")}</div>`;
  const list = (ui.gameFilter === "all" ? all : all.filter(g => gst(g) === ui.gameFilter)).sort((a, b) => (b.lastAt || b.addedAt || 0) - (a.lastAt || a.addedAt || 0));
  if (!all.length) { patch(v, h + `<div class="empty">${I.pad}<h3>Ludothèque vide</h3><p>Ajoute tes jeux depuis Découvrir.</p><div class="btns"><button class="btn pri" data-a="tab" data-v="gdiscover">${I.search}Découvrir</button></div></div>`); return; }
  if (!list.length) { patch(v, h + `<div class="empty">${I.pad}<h3>Rien ici</h3><p>Aucun jeu dans cette catégorie.</p></div>`); return; }
  if (ui.seriesView === "list") {
    h += list.map(g => `<button class="li" data-a="game" data-id="${g.id}"><div class="ps">${gcover(g.background_image, g.name)}</div><div class="tx"><div class="n">${esc(g.name)}</div>
      <div class="d">${esc([g.platform, year(g.released), ui.gameFilter === "all" ? G_LABEL[gst(g)] : ""].filter(Boolean).join(" · "))}${g.rating ? ` · <span style="color:var(--ac)">${"★".repeat(g.rating)}</span>` : ""}</div></div></button>`).join("");
  } else {
    h += `<div class="grid">${list.map(g => { const nw = isNewRelease(g); return `<button class="gp ${nw ? "fresh" : ""}" data-a="game" data-id="${g.id}"><div class="p">${gcover(g.background_image, g.name)}${nw ? `<span class="newb">SORTI !</span>` : ""}${g.rating ? `<span class="badge" style="width:auto;padding:0 6px;border-radius:8px;font-size:11px;font-weight:800">${g.rating}★</span>` : ""}</div><div class="t">${esc(g.name)}</div></button>`; }).join("")}</div>`;
  }
  patch(v, h);
}

const GOTY = [["Clair Obscur: Expedition 33", 2025], ["Astro Bot", 2024], ["Baldur's Gate 3", 2023], ["Elden Ring", 2022], ["It Takes Two", 2021], ["The Last of Us Part II", 2020],
  ["Sekiro: Shadows Die Twice", 2019], ["God of War", 2018], ["The Legend of Zelda: Breath of the Wild", 2017], ["Overwatch", 2016], ["The Witcher 3: Wild Hunt", 2015], ["Dragon Age: Inquisition", 2014]];
function gSugDefs() {
  const y = new Date().getFullYear(), td = isoToday();
  return [
    ["goty", "Jeux de l'année", "Lauréats des Game Awards"],
    ["mc", "Chefs-d'œuvre", "Les mieux notés par la presse", { metacritic: "92,100", ordering: "-metacritic" }],
    ["recent", "Incontournables récents", "Les meilleurs de ces deux dernières années", { dates: `${y - 2}-01-01,${td}`, metacritic: "82,100", ordering: "-metacritic" }],
    ["cult", "Cultes", "Les plus joués de tous les temps", { ordering: "-added" }],
    ["indie", "Pépites indé", "Petits studios, grands jeux", { genres: "indie", metacritic: "84,100", ordering: "-metacritic" }],
    ["retro", "Rétro à avoir joué", "Les classiques d'avant 2006", { dates: "1985-01-01,2005-12-31", metacritic: "90,100", ordering: "-metacritic" }]
  ];
}
async function loadGSug() {
  if (ui.gsugLoading) return; ui.gsugLoading = true;
  await Promise.all(gSugDefs().map(async ([k, , , params]) => {
    if (ui.gsug[k]) return;
    try {
      ui.gsug[k] = k === "goty"
        ? (await Promise.all(GOTY.map(async ([n, y]) => { const g = await rawg.searchOne(n).catch(() => null); return g ? { ...g, prize: "GOTY " + y } : null; }))).filter(Boolean)
        : await rawg.list(params, 72);
      ui.gsug[k].forEach(g => gameLite.set(g.id, g));
    } catch (e) { gameErr(e); ui.gsug[k] = []; }
    if (ui.tab === "gdiscover") renderGResults();
  }));
  ui.gsugLoading = false;
}
const gRow = items => `<div class="row">${items.map(g => `<button class="pc" data-a="game" data-id="${g.id}"><div class="p">${gcover(g.background_image, g.name)}${store.data.games.has(g.id) ? `<span class="badge">${I.check}</span>` : ""}</div><div class="t">${esc(g.name)}</div><div class="s">${esc(g.prize || [year(g.released), g.metacritic ? "MC " + g.metacritic : ""].filter(Boolean).join(" · "))}</div></button>`).join("")}</div>`;
const skRow = () => `<div class="row">${Array.from({ length: 5 }, () => `<div class="pc"><div class="p sk"></div></div>`).join("")}</div>`;
function vGSuggest(v) {
  let h = top("Suggestions", "Cultes, récompensés, à avoir joué", profileBtn);
  if (!rawg.getKey()) { v.innerHTML = h + noKey(); return; }
  loadGSug();
  for (const [k, title, sub] of gSugDefs()) {
    const data = ui.gsug[k];
    h += sec(title) + `<div class="sugsub">${esc(sub)}</div>`;
    if (!data) { h += skRow(); continue; }
    const items = data.filter(g => !store.data.games.has(g.id) && g.background_image).slice(0, 20);
    h += items.length ? gRow(items) : `<div class="sugsub">Tu les as déjà tous 👏</div>`;
  }
  v.innerHTML = h;
}

function vGUpcoming(v) {
  let h = top("À venir", "Sorties des jeux de ta liste", profileBtn);
  if (!rawg.getKey()) { patch(v, h + noKey()); return; }
  const td = isoToday();
  const mine = [...store.data.games.values()].filter(g => ["wishlist", "backlog"].includes(g.status) && (g.tba || (g.released && g.released >= td)))
    .sort((a, b) => (a.tba ? "9" : a.released) > (b.tba ? "9" : b.released) ? 1 : -1);
  if (mine.length) {
    const groups = new Map();
    mine.forEach(g => { const k = g.tba || !g.released ? "Date à confirmer" : g.released; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); });
    for (const [date, arr] of groups) {
      const d = date.length === 10 ? daysFrom(date) : null;
      h += `<div class="day"><h3>${d === 0 ? "<b>Aujourd'hui</b>" : d === 1 ? "<b>Demain</b>" : esc(d === null ? date : fmtLong(date))}${d > 1 ? ` · <span style="text-transform:none;letter-spacing:0">dans ${d} j</span>` : ""}</h3>${arr.map(g =>
        `<button class="cal" data-a="game" data-id="${g.id}"><div class="ps">${gcover(g.background_image, g.name)}</div><div class="tx" style="flex:1;min-width:0"><div style="font-weight:650">${esc(g.name)}</div><div style="color:var(--mu);font-size:13px">${esc(G_LABEL[gst(g)])}</div></div></button>`).join("")}</div>`;
    }
  } else h += `<div class="empty" style="padding:24px">${I.cal}<h3>Rien d'annoncé dans ta liste</h3><p>Ajoute des jeux pas encore sortis à « À jouer » : tu seras notifié le jour de leur sortie.</p></div>`;
  if (!ui.gup) { ui.gup = "loading"; const y = new Date(); const end = new Date(y.getTime() + 365 * DAY).toISOString().slice(0, 10);
    rawg.list({ dates: `${td},${end}`, ordering: "-added" }, 12).then(r => { ui.gup = r; r.forEach(g => gameLite.set(g.id, g)); if (ui.tab === "gupcoming") renderView(); }).catch(e => { gameErr(e); ui.gup = []; }); }
  h += sec("Les plus attendus") + (Array.isArray(ui.gup) ? gRow(ui.gup.filter(g => g.background_image).map(g => ({ ...g, prize: g.tba ? "Date à venir" : g.released ? fmtShort(g.released) : "" }))) : skRow());
  patch(v, h);
}

let gSearchT, gSeq = 0;
function vGExplore(v, force) {
  if (!force && $("#gq")) { renderGResults(); return; }
  let h = top("Découvrir", "", profileBtn);
  if (!rawg.getKey()) { v.innerHTML = h + noKey(); return; }
  loadGSug();
  v.innerHTML = h + `<label class="search">${I.search}<input id="gq" type="search" placeholder="Rechercher un jeu…" autocomplete="off" autocapitalize="off" enterkeyhint="search" value="${esc(ui.gq)}"></label><div id="gresults"></div>`;
  $("#gq").addEventListener("input", e => { ui.gq = e.target.value; clearTimeout(gSearchT); gSearchT = setTimeout(doGSearch, 350); });
  $("#gq").addEventListener("keydown", e => { if (e.key === "Enter") { e.target.blur(); clearTimeout(gSearchT); doGSearch(); } });
  if (ui.gq && !ui.gres) doGSearch(); else renderGResults();
  if (!ui.gdisc) {
    ui.gdisc = {}; const td = isoToday(); const from = new Date(Date.now() - 120 * DAY).toISOString().slice(0, 10);
    Promise.all([rawg.list({ dates: `${from},${td}`, ordering: "-added" }, 12), rawg.list({ ordering: "-rating", metacritic: "80,100", dates: `${new Date().getFullYear() - 1}-01-01,${td}` }, 24)])
      .then(([a, b]) => { ui.gdisc = { trend: a, top: b }; [...a, ...b].forEach(g => gameLite.set(g.id, g)); renderGResults(); }).catch(gameErr);
  }
}
async function doGSearch() {
  const q = ui.gq.trim(); const seq = ++gSeq;
  if (!q) { ui.gres = null; return renderGResults(); }
  ui.gres = "loading"; renderGResults();
  try { const r = await rawg.search(q); r.forEach(g => gameLite.set(g.id, g)); if (seq === gSeq) { ui.gres = r; renderGResults(); } }
  catch (e) { gameErr(e); if (seq === gSeq) { ui.gres = []; renderGResults(); } }
}
function renderGResults() {
  const r = $("#gresults"); if (!r) return;
  if (ui.gres === "loading") { r.innerHTML = `<div class="empty" style="padding:30px">Recherche…</div>`; return; }
  if (Array.isArray(ui.gres)) {
    r.innerHTML = ui.gres.length ? ui.gres.map(g => { const lib = store.data.games.has(g.id); return `<div class="li" data-a="game" data-id="${g.id}"><div class="ps">${gcover(g.background_image, g.name)}</div>
      <div class="tx"><div class="n">${esc(g.name)}</div><div class="d">${esc([year(g.released) || (g.tba ? "À venir" : ""), g.platforms.slice(0, 3).join(", ")].filter(Boolean).join(" · "))}</div>${g.metacritic ? `<div class="d"><span class="tag">MC ${g.metacritic}</span></div>` : ""}</div>
      <button class="add ${lib ? "on" : ""}" data-a="gquick" data-id="${g.id}" aria-label="Ajouter">${lib ? I.check : I.plus}</button></div>`; }).join("")
      : `<div class="empty" style="padding:30px">Aucun jeu pour « ${esc(ui.gq)} »</div>`;
    return;
  }
  const d = ui.gdisc || {};
  let sug = "";
  for (const [k, title, sub] of gSugDefs()) {
    const data = ui.gsug[k];
    sug += sec(title) + `<div class="sugsub">${esc(sub)}</div>`;
    if (!data) { sug += skRow(); continue; }
    const items = data.filter(g => !store.data.games.has(g.id) && g.background_image).slice(0, 20);
    sug += items.length ? gRow(items) : `<div class="sugsub">Tu les as déjà tous 👏</div>`;
  }
  r.innerHTML = (!d.trend ? sec("Tendances") + skRow() : sec("Tendances") + gRow(d.trend.filter(g => g.background_image))) + sug
    + (d.top ? sec("Les mieux notés récemment") + gRow(d.top.filter(g => g.background_image)) : "");
}

function openGame(id) {
  const sh = openSheet(sh => gameSheet(id, sh));
  rawg.screenshots(id).then(x => { sh.state.shots = x; sh.refresh(); }).catch(() => { sh.state.shots = []; });
}
function gameSheet(id, sh) {
  const d = needGame(id) || gameLite.get(id); const g = store.data.games.get(id); const st = sh.state;
  if (!d) return `<div class="hero sk"></div><div class="body"><div class="sk" style="height:28px;width:70%;border-radius:8px"></div></div>`;
  const hero = d.background_image_additional || d.background_image;
  const meta = [year(d.released) || (d.tba ? "À venir" : ""), (d.developers || [])[0], d.playtime ? `~${d.playtime} h` : ""].filter(Boolean).map(esc).join(" · ");
  const plats = d.platformsFull || d.platforms || [];
  const future = d.tba || (d.released && d.released > isoToday());
  return `<div class="hero">${hero ? `<img src="${gimg(hero, 1280)}" alt="">` : ""}</div>
  <div class="hd"><div class="ps">${gcover(d.background_image, d.name)}</div><div><h1>${esc(d.name)}</h1><div class="meta">${meta}</div>
    <div class="meta" style="margin-top:3px">${d.metacritic ? `<span class="mc ${d.metacritic >= 75 ? "hi" : d.metacritic >= 50 ? "mid" : "lo"}">${d.metacritic}</span> Metacritic` : ""}${d.released && future ? ` · Sortie ${esc(fmtFull(d.released))}` : ""}</div></div></div>
  <div class="body">
    <div class="btns">${g ? `<button class="btn pri" data-a="gstatus" data-id="${id}">${G_ICON[gst(g)] || ""}${esc(G_LABEL[gst(g)] || "Statut")} ▾</button>`
      : future ? `<button class="btn pri" data-a="gadd" data-v="backlog" data-id="${id}">${I.plus}À jouer à sa sortie</button>`
      : `<button class="btn pri" data-a="gadd" data-v="backlog" data-id="${id}">${I.plus}À jouer</button><button class="btn" data-a="gadd" data-v="playing" data-id="${id}">${I.play}J'y joue</button><button class="btn" data-a="gstatus" data-id="${id}">${I.more}</button>`}</div>
    ${g ? `<div style="color:var(--mu);font-size:13px">Ta note :</div><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-a="grate" data-id="${id}" data-v="${n}" class="${(g.rating || 0) >= n ? "on" : ""}" aria-label="${n} étoiles">${I.star}</button>`).join("")}</div>` : ""}
    ${plats.length ? `<div style="color:var(--mu);font-size:13px;margin-top:8px">${g ? "Tu y joues sur :" : "Plateformes"}</div><div class="gen">${plats.map(p => g ? `<button class="pchip ${g.platform === p ? "on" : ""}" data-a="gplat" data-id="${id}" data-v="${esc(p)}">${esc(p)}</button>` : `<span>${esc(p)}</span>`).join("")}</div>` : ""}
    ${d.genres?.length ? `<div class="gen">${d.genres.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    ${d.description ? `<div class="syn ${st.full ? "" : "clamp"}" data-a="synMore">${esc(d.description)}</div><div class="vo">Description en VO (RAWG)</div>` : !gameD.has(id) ? `<div class="syn sk" style="height:60px;border-radius:8px"></div>` : ""}
    ${g ? `<div class="memo"><label>${I.edit}Mémo perso</label><textarea data-memo="gm" data-id="${id}" rows="3" placeholder="Où j'en suis, avis, rappel…">${esc(g.note || "")}</textarea></div>` : ""}
    ${st.shots?.length ? sec("Captures") + `<div class="row shots">${st.shots.map(u => `<img src="${gimg(u, 640)}" alt="" loading="lazy">`).join("")}</div>` : ""}
    ${(d.publishers || []).length ? `<div class="sugsub" style="margin-top:18px">Éditeur : ${esc(d.publishers.join(", "))}</div>` : ""}
    <div class="foot">Données <a href="https://rawg.io/games/${id}" target="_blank" rel="noopener">RAWG</a></div>
  </div>`;
}

// ═════════════ Apparence ═════════════
const THEMES = {
  nuit: { name: "Nuit", bg: "#0d0d11", band: "#16161c", ac: "#ffc83d" },
  ardoise: { name: "Ardoise", bg: "#11161d", band: "#1a2230", ac: "#5ec8ff" },
  bordeaux: { name: "Bordeaux", bg: "#140a0d", band: "#24121a", ac: "#ff6b81" },
  foret: { name: "Forêt", bg: "#0b130f", band: "#13221a", ac: "#5fe0a0" },
  violet: { name: "Violet", bg: "#100c18", band: "#1d1630", ac: "#b48cff" },
  noir: { name: "OLED", bg: "#000000", band: "#111111", ac: "#ffffff" },
  clair: { name: "Clair", bg: "#f4f2ee", band: "#ffffff", ac: "#d9480f" }
};
const hex2rgb = h => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const rgb2hex = a => "#" + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((x, i) => x + (hex2rgb(b)[i] - x) * t));
const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
function getTheme() { try { return JSON.parse(localStorage.getItem("bobine:theme") || "null"); } catch { return null; } }
function applyTheme(t, save) {
  const r = document.documentElement.style;
  if (save) { try { t ? localStorage.setItem("bobine:theme", JSON.stringify(t)) : localStorage.removeItem("bobine:theme"); } catch { } }
  if (!t) { ["--bg", "--s1", "--s2", "--s3", "--bar", "--line", "--tx", "--mu", "--mu2", "--ac", "--ac-tx"].forEach(k => r.removeProperty(k)); document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#0d0d11"); return; }
  const light = lum(t.bg) > .4;
  const ink = light ? "#111111" : "#ffffff";
  r.setProperty("--bg", t.bg);
  r.setProperty("--s1", t.band);
  r.setProperty("--s2", mix(t.band, ink, light ? .06 : .06));
  r.setProperty("--s3", mix(t.band, ink, light ? .14 : .13));
  r.setProperty("--bar", t.band + "eb");
  r.setProperty("--line", light ? "#0000001a" : "#ffffff14");
  r.setProperty("--tx", light ? "#16161a" : "#f3f3f6");
  r.setProperty("--mu", light ? "#5d5d68" : "#9b9bab");
  r.setProperty("--mu2", light ? "#85858f" : "#6d6d7c");
  r.setProperty("--ac", t.ac);
  r.setProperty("--ac-tx", lum(t.ac) > .45 ? "#1a1400" : "#ffffff");
  document.documentElement.style.colorScheme = light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
}
function themeCard() {
  const cur = getTheme() || THEMES.nuit;
  const sw = Object.entries(THEMES).map(([k, t]) => `<button class="swatch ${cur.bg === t.bg && cur.band === t.band && cur.ac === t.ac ? "on" : ""}" data-a="theme" data-v="${k}" title="${t.name}" style="background:${t.bg}"><i style="background:${t.band};border-top:3px solid ${t.ac}"></i></button>`).join("");
  return `<h3>Apparence${premium.isPremium() ? "" : lockTag()}</h3><p>Choisis un thème ou règle tes couleurs.</p><div class="swatches">${sw}</div>
    <label class="colrow"><span>Fond</span><input type="color" data-c="bg" value="${cur.bg}" ${premium.isPremium() ? "" : "disabled"}></label>
    <label class="colrow"><span>Bandeaux et cartes</span><input type="color" data-c="band" value="${cur.band}" ${premium.isPremium() ? "" : "disabled"}></label>
    <label class="colrow"><span>Couleur d'accent</span><input type="color" data-c="ac" value="${cur.ac}" ${premium.isPremium() ? "" : "disabled"}></label>
    <button class="btn ghost" data-a="themeReset" style="width:100%;margin-top:10px">Thème par défaut</button>`;
}
const memoT = {};
document.addEventListener("input", e => {
  const mk = e.target?.dataset?.memo;
  if (mk) {
    const id = +e.target.dataset.id, val = e.target.value.slice(0, 2000);
    clearTimeout(memoT[mk + id]);
    memoT[mk + id] = setTimeout(() => {
      const [get, save] = mk === "tv" ? [store.data.shows, store.saveShow] : mk === "mv" ? [store.data.movies, store.saveMovie] : [store.data.games, store.saveGame];
      const it = get.get(id); if (it && (it.note || "") !== val) save({ ...it, note: val || null });
    }, 700);
    return;
  }
  const k = e.target?.dataset?.c; if (!k) return;
  if (!premium.isPremium()) return openPaywall("theme");
  const t = { ...(getTheme() || THEMES.nuit) }; t[k] = e.target.value; delete t.name;
  applyTheme(t, true);
});
applyTheme(getTheme());

// ═════════════ Feuilles (fiches) ═════════════
const sheets = [];
function openSheet(build) {
  const el = document.createElement("div");
  el.className = "sheet";
  $("#sheets").appendChild(el);
  const sh = { el, state: {}, refresh() {
    // Pas de rafraîchissement pendant la saisie d'un mémo (on le fera à la sortie du champ)
    const ae = document.activeElement;
    if (ae && el.contains(ae) && ae.matches("textarea,input")) { if (!sh.pending) { sh.pending = true; ae.addEventListener("blur", () => { sh.pending = false; sh.refresh(); }, { once: true }); } return; }
    const y = el.scrollTop; el.innerHTML = `<button class="close" data-a="closeSheet" aria-label="Fermer">${I.x}</button>` + build(sh); el.scrollTop = y; sh.after?.(); } };
  sheets.push(sh);
  sh.refresh();
  history.pushState({ sheet: sheets.length }, "");
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  swipeToClose(el);
  document.body.style.overflow = "hidden";
  return sh;
}
function closeTopSheet() {
  const sh = sheets.pop(); if (!sh) return;
  sh.el.classList.remove("in");
  setTimeout(() => sh.el.remove(), 330);
  if (!sheets.length) { document.body.style.overflow = ""; if (ui.dirty) { ui.dirty = false; renderView(true); } }
}
let ignorePop = false;
function closeAllSheets() {
  const n = sheets.length; if (!n) return;
  while (sheets.length) closeTopSheet();
  ignorePop = true; history.go(-n);
}
window.addEventListener("popstate", () => { if (ignorePop) { ignorePop = false; return; } if (sheets.length) closeTopSheet(); });
function swipeToClose(el) {
  let y0 = null, dy = 0;
  el.addEventListener("touchstart", e => { if (el.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } else y0 = null; }, { passive: true });
  el.addEventListener("touchmove", e => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0;
    if (dy > 0 && el.scrollTop <= 0) { el.style.transition = "none"; el.style.transform = `translateY(${dy}px)`; } else { y0 = null; el.style.transform = ""; }
  }, { passive: true });
  el.addEventListener("touchend", () => {
    el.style.transition = ""; el.style.transform = "";
    if (y0 !== null && dy > 110) history.back();
    y0 = null;
  });
}

// ── Fiche série ──
function openTv(id) {
  const sh = openSheet(sh => tvSheet(id, sh));
}
function tvSheet(id, sh) {
  const t = needTv(id); const s = store.data.shows.get(id); const st = sh.state;
  if (!t && tvErr.has(id)) return `<div class="body" style="padding-top:calc(var(--st) + 70px)"><div class="empty">${I.tv}<h3>Fiche indisponible</h3><p>TMDB ne répond pas pour cette série. Réessaie dans un instant.</p><button class="btn pri" data-a="retryTv" data-id="${id}">Réessayer</button></div></div>`;
  if (t && st.cast === undefined) { st.cast = null; tmdb.tvCast(id).then(c => { st.cast = c; sh.refresh(); }).catch(() => { st.cast = []; }); }
  if (!t) return `<div class="hero sk"></div><div class="body"><div class="sk" style="height:28px;width:70%;border-radius:8px"></div></div>`;
  if (!t.overview && st.en === undefined) { st.en = null; tmdb.tvOverviewEN(id).then(o => { st.en = o || ""; sh.refresh(); }).catch(() => { }); }
  const p = progress(s || {}, t);
  if (!st.open) { st.open = new Set([p.next ? p.next.s : (t.seasons.filter(x => x.season_number > 0).at(-1)?.season_number ?? 1)]); }
  const years = year(t.first_air_date) + (t.status === "Ended" || t.status === "Canceled" ? (year(t.last_air_date) !== year(t.first_air_date) ? "–" + year(t.last_air_date) : "") : "–");
  const meta = [years, t.networks[0], plural(t.number_of_seasons || 0, "saison"), t.episode_run_time?.[0] ? t.episode_run_time[0] + " min" : ""].filter(Boolean).map(esc).join(" · ");
  const syn = t.overview || st.en;
  const nx = t.next_episode_to_air;

  let h = `<div class="hero">${t.backdrop_path ? `<img src="${img(t.backdrop_path, "w780")}" alt="">` : ""}</div>
  <div class="hd"><div class="ps">${pimg(t.poster_path, t.name)}</div><div><h1>${esc(t.name)}</h1><div class="meta">${meta}</div>
    <div class="meta" style="margin-top:3px">${esc(STATUS_FR[t.status] || t.status || "")}${t.vote_average ? ` · <span style="color:var(--ac)">★</span> ${t.vote_average.toFixed(1)}` : ""}</div></div></div>
  <div class="body">
  <div class="btns">${s
      ? `<button class="btn" data-a="showMenu" data-id="${id}">${(() => { const k = (s.statusManual || s.status === "stopped") ? s.status : (p.watched === 0 ? "later" : "watching"); return (k === "later" ? I.mark : k === "stopped" ? I.stop : I.play) + (SHOW_ST[k] || "En cours"); })()} ▾</button>`
      : `<button class="btn pri" data-a="followLater" data-id="${id}">${I.plus}Ajouter à « À voir »</button>`}
  ${p.next ? `<button class="btn ${s ? "pri" : ""}" data-a="watchNext" data-id="${id}" data-s="${p.next.s}" data-e="${p.next.e}">${I.check}${SE(p.next.s, p.next.e)}</button>` : ""}</div>
  ${p.aired ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--mu)"><span>${p.watched} / ${plural(p.aired, "épisode")} vus · ${plural(nSeasons(t), "saison")}</span><span>${Math.round(p.watched / p.aired * 100)} %</span></div><div class="bar" style="height:6px"><i style="width:${p.watched / p.aired * 100}%"></i></div>` : ""}
  ${nx ? `<div class="info">${I.clock}<div>Prochain épisode : <b>${SE(nx.season_number, nx.episode_number)}</b>${nx.air_date ? ` — ${esc(fmtLong(nx.air_date))}` : ""}</div></div>` : ""}
  ${t.genres.length ? `<div class="gen">${t.genres.map(g => `<span>${esc(g)}</span>`).join("")}</div>` : ""}
  ${t.tagline ? `<div style="font-style:italic;color:var(--mu);margin-top:6px">${esc(t.tagline)}</div>` : ""}
  ${syn ? `<div class="syn ${st.full ? "" : "clamp"}" data-a="synMore">${esc(syn)}</div>${!t.overview ? `<div class="vo">Synopsis en VO (pas de traduction française)</div>` : ""}` : st.en === null ? `<div class="syn sk" style="height:60px;border-radius:8px"></div>` : ""}
  ${s ? `<div class="memo"><label>${I.edit}Mémo perso</label><textarea data-memo="tv" data-id="${id}" rows="3" placeholder="Où j'en suis, avis, rappel…">${esc(s.note || "")}</textarea></div>` : ""}
  ${sec("Saisons")}`;

  const lastAired = t.last_episode_to_air;
  for (const se of t.seasons.slice().sort((a, b) => (a.season_number || 99) - (b.season_number || 99))) {
    if (!se.episode_count) continue;
    const n = se.season_number;
    const airedS = airedList(t).filter(x => x.s === n); const airedN = airedS.length;
    const w = n === 0 ? (s?.watched?.[0] || []).length : airedS.filter(x => isWatched(s, x.s, x.e)).length;
    const open = st.open.has(n);
    const label = n === 0 ? "Épisodes spéciaux" : `Saison ${n}`;
    h += `<div class="season ${open ? "open" : ""}"><button class="sh" data-a="season" data-id="${id}" data-s="${n}">
      <div class="tx"><b>${esc(label)}</b><small>${n === 0 ? plural(se.episode_count, "épisode") : `${w} / ${airedN || se.episode_count}${airedN < se.episode_count ? ` (${se.episode_count - airedN} à venir)` : ""}`}${se.air_date ? " · " + year(se.air_date) : ""}</small></div>
      ${airedN ? `<span class="chk ${w >= airedN && airedN ? "on" : ""}" data-a="seasonAll" data-id="${id}" data-s="${n}" style="width:34px;height:34px">${I.check}</span>` : ""}${I.chev}</button>`;
    if (open) {
      const sea = needSeason(id, n);
      if (!sea) h += `<div class="ep"><div class="et sk"></div><div class="tx"><b class="sk" style="height:12px;width:50%"></b></div></div>`;
      else for (const e of sea.episodes) {
        const fut = !e.air_date || e.air_date > isoToday();
        const ok = isWatched(s, n, e.episode_number);
        h += `<div class="ep ${fut ? "future" : ""}" data-a="ep" data-id="${id}" data-s="${n}" data-e="${e.episode_number}">
          <div class="et">${e.still_path ? `<img src="${img(e.still_path, "w185")}" alt="" loading="lazy">` : ""}</div>
          <div class="tx"><b>${e.episode_number}. ${esc(e.name || "Épisode " + e.episode_number)}</b><small>${e.air_date ? (fut ? "Diffusion " + rel(e.air_date) : fmtFull(e.air_date)) : "Date inconnue"}${e.runtime ? " · " + e.runtime + " min" : ""}</small></div>
          ${fut ? "" : `<button class="chk ${ok ? "on" : ""}" data-a="toggleEp" data-id="${id}" data-s="${n}" data-e="${e.episode_number}" aria-label="Vu">${I.check}</button>`}</div>`;
      }
    }
    h += `</div>`;
  }
  if (st.cast?.length) h += sec("Distribution") + castHtml(st.cast);
  return h + `</div>`;
}
function provHtml(p) {
  if (!p) return "";
  const all = [...p.flatrate.map(x => ({ ...x, k: "Abonnement" })), ...p.free.map(x => ({ ...x, k: "Gratuit" })), ...p.rent.map(x => ({ ...x, k: "Location" }))];
  const seen = new Set(); const list = all.filter(x => !seen.has(x.provider_id) && seen.add(x.provider_id)).slice(0, 10);
  if (!list.length) return "";
  return sec("Où regarder") + `<a class="prov" href="${esc(p.link)}" target="_blank" rel="noopener">${list.map(x => `<img src="${img(x.logo_path, "w92")}" alt="${esc(x.provider_name)}" title="${esc(x.provider_name + " · " + x.k)}">`).join("")}</a>`;
}
const castHtml = c => `<div class="cast">${c.map(p => `<div>${p.profile_path ? `<img src="${img(p.profile_path, "w185")}" alt="" loading="lazy">` : `<div class="ph"></div>`}${esc(p.name)}<small>${esc(p.character || "")}</small></div>`).join("")}</div>`;

// ── Fiche épisode ──
function openEpisode(id, s, e) {
  const sh = openSheet(sh => epSheet(id, s, e, sh));
  tmdb.seasonFilled(id, s).then(x => { sh.state.filled = x; sh.refresh(); }).catch(() => { });
}
function epSheet(id, s, e, sh) {
  const t = needTv(id); const show = store.data.shows.get(id);
  const ep = sh.state.filled?.episodes.find(x => x.episode_number === e) || epOf(id, s, e);
  const ok = isWatched(show, s, e);
  const fut = ep && (!ep.air_date || ep.air_date > isoToday());
  const pic = ep?.still_path || t?.backdrop_path;
  return `<div class="hero">${pic ? `<img src="${img(pic, "w780")}" alt="">` : ""}</div>
  <div class="body" style="margin-top:-60px;position:relative;z-index:2">
    <button data-a="tv" data-id="${id}" style="color:var(--ac);font-weight:700;font-size:14px">${esc(t?.name || show?.name || "")} ›</button>
    <h1 style="font-size:24px;margin:6px 0 2px;letter-spacing:-.02em">${esc(ep?.name || "Épisode " + e)}</h1>
    <div class="meta" style="color:var(--mu);font-size:14px">${SE(s, e)}${ep?.air_date ? " · " + esc(fmtFull(ep.air_date)) : ""}${ep?.runtime ? " · " + ep.runtime + " min" : ""}${ep?.vote_average ? ` · <span style="color:var(--ac)">★</span> ${ep.vote_average.toFixed(1)}` : ""}</div>
    ${fut ? `<div class="info">${I.clock}<div>Diffusion ${esc(rel(ep.air_date) || "à venir")}</div></div>` : `
    <div class="btns"><button class="btn ${ok ? "ok" : "pri"}" data-a="toggleEp" data-id="${id}" data-s="${s}" data-e="${e}">${I.check}${ok ? "Vu" : "Marquer comme vu"}</button>
    <button class="btn" data-a="upTo" data-id="${id}" data-s="${s}" data-e="${e}">${I.ff}Vu jusqu'ici</button></div>`}
    ${ep ? (ep.overview ? `<div class="syn">${esc(ep.overview)}</div>${ep._en ? `<div class="vo">Synopsis en VO (pas de traduction française)</div>` : ""}` : `<div class="syn" style="color:var(--mu)">Pas de synopsis disponible.</div>`) : `<div class="syn sk" style="height:80px;border-radius:8px"></div>`}
  </div>`;
}

// ── Fiche film ──
function openMovie(id) {
  const sh = openSheet(sh => mvSheet(id, sh));
}
function mvSheet(id, sh) {
  const d = needMovie(id); const m = store.data.movies.get(id); const st = sh.state;
  if (!d) return `<div class="hero sk"></div><div class="body"><div class="sk" style="height:28px;width:70%;border-radius:8px"></div></div>`;
  if (!d.overview && st.en === undefined) { st.en = null; tmdb.movieOverviewEN(id).then(o => { st.en = o || ""; sh.refresh(); }).catch(() => { }); }
  const syn = d.overview || st.en;
  const rf = d.release_fr || {};
  const meta = [year(d.release_date), d.runtime ? `${Math.floor(d.runtime / 60)} h ${String(d.runtime % 60).padStart(2, "0")}` : ""].filter(Boolean).join(" · ");
  const w = m?.status === "watched", wl = m?.status === "watchlist";
  const rel1 = rf.theatrical && `<div>Cinéma : <b>${esc(fmtFull(rf.theatrical))}</b></div>`;
  const rel2 = rf.digital && `<div>Numérique : <b>${esc(fmtFull(rf.digital))}</b></div>`;
  return `<div class="hero">${d.backdrop_path ? `<img src="${img(d.backdrop_path, "w780")}" alt="">` : ""}</div>
  <div class="hd"><div class="ps">${pimg(d.poster_path, d.title)}</div><div><h1>${esc(d.title)}</h1><div class="meta">${esc(meta)}</div>
    <div class="meta" style="margin-top:3px">${d.vote_average ? `<span style="color:var(--ac)">★</span> ${d.vote_average.toFixed(1)}` : ""}${d.original_title && d.original_title !== d.title ? ` · ${esc(d.original_title)}` : ""}</div></div></div>
  <div class="body">
    <div class="btns"><button class="btn ${w ? "ok" : "pri"}" data-a="mvWatched" data-id="${id}">${I.check}${w ? "Vu" : "Marquer vu"}</button>
    ${!w ? `<button class="btn ${wl ? "ok" : ""}" data-a="mvList" data-id="${id}">${I.mark}${wl ? "Dans ma liste" : "À voir"}</button>` : ""}</div>
    ${w ? `<div style="color:var(--mu);font-size:13px">Vu le ${new Date(m.watchedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · Ta note :</div>
      <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-a="rate" data-id="${id}" data-v="${n}" class="${(m.rating || 0) >= n ? "on" : ""}" aria-label="${n} étoiles">${I.star}</button>`).join("")}</div>` : ""}
    ${(rel1 || rel2) ? `<div class="info">${I.cal}<div>${rel1 || ""}${rel2 || ""}</div></div>` : ""}
    ${d.genres.length ? `<div class="gen">${d.genres.map(g => `<span>${esc(g)}</span>`).join("")}</div>` : ""}
    ${d.tagline ? `<div style="font-style:italic;color:var(--mu);margin-top:6px">${esc(d.tagline)}</div>` : ""}
    ${syn ? `<div class="syn ${st.full ? "" : "clamp"}" data-a="synMore">${esc(syn)}</div>${!d.overview ? `<div class="vo">Synopsis en VO (pas de traduction française)</div>` : ""}` : ""}
    ${m ? `<div class="memo"><label>${I.edit}Mémo perso</label><textarea data-memo="mv" data-id="${id}" rows="3" placeholder="Où j'en suis, avis, rappel…">${esc(m.note || "")}</textarea></div>` : ""}
      ${d.cast?.length ? sec("Distribution") + castHtml(d.cast) : ""}
  </div>`;
}

// ═════════════ Actions ═════════════
async function showFromTmdb(id, status = "watching") {
  const t = details.get(id) || await tmdb.tv(id);
  details.set(id, t);
  return { id, name: t.name, poster_path: t.poster_path, backdrop_path: t.backdrop_path, status, addedAt: Date.now(), watched: {}, runtime: t.episode_run_time?.[0] || t.last_episode_to_air?.runtime || null };
}
// Cocher un épisode « vu » valide aussi tous les épisodes précédents déjà sortis
async function withPrevious(id, s, e) {
  const t = details.get(id) || await tmdb.tv(id).catch(() => null);
  if (!t || s === 0) return [{ s, e }];
  const l = airedList(t).filter(x => x.s < s || (x.s === s && x.e <= e));
  return l.some(x => x.s === s && x.e === e) ? l : [...l, { s, e }];
}
async function setEps(id, list, val) {
  let s = store.data.shows.get(id) || await showFromTmdb(id);
  const w = {}; for (const k in s.watched || {}) w[k] = [...s.watched[k]];
  for (const { s: se, e } of list) {
    const set = new Set(w[se] || []); val ? set.add(e) : set.delete(e);
    if (set.size) w[se] = [...set].sort((a, b) => a - b); else delete w[se];
  }
  const prev = store.data.shows.get(id);
  await store.saveShow({ ...s, watched: w, status: val && s.status !== "watching" ? "watching" : s.status, statusManual: val ? false : (s.statusManual || false), lastWatchedAt: val ? Date.now() : (s.lastWatchedAt || null) });
  return prev;
}
async function setMovie(id, status) {
  const prev = store.data.movies.get(id);
  if (!status) return store.deleteMovie(id);
  const d = movieD.get(id) || await tmdb.movie(id);
  await store.saveMovie({
    ...(prev || {}), id, title: d.title, poster_path: d.poster_path, backdrop_path: d.backdrop_path, release_date: d.release_date, runtime: d.runtime,
    status, addedAt: prev?.addedAt || Date.now(), watchedAt: status === "watched" ? Date.now() : null, rating: status === "watched" ? prev?.rating || null : null
  });
}

const A = {
  tab: el => { closeAllSheets(); go(el.dataset.v); },
  tv: el => openTv(+el.dataset.id),
  mv: el => openMovie(+el.dataset.id),
  ep: el => openEpisode(+el.dataset.id, +el.dataset.s, +el.dataset.e),
  closeSheet: () => history.back(),
  sfilter: el => { ui.seriesFilter = el.dataset.v; renderView(); },
  mseg: el => { ui.movieSeg = el.dataset.v; renderView(); },
  retryTv: el => { const id = +el.dataset.id; tvErr.delete(id); requested.delete("tv" + id); sheets.at(-1)?.refresh(); },
  domain: el => {
    const d = el.dataset.v; if (d === ui.domain && ui.tab !== "profile") return;
    ui.domain = d; try { localStorage.setItem("bobine:domain", d); } catch { }
    closeAllSheets(); go(ui.lastTab[d]);
  },
  saveRawg() { rawg.setKey($("#rawgk").value); ui.gsug = {}; ui.gdisc = null; toast("Clé RAWG enregistrée"); },
  gfilter: el => { ui.gameFilter = el.dataset.v; renderView(); },
  game: el => openGame(+el.dataset.id),
  async gadd(el) {
    const id = +el.dataset.id; const st = el.dataset.v;
    await setGame(id, st); toast(`Ajouté à « ${G_LABEL[st]} »`); if (ui.tab === "gdiscover") renderGResults();
  },
  async gquick(el, ev) {
    ev.stopPropagation(); const id = +el.dataset.id;
    if (store.data.games.has(id)) return openGame(id);
    const d = gameD.get(id) || gameLite.get(id);
    const future = d?.tba || (d?.released && d.released > isoToday());
    await setGame(id, "backlog"); toast(future ? "Ajouté à « À jouer » — notifié à sa sortie" : "Ajouté à « À jouer »"); renderGResults();
  },
  gstatus(el) {
    const id = +el.dataset.id; const g = store.data.games.get(id);
    menu(esc(g?.name || "Jeu"), G_F.filter(f => f[0] !== "all").map(([k, l]) => ({ html: G_ICON[k] + l, cur: g?.status === k, fn: () => setGame(id, k) })).map((x, i) => ({ ...x, cur: gst(g) === G_F[i][0] }))
      .concat(g ? [{ html: I.trash + "Retirer de ma ludothèque", bad: true, fn: () => confirm(`Retirer « ${g.name} » ?`) && store.deleteGame(id) }] : []));
  },
  grate(el) { const id = +el.dataset.id, n = +el.dataset.v; const g = store.data.games.get(id); if (g) store.saveGame({ ...g, rating: g.rating === n ? null : n }); },
  gplat(el) { const id = +el.dataset.id; const g = store.data.games.get(id); if (g) store.saveGame({ ...g, platform: g.platform === el.dataset.v ? null : el.dataset.v }); },
  roulette: () => {
    const wl = [...store.data.movies.values()].filter(m => m.status === "watchlist" && (!m.release_date || m.release_date <= isoToday()));
    if (!wl.length) return toast("Aucun film déjà sorti dans ta liste");
    const pick = wl[Math.floor(Math.random() * wl.length)];
    const b = $(".roul"); b?.classList.add("spin"); setTimeout(() => { b?.classList.remove("spin"); openMovie(pick.id); toast(`🎲 Ce soir : ${pick.title}`); }, 650);
  },
  sview: () => { ui.seriesView = ui.seriesView === "grid" ? "list" : "grid"; try { localStorage.setItem("bobine:sview", ui.seriesView); } catch { } renderView(); },
  sugseg: el => { ui.sugSeg = el.dataset.v; loadSug(ui.sugSeg); renderResults(); },
  theme: el => { if (!premium.isPremium() && el.dataset.v !== "nuit") return openPaywall("theme"); applyTheme({ ...THEMES[el.dataset.v] }, true); renderView(true); },
  themeReset: () => { applyTheme(null, true); renderView(true); },
  paywall: el => openPaywall(el.dataset.v),
  async buyPremium(el) {
    el.disabled = true; const t = el.innerHTML; el.textContent = "…";
    try { const r = await premium.buy(); if (r === "done") { toast("Bienvenue dans Playwatch Premium ✨"); closeAllSheets(); } }
    catch (e) { if (e.name !== "AbortError") toast(e.message || "Paiement interrompu"); }
    el.disabled = false; el.innerHTML = t;
  },
  async restorePremium() {
    try { const ok = await premium.restore(); toast(ok || premium.isPremium() ? "Premium restauré ✨" : "Aucun achat Premium trouvé pour ce compte"); }
    catch (e) { toast(e.message || "Restauration impossible"); }
  },
  synMore: () => { const sh = sheets.at(-1); if (sh) { sh.state.full = !sh.state.full; sh.refresh(); } },
  dismiss: el => { localStorage.setItem("bobine:" + el.dataset.v, "1"); renderView(); },

  async watchNext(el) {
    const id = +el.dataset.id, s = +el.dataset.s, e = +el.dataset.e;
    const card = el.closest(".up");
    if (card) { card.classList.add("done"); await new Promise(r => setTimeout(r, 300)); }
    const list = await withPrevious(id, s, e);
    const before = store.data.shows.get(id);
    const added = list.filter(x => !isWatched(before, x.s, x.e)).length;
    const prev = await setEps(id, list, true);
    toast(added > 1 ? `${SE(s, e)} + ${added - 1} précédent${added > 2 ? "s" : ""} marqués vus` : `${SE(s, e)} marqué vu`, "Annuler", () => prev ? store.saveShow(prev) : store.deleteShow(id));
  },
  async toggleEp(el) {
    const id = +el.dataset.id, s = +el.dataset.s, e = +el.dataset.e;
    const cur = store.data.shows.get(id);
    if (isWatched(cur, s, e)) { await setEps(id, [{ s, e }], false); return; }
    // Les épisodes précédents de la MÊME saison sont cochés automatiquement ; ceux des saisons
    // antérieures seulement sur demande (évite de tout cocher d'un coup sur une série épisodique)
    const all = (await withPrevious(id, s, e)).filter(x => !isWatched(cur, x.s, x.e) || (x.s === s && x.e === e));
    const same = all.filter(x => x.s === s), older = all.filter(x => x.s !== s);
    const prev = await setEps(id, same, true);
    const undo = () => prev ? store.saveShow(prev) : store.deleteShow(id);
    if (older.length) toast(`${SE(s, e)} marqué vu${same.length > 1 ? ` (+ ${same.length - 1} de la saison)` : ""} · ${older.length} épisode${older.length > 1 ? "s" : ""} non vu${older.length > 1 ? "s" : ""} avant`, "Tout cocher", async () => {
      const p2 = store.data.shows.get(id);
      await setEps(id, older, true);
      toast(`${older.length} épisode${older.length > 1 ? "s" : ""} précédent${older.length > 1 ? "s" : ""} marqué${older.length > 1 ? "s" : ""} vu${older.length > 1 ? "s" : ""}`, "Annuler", () => store.saveShow(p2));
    }, 7000);
    else if (same.length > 1) toast(`${SE(s, e)} + ${same.length - 1} précédent${same.length > 2 ? "s" : ""} de la saison marqué${same.length > 2 ? "s" : ""} vu${same.length > 2 ? "s" : ""}`, "Annuler", undo);
  },
  async upTo(el) {
    const id = +el.dataset.id, s = +el.dataset.s, e = +el.dataset.e;
    const t = details.get(id) || await tmdb.tv(id);
    const list = airedList(t).filter(x => x.s < s || (x.s === s && x.e <= e));
    const prev = await setEps(id, list, true);
    toast(`${plural(list.length, "épisode")} marqués vus`, "Annuler", () => prev ? store.saveShow(prev) : store.deleteShow(id));
  },
  season(el) {
    const sh = sheets.at(-1); const n = +el.dataset.s;
    sh.state.open.has(n) ? sh.state.open.delete(n) : sh.state.open.add(n); sh.refresh();
  },
  async seasonAll(el) {
    const id = +el.dataset.id, n = +el.dataset.s;
    const t = details.get(id) || await tmdb.tv(id);
    const list = n === 0 ? (await tmdb.season(id, 0)).episodes.filter(e => e.air_date && e.air_date <= isoToday()).map(e => ({ s: 0, e: e.episode_number })) : airedList(t).filter(x => x.s === n);
    const s = store.data.shows.get(id);
    const all = list.every(x => isWatched(s, x.s, x.e));
    const prev = await setEps(id, list, !all);
    toast(all ? `Saison ${n} décochée` : `Saison ${n} marquée vue`, "Annuler", () => prev ? store.saveShow(prev) : store.deleteShow(id));
  },
  async follow(el) { const s = await showFromTmdb(+el.dataset.id); await store.saveShow(s); toast("Série ajoutée"); },
  async followLater(el) { const s = await showFromTmdb(+el.dataset.id, "later"); await store.saveShow(s); toast("Ajoutée à « À voir »"); },
  showMenu(el) {
    const id = +el.dataset.id; const s = store.data.shows.get(id);
    menu(esc(s.name), [
      ["watching", I.play, "En cours"], ["later", I.mark, "À voir"], ["stopped", I.stop, "Arrêtée (ne plus suivre)"]
    ].map(([k, ic, l]) => ({ html: ic + l, cur: s.status === k, fn: () => store.saveShow({ ...s, status: k, statusManual: k !== "watching" }) }))
      .concat([{ html: I.trash + "Retirer de ma liste", bad: true, fn: () => confirm(`Retirer « ${s.name} » et son historique ?`) && store.deleteShow(id) }]));
  },
  async quick(el, ev) {
    ev.stopPropagation();
    const id = +el.dataset.id, t = el.dataset.t;
    if (t === "tv") {
      if (store.data.shows.has(id)) return openTv(id);
      await store.saveShow(await showFromTmdb(id, "later")); toast("Ajoutée à « À voir »"); renderResults();
    } else {
      if (store.data.movies.has(id)) return openMovie(id);
      await setMovie(id, "watchlist"); toast("Ajouté à « À voir »"); renderResults();
    }
  },
  async mvWatched(el) {
    const id = +el.dataset.id; const m = store.data.movies.get(id);
    await setMovie(id, m?.status === "watched" ? null : "watched");
  },
  async mvList(el) {
    const id = +el.dataset.id; const m = store.data.movies.get(id);
    await setMovie(id, m?.status === "watchlist" ? null : "watchlist");
    if (m?.status !== "watchlist") toast("Tu seras notifié à la sortie");
  },
  rate(el) {
    const id = +el.dataset.id, n = +el.dataset.v; const m = store.data.movies.get(id);
    store.saveMovie({ ...m, rating: m.rating === n ? null : n });
  },

  async pushOn() {
    if (!premium.isPremium()) return openPaywall("push");
    try { await push.enable(); ui.pushStatus = "on"; toast("Notifications activées 🔔"); }
    catch (e) { ui.pushStatus = await push.status(); toast(e.message === "LOCAL" ? "Configure Firebase pour les notifications" : "Impossible : " + e.message); }
    renderView();
  },
  async pushOff() { await push.disable(); ui.pushStatus = "off"; renderView(); },
  async pushTest() { try { await push.testLocal(); } catch (e) { toast("Erreur : " + e.message); } },

  impPick: () => premium.isPremium() ? $("#impfile").click() : openPaywall("import"),
  async export() {
    const json = JSON.stringify(store.exportJSON(), null, 1);
    const name = `bobine-${isoToday()}.json`;
    const file = new File([json], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Sauvegarde Playwatch" }); return; } catch (e) { if (e.name === "AbortError") return; } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  saveKey() { tmdb.setKey($("#tmdbk").value); requested.clear(); toast("Clé enregistrée"); ui.discover = null; },
  async refresh() { await tmdb.clearCache(); requested.clear(); details.clear(); seasons.clear(); movieD.clear(); ui.discover = null; toast("Cache vidé — rechargement des données"); renderView(); },
  async logout() { if (confirm("Se déconnecter ?")) { await push.disable().catch(() => { }); await store.signOut(); } },
  delAccount() {
    const z = $("#delzone"), g = store.isGoogleUser();
    z.innerHTML = `<p style="color:var(--bad);font-size:14px;margin:0 0 8px">Action définitive. ${g ? "Google va te demander de confirmer ton compte." : "Confirme avec ton mot de passe :"}</p>
      ${g ? "" : `<input class="field" id="delpw" type="password" placeholder="Mot de passe" autocomplete="current-password">`}
      <div class="btns" style="margin:0"><button class="btn ghost" data-a="delCancel">Annuler</button><button class="btn danger" style="background:var(--bad);color:#fff" data-a="delConfirm">Supprimer définitivement</button></div><div class="err" id="delerr"></div>`;
    $("#delpw")?.focus();
  },
  delCancel() { renderView(true); },
  async delConfirm() {
    const pw = $("#delpw")?.value || ""; if (!pw && !store.isGoogleUser()) { $("#delerr").textContent = "Entre ton mot de passe."; return; }
    $("#delerr").textContent = "Suppression en cours…";
    try { await push.disable().catch(() => { }); await store.deleteAccount(pw); toast("Compte supprimé. À bientôt !"); }
    catch (e) { $("#delerr").textContent = authErr(e); }
  },
  async wipe() {
    if (!confirm("Effacer TOUTES tes séries, épisodes vus et films ? (exporte d'abord une sauvegarde)")) return;
    if (!confirm("Vraiment ? C'est définitif.")) return;
    await store.wipeAll(); toast("Données effacées");
  }
};

document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-a]"); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  ev.preventDefault(); ev.stopPropagation();
  Promise.resolve(fn(el, ev)).catch(e => { console.error(e); onErr(e); if (!["BAD_KEY", "NO_KEY"].includes(e.message)) toast("Erreur : " + e.message); });
});

// ═════════════ Swipe gauche / droite entre les filtres ═════════════
(() => {
  let x0 = null, y0 = 0, t0 = 0;
  const view = document.getElementById("view");
  view.addEventListener("touchstart", e => {
    if (sheets.length || !["series", "movies", "games"].includes(ui.tab) || e.touches.length > 1) { x0 = null; return; }
    if (e.target.closest(".row, .chips, .cast, input")) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  view.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - t0 > 700) return;
    const dir = dx < 0 ? 1 : -1;
    const [F, key] = ui.tab === "series" ? [SERIES_F, "seriesFilter"] : ui.tab === "games" ? [G_F, "gameFilter"] : [MOVIE_F, "movieSeg"];
    const i = F.findIndex(f => f[0] === ui[key]);
    const j = i + dir; if (j < 0 || j >= F.length) return;
    ui[key] = F[j][0];
    view.style.transition = "none"; view.style.transform = `translateX(${dir * 24}px)`; view.style.opacity = ".4";
    renderView();
    requestAnimationFrame(() => { view.style.transition = "transform .2s, opacity .2s"; view.style.transform = ""; view.style.opacity = ""; });
    document.querySelector(".chip.on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    window.scrollTo(0, 0);
  }, { passive: true });
})();

// ═════════════ Import ═════════════
async function runImport(files) {
  if (!files.length) return;
  const z = $("#impzone");
  z.innerHTML = `<div class="log" id="implog">Lecture…</div>`;
  const log = $("#implog");
  let an;
  try { an = await imp.analyze(files, f => { log.textContent = "Lecture de " + f + "…"; }); }
  catch (e) { log.textContent = "Erreur de lecture : " + e.message; return; }

  if (an.bobine) {
    const b = an.bobine;
    log.textContent = `Sauvegarde Playwatch du ${new Date(b.exportedAt).toLocaleString("fr-FR")}\n${plural(b.shows.length, "série")} · ${plural(b.movies.length, "film")}`;
    z.insertAdjacentHTML("beforeend", `<button class="btn pri" id="impgo" style="width:100%">Restaurer (fusion avec l'existant)</button>`);
    $("#impgo").onclick = async () => {
      const shows = b.shows.map(s => {
        const cur = store.data.shows.get(s.id); if (!cur) return s;
        const w = { ...cur.watched }; for (const k in s.watched || {}) w[k] = [...new Set([...(w[k] || []), ...s.watched[k]])].sort((a, c) => a - c);
        return { ...cur, ...s, watched: w };
      });
      await store.bulk({ shows, movies: b.movies.map(m => ({ ...(store.data.movies.get(m.id) || {}), ...m })) });
      z.innerHTML = `<div class="log">✅ Sauvegarde restaurée.</div>`;
    };
    return;
  }

  if (an.binge) {
    const b = an.binge;
    const st = b.shows.reduce((o, x) => (o[x.status || "watching"] = (o[x.status || "watching"] || 0) + 1, o), {});
    log.textContent = `Export Binge Boxd détecté ✓\n${plural(b.shows.length, "série")} (${st.watching || 0} en cours/vues, ${st.later || 0} plus tard, ${st.stopped || 0} arrêtées)\n${plural(b.epCount, "épisode")} vus\n${plural(b.movies.filter(m => m.status === "watched").length, "film")} vus · ${b.movies.filter(m => m.status === "watchlist").length} à voir`;
    z.insertAdjacentHTML("beforeend", `<button class="btn pri" id="impgo" style="width:100%">Importer</button>`);
    $("#impgo").onclick = async () => {
      $("#impgo").remove();
      z.insertAdjacentHTML("beforeend", `<div class="prog"><i id="impbar"></i></div><div id="impst" style="font-size:13px;color:var(--mu)"></div>`);
      try {
        const res = await imp.resolveBinge(b, store.data, (d, n, l) => { $("#impbar").style.width = (d / n * 100) + "%"; $("#impst").textContent = `${d}/${n} · ${l || ""}`; });
        $("#impst").textContent = "Enregistrement…";
        await store.bulk({ shows: res.shows, movies: res.movies }, (d, n) => { $("#impst").textContent = `Enregistrement ${d}/${n}`; });
        z.innerHTML = `<div class="log">✅ Import terminé : ${plural(res.shows.length, "série")}, ${plural(b.epCount, "épisode")}, ${plural(res.movies.length, "film")}.${res.unresolved.length ? "\n\n⚠️ Introuvables sur TMDB : " + res.unresolved.join(", ") : ""}</div>`;
      } catch (e) { z.insertAdjacentHTML("beforeend", `<div class="err">Erreur : ${esc(e.message)}</div>`); }
    };
    return;
  }

  const rep = an.report.map(r => `• ${r.file} — ${r.kind}${r.n ? " (" + r.n + ")" : ""}`).join("\n");
  log.textContent = `Détecté : ${plural(an.shows.length, "série")}, ${plural(an.epCount, "épisode")} vus, ${plural(an.movies.length, "film")}\n\n${rep}`;
  if (!an.shows.length && !an.movies.length) {
    log.textContent += "\n\nRien d'importable trouvé. Envoie le zip complet de l'export TV Time (ou tracking-prod-records-v2.csv).";
    return;
  }
  z.insertAdjacentHTML("beforeend", `<button class="btn pri" id="impgo" style="width:100%">Importer</button>`);
  $("#impgo").onclick = async () => {
    $("#impgo").remove();
    z.insertAdjacentHTML("beforeend", `<div class="prog"><i id="impbar"></i></div><div id="impst" style="font-size:13px;color:var(--mu)"></div>`);
    try {
      const res = await imp.resolve(an, store.data, (d, n, label) => { $("#impbar").style.width = (d / n * 100) + "%"; $("#impst").textContent = `${d}/${n} · ${label || ""}`; });
      $("#impst").textContent = "Enregistrement…";
      await store.bulk({ shows: res.shows, movies: res.movies }, (d, n) => { $("#impst").textContent = `Enregistrement ${d}/${n}`; });
      const eps = res.shows.reduce((n, s) => n + watchedCount(s), 0);
      z.innerHTML = `<div class="log">✅ Import terminé : ${plural(res.shows.length, "série")} (${plural(eps, "épisode")} vus), ${plural(res.movies.length, "film")}.${res.unresolved.length ? `\n\n⚠️ Non trouvés sur TMDB (${res.unresolved.length}) — ajoute-les à la main depuis Explorer :\n` + res.unresolved.join("\n") : ""}</div>`;
    } catch (e) { z.insertAdjacentHTML("beforeend", `<div class="err">Erreur : ${esc(e.message)}</div>`); }
  };
}

// ═════════════ Menu & toast ═════════════
function menu(title, items) {
  const m = document.createElement("div"); m.className = "menu";
  m.innerHTML = `<div class="mb"><h4>${title}</h4>${items.map((it, i) => `<button data-i="${i}" class="${it.cur ? "cur" : ""} ${it.bad ? "bad" : ""}">${it.html.replace(/<svg/, '<svg style="width:20px;height:20px"')}</button>`).join("")}<button data-i="-1" style="justify-content:center;color:var(--mu)">Annuler</button></div>`;
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add("in"));
  const close = () => { m.classList.remove("in"); setTimeout(() => m.remove(), 220); };
  m.addEventListener("click", e => {
    e.stopPropagation();
    const b = e.target.closest("button[data-i]");
    if (b && +b.dataset.i >= 0) Promise.resolve(items[+b.dataset.i].fn()).catch(err => toast("Erreur : " + err.message));
    if (b || e.target === m) close();
  });
}
let toastT;
function toast(msg, action, fn, ms) {
  const t = $("#toast");
  t.innerHTML = esc(msg) + (action ? `<button>${esc(action)}</button>` : "");
  if (action) t.querySelector("button").onclick = () => { fn(); t.classList.remove("in"); };
  t.classList.add("in"); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("in"), ms || (action ? 4500 : 2400));
}

// ═════════════ Écrans clé / auth ═════════════
function bare(html) { $("#tabs").classList.add("hidden"); $("#view").innerHTML = `<div class="full">${html}</div>`; $("#view").style.padding = "0"; }
const logo = `<div class="logo"><img src="icons/icon-192.png" alt=""><b>Playwatch</b></div>`;

function renderKey() {
  ui.mode = "key";
  bare(`${logo}<h2 style="margin:0 0 6px">Une dernière étape</h2>
  <p>Playwatch récupère les visuels, synopsis et dates de diffusion sur TMDB. Crée une clé gratuite sur <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org/settings/api</a> et colle-la ici (le « jeton d'accès en lecture » ou la « clé d'API »).</p>
  <input class="field" id="k" placeholder="eyJhbGciOi… ou clé v3" autocomplete="off" autocapitalize="off" spellcheck="false">
  <div class="err" id="kerr"></div><button class="btn pri" id="kgo">Continuer</button>`);
  $("#kgo").onclick = async () => {
    const k = $("#k").value.trim(); if (!k) return;
    tmdb.setKey(k); $("#kerr").textContent = "Vérification…";
    try { await tmdb.get("/configuration", {}, { fresh: true, ttl: 0 }); ui.mode = null; boot(); }
    catch (e) { $("#kerr").textContent = e.message === "BAD_KEY" ? "Clé refusée par TMDB." : "Erreur : " + e.message; tmdb.setKey(""); }
  };
}

function renderAuth() {
  ui.mode = "auth";
  let signup = false;
  const draw = () => {
    bare(`${logo}<p style="margin:-10px 0 22px">Tes séries, tes films, tes épisodes — synchronisés et notifiés.</p>
    <button class="btn gbtn" id="agoogle"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuer avec Google</button>
    <div class="orsep"><span>ou avec un email</span></div>
    <input class="field" id="em" type="email" placeholder="Email" autocomplete="email">
    <input class="field" id="pw" type="password" placeholder="Mot de passe${signup ? " (6 caractères min.)" : ""}" autocomplete="${signup ? "new-password" : "current-password"}">
    <div class="err" id="aerr"></div>
    <button class="btn pri" id="ago">${signup ? "Créer mon compte" : "Se connecter"}</button>
    <button class="btn ghost" id="asw" style="margin-top:10px">${signup ? "J'ai déjà un compte" : "Créer un compte"}</button>
    ${signup ? "" : `<button id="arst" style="margin-top:16px;color:var(--mu);font-size:14px">Mot de passe oublié ?</button>`}`);
    $("#asw").onclick = () => { signup = !signup; draw(); };
    $("#agoogle").onclick = async () => {
      $("#aerr").textContent = "…";
      try { await store.signInGoogle(); } catch (e) { $("#aerr").textContent = authErr(e); }
    };
    $("#arst") && ($("#arst").onclick = async () => {
      const em = $("#em").value.trim(); if (!em) return $("#aerr").textContent = "Entre ton email d'abord.";
      try { await store.resetPassword(em); $("#aerr").style.color = "var(--ok)"; $("#aerr").textContent = "Email de réinitialisation envoyé."; } catch (e) { $("#aerr").textContent = authErr(e); }
    });
    const go = async () => {
      const em = $("#em").value.trim(), pw = $("#pw").value;
      $("#aerr").textContent = "…";
      try { signup ? await store.signUp(em, pw) : await store.signIn(em, pw); }
      catch (e) { $("#aerr").textContent = authErr(e); }
    };
    $("#ago").onclick = go; $("#pw").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  };
  draw();
}
const authErr = e => ({
  "auth/invalid-credential": "Email ou mot de passe incorrect.", "auth/wrong-password": "Mot de passe incorrect.",
  "auth/user-not-found": "Aucun compte avec cet email.", "auth/email-already-in-use": "Un compte existe déjà avec cet email.",
  "auth/weak-password": "Mot de passe trop court (6 caractères min.).", "auth/invalid-email": "Email invalide.",
  "auth/too-many-requests": "Trop d'essais, réessaie dans quelques minutes.", "auth/network-request-failed": "Pas de connexion.",
  "auth/popup-closed-by-user": "Connexion Google annulée.", "auth/cancelled-popup-request": "Connexion Google annulée.",
  "auth/account-exists-with-different-credential": "Un compte existe déjà avec cet email : connecte-toi avec ton mot de passe.",
  "auth/unauthorized-domain": "Connexion Google pas encore autorisée pour ce site.", "auth/operation-not-allowed": "Connexion Google pas encore activée.",
  "auth/user-mismatch": "Choisis le même compte Google que celui connecté."
}[e.code] || e.message);

// ═════════════ Démarrage ═════════════
function startApp() {
  ui.mode = "app";
  $("#tabs").classList.remove("hidden"); $("#view").style.padding = "";
  const h = location.hash.slice(1);
  if (TABS.some(t => t[0] === h && ui.domains[domainOf(h)]) || h === "profile") ui.tab = h; else ui.tab = ui.lastTab[ui.domain];
  if (ui.tab !== "profile") ui.domain = domainOf(ui.tab);
  renderView(true);
  push.status().then(s => { ui.pushStatus = s; renderView(); }).catch(() => { });
  push.refresh();
}

async function boot() {
  if (!tmdb.getKey()) return renderKey();
  ui.mode = "loading";
  if (!$("#view .boot")) $("#view").innerHTML = `<div class="boot">${logo}</div>`;
  try { await store.init(); }
  catch (e) { console.error(e); $("#view").innerHTML = `<div class="full">${logo}<p class="err">Impossible de charger Firebase : ${esc(e.message)}</p></div>`; return; }
  if (store.hasFirebase && !store.data.user) return renderAuth();
  startApp();
}

// Service worker + mise à jour
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) toast("Nouvelle version disponible", "Recharger", () => location.reload());
      });
    });
  }).catch(e => console.warn("SW", e));
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data?.type === "open" && e.data.url) {
      const m = e.data.url.match(/#(tv|mv|gm)-(\d+)/); if (m) ({ tv: openTv, mv: openMovie, gm: openGame })[m[1]](+m[2]);
    }
  });
}
// Lien profond depuis une notification (#tv-123 / #mv-456)
window.addEventListener("load", () => {
  const m = location.hash.match(/^#(tv|mv|gm)-(\d+)/);
  if (m) { const id = +m[2]; history.replaceState(null, "", "#series"); const t = setInterval(() => { if (ui.mode === "app") { clearInterval(t); ({ tv: openTv, mv: openMovie, gm: openGame })[m[1]](id); } }, 150); setTimeout(() => clearInterval(t), 10000); }
});
// Ouvrir l'app = notifications lues : on efface le badge de l'icône et les notifs du centre de notifications
function clearNotifs() { push.clearAll(); }
clearNotifs();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { clearNotifs(); if (ui.mode === "app") { requested.clear(); later(); } } });

boot();
