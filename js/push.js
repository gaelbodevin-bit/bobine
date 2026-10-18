// Notifications Web Push (iOS 16.4+ : l'app doit être ajoutée à l'écran d'accueil).
import { VAPID_PUBLIC_KEY } from "./config.js";
import * as store from "./store.js";

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function b64ToU8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
async function subId(endpoint) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function status() {
  if (!supported()) return isIOS && !isStandalone() ? "install" : "unsupported";
  if (store.data.user?.local) return "local";
  if (!VAPID_PUBLIC_KEY) return "noconfig";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

// À appeler depuis un clic (obligatoire sur iOS)
export async function enable() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission refusée");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  await store.savePushSub(await subId(j.endpoint), j);
  return true;
}

export async function disable() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await store.removePushSub(await subId(sub.endpoint)); await sub.unsubscribe(); }
}

// Re-synchronise l'abonnement (au cas où iOS l'aurait renouvelé)
export async function refresh() {
  try {
    if (!supported() || Notification.permission !== "granted" || store.data.user?.local || !VAPID_PUBLIC_KEY) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { const j = sub.toJSON(); await store.savePushSub(await subId(j.endpoint), j); }
  } catch { }
}

export async function testLocal() {
  const reg = await navigator.serviceWorker.ready;
  return reg.showNotification("Bobine 🎬", { body: "Les notifications fonctionnent. Tu seras prévenu à chaque nouvel épisode.", icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "test" });
}

export async function clearAll() {
  setBadge(0);
  try { const reg = await navigator.serviceWorker?.ready; (await reg?.getNotifications?.() || []).forEach(n => n.close()); } catch { }
}
export function setBadge(n) {
  try { if ("setAppBadge" in navigator) n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch { }
}
