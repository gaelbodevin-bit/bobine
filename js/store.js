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
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() }); }
  catch { db = fs.getFirestore(app); }
  fb = { app, auth, db, au, fs };
  return fb;
}

let unsubs = [];
function subscribeUser(uid) {
  const { db, fs } = fb;
  unsubs.forEach(u => u()); unsubs = [];
  let gotS = false, gotM = false;
  unsubs.push(fs.onSnapshot(fs.collection(db, "users", uid, "shows"), snap => {
    snap.docChanges().forEach(c => {
      if (c.type === "removed") state.shows.delete(+c.doc.id);
      else state.shows.set(+c.doc.id, c.doc.data());
    });
    gotS = true; if (gotM) state.ready = true; emit();
  }, err => console.error(err)));
  unsubs.push(fs.onSnapshot(fs.collection(db, "users", uid, "movies"), snap => {
    snap.docChanges().forEach(c => {
      if (c.type === "removed") state.movies.delete(+c.doc.id);
      else state.movies.set(+c.doc.id, c.doc.data());
    });
    gotM = true; if (gotS) state.ready = true; emit();
  }, err => console.error(err)));
  unsubs.push(fs.onSnapshot(fs.collection(db, "users", uid, "games"), snap => {
    snap.docChanges().forEach(c => {
      if (c.type === "removed") state.games.delete(+c.doc.id);
      else state.games.set(+c.doc.id, c.doc.data());
    });
    state.gamesReady = true; emit();
  }, err => console.error(err)));
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
  return fs.deleteDoc(fs.doc(db, "users", state.user.uid, "shows", String(id)));
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
  return fs.deleteDoc(fs.doc(db, "users", state.user.uid, "movies", String(id)));
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
  return fs.deleteDoc(fs.doc(db, "users", state.user.uid, "games", String(id)));
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
  if (state.user?.local) { state.shows.clear(); state.movies.clear(); state.games.clear(); emit(); return localSave(); }
  const { db, fs } = fb;
  const refs = [
    ...shows.map(id => fs.doc(db, "users", state.user.uid, "shows", String(id))),
    ...movies.map(id => fs.doc(db, "users", state.user.uid, "movies", String(id))),
    ...games.map(id => fs.doc(db, "users", state.user.uid, "games", String(id)))
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const b = fs.writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit();
  }
}
