// Playwatch Premium — achat unique à vie.
//  • Android (app Play Store / TWA) : Google Play Billing via la Digital Goods API (obligatoire sur Play)
//  • iPhone / web : Stripe (Payment Link), le serveur reçoit le webhook et active le droit
// Le droit est stocké dans Firestore (entitlements/{uid}) et n'est modifiable que par le serveur.
import * as store from "./store.js";

export const PRODUCT = "premium_lifetime";          // ID du produit intégré dans la Play Console
export const PRICE_FALLBACK = "1,99 €";             // affiché si le prix Play n'est pas disponible
// Lien de paiement Stripe (Dashboard Stripe → Payment Links). Laisser vide tant que Stripe n'est pas configuré.
export const STRIPE_LINK = "";

export const isPremium = () => !!store.data.premium;

// Détection de l'app Android (Trusted Web Activity) : referrer android-app:// au premier chargement
(() => { try { if (document.referrer.startsWith("android-app://")) sessionStorage.setItem("bobine:twa", "1"); } catch { } })();
export const isTWA = () => { try { return sessionStorage.getItem("bobine:twa") === "1"; } catch { return false; } };
const PLAY = "https://play.google.com/billing";
async function playService() {
  if (!("getDigitalGoodsService" in window)) return null;
  try { return await window.getDigitalGoodsService(PLAY); } catch { return null; }
}
export const channel = () => (isTWA() || "getDigitalGoodsService" in window) ? "play" : (STRIPE_LINK ? "stripe" : "none");

let priceCache = null;
export async function price() {
  if (priceCache) return priceCache;
  if (channel() === "play") {
    try {
      const svc = await playService(); const [d] = await svc.getDetails([PRODUCT]);
      if (d?.price) return priceCache = new Intl.NumberFormat("fr-FR", { style: "currency", currency: d.price.currency }).format(+d.price.value);
    } catch { }
  }
  return PRICE_FALLBACK;
}

// Achat : renvoie "done" (droit activé), "pending" (paiement web en cours) ou lève une erreur
export async function buy() {
  const u = store.data.user;
  if (!u || u.local) throw new Error("Connecte-toi pour acheter Premium.");
  const ch = channel();
  if (ch === "play") {
    const svc = await playService(); if (!svc) throw new Error("Google Play Billing indisponible.");
    const [d] = await svc.getDetails([PRODUCT]);
    if (!d) throw new Error("Produit introuvable sur Google Play.");
    const req = new PaymentRequest([{ supportedMethods: PLAY, data: { sku: PRODUCT } }],
      { total: { label: "Playwatch Premium", amount: { currency: d.price.currency, value: d.price.value } } });
    const res = await req.show();
    try {
      await store.callFn("verifyPlayPurchase", { purchaseToken: res.details.purchaseToken, productId: PRODUCT });
      await res.complete("success");
      return "done";
    } catch (e) { await res.complete("fail").catch(() => { }); throw e; }
  }
  if (ch === "stripe") {
    const url = new URL(STRIPE_LINK);
    url.searchParams.set("client_reference_id", u.uid);
    if (u.email) url.searchParams.set("prefilled_email", u.email);
    location.href = url.toString();
    return "pending";
  }
  throw new Error("Le paiement n'est pas encore disponible sur cet appareil.");
}

// Restaurer : Play renvoie les achats du compte Google ; sur le web le droit suit le compte Playwatch
export async function restore() {
  if (channel() !== "play") return isPremium();
  const svc = await playService(); if (!svc) return isPremium();
  const list = await svc.listPurchases();
  const p = list.find(x => x.itemId === PRODUCT);
  if (p) await store.callFn("verifyPlayPurchase", { purchaseToken: p.purchaseToken, productId: PRODUCT });
  return !!p;
}
