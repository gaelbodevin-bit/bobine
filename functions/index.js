// Playwatch — Cloud Functions Premium (achat unique à vie)
//  • verifyPlayPurchase : vérifie un achat Google Play (app Android) puis active Premium
//  • stripeWebhook      : reçoit les paiements Stripe (iPhone / web) et active Premium
// Le droit est écrit dans entitlements/{uid} — les règles Firestore interdisent toute écriture côté client.
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import Stripe from "stripe";
import { createHash } from "node:crypto";

initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const PACKAGE = "com.bluecellproduction.bobine";
const PRODUCT = "premium_lifetime";
const STRIPE_SECRET = defineSecret("STRIPE_SECRET");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const grant = (uid, data) => db.doc(`entitlements/${uid}`).set({ premium: true, since: FieldValue.serverTimestamp(), ...data }, { merge: true });
const revoke = (uid, reason) => db.doc(`entitlements/${uid}`).set({ premium: false, revokedAt: FieldValue.serverTimestamp(), revokeReason: reason }, { merge: true });

// ── Google Play ──
// Le compte de service des Functions doit être invité dans la Play Console (voir PREMIUM.md).
const publisher = () => google.androidpublisher({
  version: "v3",
  auth: new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] })
});

export const verifyPlayPurchase = onCall({ region: REGION }, async req => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
  const token = String(req.data?.purchaseToken || "");
  const productId = String(req.data?.productId || PRODUCT);
  if (!token || productId !== PRODUCT) throw new HttpsError("invalid-argument", "Achat invalide.");

  const ap = publisher();
  let p;
  try { p = (await ap.purchases.products.get({ packageName: PACKAGE, productId, token })).data; }
  catch (e) { logger.error("play get", e.message); throw new HttpsError("not-found", "Achat introuvable sur Google Play."); }
  if (p.purchaseState !== 0) throw new HttpsError("failed-precondition", p.purchaseState === 2 ? "Paiement en attente." : "Achat annulé.");

  // Un achat = un seul compte Playwatch
  const key = createHash("sha256").update(token).digest("hex");
  const ref = db.doc(`purchases/${key}`);
  await db.runTransaction(async tx => {
    const cur = await tx.get(ref);
    if (cur.exists && cur.data().uid !== uid) throw new HttpsError("already-exists", "Cet achat est déjà lié à un autre compte Playwatch.");
    tx.set(ref, { uid, source: "play", orderId: p.orderId || null, productId, at: FieldValue.serverTimestamp() }, { merge: true });
  });

  // Google rembourse automatiquement un achat non confirmé sous 3 jours
  if (p.acknowledgementState === 0) {
    await ap.purchases.products.acknowledge({ packageName: PACKAGE, productId, token, requestBody: {} }).catch(e => logger.warn("ack", e.message));
  }
  await grant(uid, { source: "play", orderId: p.orderId || null, purchaseKey: key });
  return { premium: true };
});

// ── Stripe (iPhone / web) ──
const PLAYWATCH_LINK = "plink_1UVYPRV05Q4PHiYl5e561fxD";   // buy.stripe.com/5kQ6oKdaifYc2SldZ9cAo00
// Payment Link avec ?client_reference_id=<uid> ; webhook : checkout.session.completed + charge.refunded
export const stripeWebhook = onRequest({ region: REGION, secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  const stripe = new Stripe(STRIPE_SECRET.value());
  let ev;
  try { ev = stripe.webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET.value()); }
  catch (e) { logger.warn("signature", e.message); res.status(400).send("bad signature"); return; }

  try {
    if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
      const s = ev.data.object;
      const uid = s.client_reference_id;
      // Compte Stripe partagé avec d'autres applis : on ne traite que le lien de paiement Playwatch
      if (s.payment_link !== PLAYWATCH_LINK) { logger.info("autre produit, ignoré", s.id); res.json({ received: true, ignored: true }); return; }
      if (uid && s.payment_status === "paid") {
        await db.doc(`purchases/stripe_${s.payment_intent}`).set({ uid, source: "stripe", session: s.id, email: s.customer_details?.email || null, amount: s.amount_total, currency: s.currency, at: FieldValue.serverTimestamp() });
        await grant(uid, { source: "stripe", paymentIntent: s.payment_intent });
      } else logger.warn("session sans uid ou non payée", s.id);
    }
    if (ev.type === "charge.refunded") {
      const c = ev.data.object;
      const d = await db.doc(`purchases/stripe_${c.payment_intent}`).get();
      if (d.exists && c.refunded) await revoke(d.data().uid, "refund");
    }
    res.json({ received: true });
  } catch (e) { logger.error(e); res.status(500).send("error"); }
});
