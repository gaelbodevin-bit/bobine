// Playwatch — langue de l'interface.
// Français = langue source (aucune traduction, aucun coût). Autres langues du téléphone = anglais.
// Le texte de l'interface est traduit au moment où il s'affiche (observateur DOM) à partir du
// dictionnaire EN : chaînes exactes, puis motifs (nombres, dates relatives…), puis fragments.
// Choix manuel possible dans Paramètres (localStorage « bobine:lang » = auto | fr | en).
import { EN, PATTERNS } from "./i18n-en.js";

const pref = (() => { try { return localStorage.getItem("bobine:lang") || "auto"; } catch { return "auto"; } })();
const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "fr-FR";
export const LANG_PREF = pref;
export const LANG = pref === "fr" || pref === "en" ? pref : (/^fr\b/i.test(nav) ? "fr" : "en");
// Locale pour les dates et nombres ; pays pour les sorties, plateformes et cinéma (TMDB)
const navRegion = (nav.match(/[-_]([A-Z]{2})\b/i) || [])[1]?.toUpperCase();
export const LOC = LANG === "fr" ? (/^fr-/i.test(nav) ? nav : "fr-FR") : (/^en-/i.test(nav) ? nav : "en-US");
export const REGION = (() => { try { const r = localStorage.getItem("bobine:region"); if (/^[A-Z]{2}$/.test(r || "")) return r; } catch { } return navRegion || (LANG === "fr" ? "FR" : "US"); })();
export const TMDB_LANG = LANG === "fr" ? "fr-FR" : `en-${REGION === "GB" || REGION === "AU" || REGION === "CA" || REGION === "IE" || REGION === "NZ" ? REGION : "US"}`;
export const isEN = LANG === "en";
document.documentElement.lang = LANG;

// ── Traduction d'une chaîne ──
const FRAGS = Object.entries(EN).filter(([k]) => k.length >= 5).sort((a, b) => b[0].length - a[0].length);
const cache = new Map();
const norm = s => s.replace(/\s+/g, " ").trim();
function one(s) {
  if (!s) return s;
  if (EN[s] !== undefined) return EN[s];
  for (const [re, rep] of PATTERNS) { const m = s.match(re); if (m) return typeof rep === "function" ? rep(m, tr) : s.replace(re, rep); }
  return null;
}
export function tr(input) {
  if (!isEN || input == null) return input;
  const raw = String(input);
  if (!/[A-Za-zÀ-ÿ]/.test(raw)) return raw;
  if (cache.has(raw)) return cache.get(raw);
  const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0], s = norm(raw);
  let out = one(s);
  if (out == null && s.includes(" · ")) out = s.split(" · ").map(p => one(p) ?? frag(p)).join(" · ");
  if (out == null && /\n/.test(raw)) out = raw.split("\n").map(l => tr(l)).join("\n");
  if (out == null) out = frag(s);
  out = out.replace(/«\s*/g, "“").replace(/\s*»/g, "”").replace(/[  ]([:;!?])(?=\s|$)/g, "$1");   // typographie anglaise
  const res = lead + out + tail;
  if (cache.size < 5000) cache.set(raw, res);
  return res;
}
// Remplacement des fragments connus (du plus long au plus court) ; les fragments courts doivent être des mots entiers
function frag(s) {
  if (!/[À-ÿ]|\b(le|la|les|des|du|de|un|une|et|ou|pour|avec|sans|tes|ton|ta|vu|vus|vue|voir|jouer|sur|dans|au|aux|en|pas|plus|Il y a|il y a)\b/.test(s)) return s;
  let out = s;
  for (const [k, v] of FRAGS) {
    if (out.length < k.length) continue;
    if (out.includes(k)) out = out.split(k).join(v);
  }
  return out;
}
export const t = (s, vars) => { let r = tr(s); if (vars) for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(v); return r; };

// ── Traduction du DOM au fil de l'affichage ──
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
function walk(node) {
  if (node.nodeType === 3) { const v = node.nodeValue; if (v && /[A-Za-zÀ-ÿ]/.test(v)) { const n = tr(v); if (n !== v) node.nodeValue = n; } return; }
  if (node.nodeType !== 1 || node.classList?.contains("notr")) return;
  for (const a of ATTRS) { const v = node.getAttribute?.(a); if (v) { const n = tr(v); if (n !== v) node.setAttribute(a, n); } }
  if (SKIP.has(node.tagName)) return;
  if (node.tagName === "INPUT" && (node.type === "button" || node.type === "submit") && node.value) node.value = tr(node.value);
  for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
}
export function installTranslator() {
  if (!isEN) return;
  const go = () => { walk(document.body); document.title = tr(document.title); };
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  // childList : nouveaux éléments ; characterData / attributs : textes mis à jour sur place par patch()
  // (traduire un texte déjà anglais le laisse identique : pas de boucle)
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === "childList") m.addedNodes.forEach(walk);
      else if (m.type === "characterData") { const nd = m.target, p = nd.parentElement; if (p && !SKIP.has(p.tagName) && !p.closest(".notr")) { const v = nd.nodeValue, n = tr(v); if (n !== v) nd.nodeValue = n; } }
      else if (m.type === "attributes") { const e = m.target, v = e.getAttribute(m.attributeName); if (v) { const n = tr(v); if (n !== v) e.setAttribute(m.attributeName, n); } }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // Boîtes de dialogue natives et titre
  const c = window.confirm.bind(window), a = window.alert.bind(window), p = window.prompt.bind(window);
  window.confirm = m => c(tr(m)); window.alert = m => a(tr(m)); window.prompt = (m, d) => p(tr(m), d);
  const td = Object.getOwnPropertyDescriptor(Document.prototype, "title");
  if (td?.set) Object.defineProperty(document, "title", { get() { return td.get.call(this); }, set(v) { td.set.call(this, tr(v)); }, configurable: true });
}
