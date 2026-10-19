// Stockage : Firebase (Auth email + Firestore hors-ligne) ou mode local (navigateur).
import { FIREBASE_CONFIG } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/12.19.0/";
export const hasFirebase = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

const state = {
  shows: new Map(),   // id -> show
  movies: new Map(),  // id -> movie
  games: new Map(),   // id RAWG -> jeu
  user: null,         // { uid, email } | { uid:'local' }
  ready: false
};
const listeners = new Set();
let emitT;
function emit() { clearTimeout(emitT); emitT = setTimeout(() => listeners.forEach(f => f(state)), 30); }
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }
export const data = state;

// ═════════════════ Mode local ═════════════════
const LKEY = "bobine:data";
function localLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(LKEY) || "{}");
    state.shows = new Map(Object.entries(d.shows || {}).map(([k, v]) => [+k, v]));
    state.movies = new Map(Object.entries(d.movies || {}).map(([k, v]) => [+k, v]));
    state.games = new Map(Object.entries(d.games || {}).map(([k, v]) => [+k, v]));
  } catch { }
}
let saveT;
function localSave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      localStorage.setItem(LKEY, JSON.stringify({ shows: Object.fromEntries(state.shows), movies: Object.fromEntries(state.movies), games: Object.fromEntries(state.games) }));
    } catch (e) { console.warn("localStorage plein", e); }
  }, 150);
}

// ═════════════════ Firebase ═════════════════
let fb = null; // { auth, db, fs, au }
async function loadFirebase() {
  if (fb) return fb;
  const [{ initializeApp }, au, fs] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js")
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = au.initializeAuth(app, { persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence] });
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ cacheSizeBytes: fs.CACHE_SIZE_UNLIMITED }) }); }
  catch { db = fs.getFirestore(app); }
  fb = { app, auth, db, au, fs };
  return fb;
}

let unsubs = [];
// Synchro différentielle : au démarrage on relit le cache local (gratuit), puis on n'écoute
// que les documents modifiés depuis la dernière synchro (updatedAt). Les suppressions sont des
// « pierres tombales » ({ deleted: true }) pour être propagées. Resynchro complète 1×/semaine.
const SYNC_KEY = uid => `bobine:sync:${uid}`;
const MARGIN = 10 * 60e3;          // tolérance d'horloge entre appareils
const FULL_EVERY = 7 * 864e5;
function syncMeta(uid) { try { return JSON.parse(localStorage.getItem(SYNC_KEY(uid)) || "{}"); } catch { return {}; } }
function saveMeta(uid, m) { try { localStorage.setItem(SYNC_KEY(uid), JSON.stringify(m)); } catch { } }
function applyDoc(map, d) {
  const v = d.data();
  if (!v || v.deleted) map.delete(+d.id); else map.set(+d.id, v);
}
async function syncCol(uid, col, map, onReady) {
  const { db, fs } = fb;
  const ref = fs.collection(db, "users", uid, col);
  const meta = syncMeta(uid);
  let since = (meta[col] && Date.now() - (meta.full?.[col] || 0) < FULL_EVERY) ? meta[col] : 0;
  if (since) {
    try {
      const snap = await fs.getDocsFromCache(ref);
      if (!snap.size) since = 0; else snap.forEach(d => applyDoc(map, d));
    } catch { since = 0; }
    if (since) onReady();
  }
  const q = since ? fs.query(ref, fs.where("updatedAt", ">", since - MARGIN)) : ref;
  const un = fs.onSnapshot(q, snap => {
    snap.docChanges().forEach(c => { if (c.type === "removed") { if (!since) map.delete(+c.doc.id); } else applyDoc(map, c.doc); });
    if (!snap.metadata.fromCache) {
      let max = 0;
      snap.docs.forEach(d => { const u = d.data().updatedAt || 0; if (u > max) max = u; });
      map.forEach(v => { if ((v.updatedAt || 0) > max) max = v.updatedAt; });
      const m = syncMeta(uid);
      m[col] = Math.max(m[col] || 0, max);
      if (!since) { m.full = m.full || {}; m.full[col] = Date.now(); }
      saveMeta(uid, m);
    }
    onReady();
  }, err => {
    console.error(err);
    if (since) { un(); const m = syncMeta(uid); delete m[col]; saveMeta(uid, m); syncCol(uid, col, map, onReady); }
  });
  unsubs.push(un);
}
function subscribeUser(uid) {
  unsubs.forEach(u => u()); unsubs = [];
  let gotS = false, gotM = false;
  syncCol(uid, "shows", state.shows, () => { gotS = true; if (gotM) state.ready = true; emit(); });
  syncCol(uid, "movies", state.movies, () => { gotM = true; if (gotS) state.ready = true; emit(); });
  syncCol(uid, "games", state.games, () => { state.gamesReady = true; emit(); });
}

// ═════════════════ Init / Auth ═════════════════
export async function init() {
  if (!hasFirebase) {
    localLoad();
    state.user = { uid: "local", local: true };
    state.ready = true; emit();
    return state.user;
  }
  await loadFirebase();
  return new Promise(res => {
    let first = true;
    fb.au.onAuthStateChanged(fb.auth, u => {
      state.shows.clear(); state.movies.clear(); state.games.clear(); state.gamesReady = false;
      if (u) {
        state.user = { uid: u.uid, email: u.email };
        state.ready = false;
        subscribeUser(u.uid);
        fb.fs.setDoc(fb.fs.doc(fb.db, "users", u.uid), { email: u.email, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, seenAt: Date.now() }, { merge: true }).catch(() => { });
      } else {
        unsubs.forEach(x => x()); unsubs = [];
        state.user = null; state.ready = true;
      }
      emit();
      if (first) { first = false; res(state.user); }
    });
  });
}

export async function signIn(email, pass) {
  await loadFirebase();
  return fb.au.signInWithEmailAndPassword(fb.auth, email, pass);
}
export async function signUp(email, pass) {
  await loadFirebase();
  return fb.au.createUserWithEmailAndPassword(fb.auth, email, pass);
}
export async function resetPassword(email) {
  await loadFirebase();
  return fb.au.sendPasswordResetEmail(fb.auth, email);
}
// Suppression définitive du compte (exigence Google Play) : données Firestore + compte d'authentification
export async function deleteAccount(password) {
  if (!fb || !state.user || state.user.local) throw new Error("LOCAL");
  const { db, fs, au, auth } = fb;
  const u = auth.currentUser;
  if (password) await au.reauthenticateWithCredential(u, au.EmailAuthProvider.credential(u.email, password));
  const uid = u.uid;
  unsubs.forEach(x => x()); unsubs = [];
  for (const col of ["shows", "movies", "games", "push"]) {
    const snap = await fs.getDocs(fs.collection(db, "users", uid, col));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = fs.writeBatch(db); snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit();
    }
  }
  await fs.deleteDoc(fs.doc(db, "users", uid));
  await au.deleteUser(u);
}

export async function signOut() {
  if (!fb) return;
  return fb.au.signOut(fb.auth);
}

// ═════════════════ Écritures ═════════════════
const clean = o => JSON.parse(JSON.stringify(o)); // retire les undefined (Firestore les refuse)

export async function saveShow(show) {
  show = clean({ ...show, updatedAt: Date.now() });
  state.shows.set(show.id, show); emit();
  if (state.user?.local) return localSave();
  const { db, fs } = fb;
  return fs.setDoc(fs.doc(db, "users", state.user.uid, "shows", String(show.id)), show);
}
export async function deleteShow(id) {
  state.shows.delete(id); emit();
  if (state.user?.local) return localSave();
  const { db, fs } = fb;
  return fs.setDoc(fs.doc(db, "users", state.user.uid, "shows", String(id)), { id, deleted: true, updatedAt: Date.now() });
}
export async function saveMovie(m) {
  m = clean({ ...m, updatedAt: Date.now() });
  state.movies.set(m.id, m); emit();
  if (state.user?.local) return localSave();
  const { db, fs } = fb;
  return fs.setDoc(fs.doc(db, "users", state.user.uid, "movies", String(m.id)), m);
}
export async function deleteMovie(id) {
  state.movies.delete(id); emit();
  if (state.user?.local) return localSave();
  const { db, fs } = fb;
  return fs.setDoc(fs.doc(db, "users", state.user.uid, "movies", String(id)), { id, deleted: true, updatedAt: Date.now() });
}

export async function saveGame(g) {
  g = clean({ ...g, updatedAt: Date.now() });
  state.games.set(g.id, g); emit();
  if (state.user?.local) return localSave();
  const { db, fs } = fb;
  return fs.setDoc(fs.doc(db, "users", state.user.uid, "games", String(g.id)), g);
}
export async function deleteGame(id) {
  state.games.delete(id); emit();
  if (state.user?.local) return localSave();
  const { db, fs } = fb;
  return fs.setDoc(fs.doc(db, "users", state.user.uid, "games", String(id)), { id, deleted: true, updatedAt: Date.now() });
}

// Écriture en masse (import) — lots de 400
export async function bulk({ shows = [], movies = [] }, onProgress) {
  const now = Date.now();
  shows.forEach(s => state.shows.set(s.id, clean({ ...s, updatedAt: now })));
  movies.forEach(m => state.movies.set(m.id, clean({ ...m, updatedAt: now })));
  emit();
  if (state.user?.local) return localSave();
  const { db, fs } = fb;
  const ops = [
    ...shows.map(s => [fs.doc(db, "users", state.user.uid, "shows", String(s.id)), state.shows.get(s.id)]),
    ...movies.map(m => [fs.doc(db, "users", state.user.uid, "movies", String(m.id)), state.movies.get(m.id)])
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const b = fs.writeBatch(db);
    ops.slice(i, i + 400).forEach(([ref, v]) => b.set(ref, v));
    await b.commit();
    onProgress?.(Math.min(ops.length, i + 400), ops.length);
  }
}

// ═════════════════ Push ═════════════════
export async function savePushSub(id, sub) {
  if (state.user?.local) throw new Error("LOCAL");
  const { db, fs } = fb;
  return fs.setDoc(fs.doc(db, "users", state.user.uid, "push", id), {
    endpoint: sub.endpoint, keys: sub.keys, ua: navigator.userAgent, createdAt: Date.now(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
}
export async function removePushSub(id) {
  if (state.user?.local) return;
  const { db, fs } = fb;
  return fs.deleteDoc(fs.doc(db, "users", state.user.uid, "push", id));
}

// ═════════════════ Sauvegarde ═════════════════
export function exportJSON() {
  return {
    app: "bobine", version: 1, exportedAt: new Date().toISOString(),
    shows: [...state.shows.values()], movies: [...state.movies.values()], games: [...state.games.values()]
  };
}
export async function wipeAll() {
  const shows = [...state.shows.keys()], movies = [...state.movies.keys()], games = [...state.games.keys()];
  if (!state.user?.local) { state.shows.clear(); state.movies.clear(); state.games.clear(); emit(); }
  if (state.user?.local) { state.shows.clear(); state.movies.clear(); state.games.clear(); emit(); return localSave(); }
  const { db, fs } = fb;
  const refs = [
    ...shows.map(id => fs.doc(db, "users", state.user.uid, "shows", String(id))),
    ...movies.map(id => fs.doc(db, "users", state.user.uid, "movies", String(id))),
    ...games.map(id => fs.doc(db, "users", state.user.uid, "games", String(id)))
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const now = Date.now(); const b = fs.writeBatch(db); refs.slice(i, i + 400).forEach(r => b.set(r, { id: +r.id, deleted: true, updatedAt: now })); await b.commit();
  }
}
