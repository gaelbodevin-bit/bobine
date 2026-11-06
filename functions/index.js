// Playwatch — Cloud Functions Premium (achat unique à vie)
//  • verifyPlayPurchase : vérifie un achat Google Play (app Android) puis active Premium
//  • stripeWebhook      : reçoit les paiements Stripe (web) et active Premium
//  • referral           : parrainage (code perso, filleuls ; Premium offert au 3e filleul)
// Le droit est écrit dans entitlements/{uid} — les règles Firestore interdisent toute écriture côté client.
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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

// ── Parrainage ──
// refstats/{uid}   : { code, count, referees: [uid…], rewarded }   (serveur uniquement)
// refcodes/{CODE}  : { uid }                                       (serveur uniquement)
// referrals/{uid}  : { by, code, at }  — le filleul ne peut être parrainé qu'une fois
// Garde-fous : compte filleul créé depuis moins de 14 jours, pas soi-même, un seul parrain par compte,
// et un compte ne peut pas parrainer celui qui l'a parrainé. Premium offert au parrain à REF_GOAL filleuls.
const REF_GOAL = 3, REF_WINDOW = 14 * 864e5;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sans 0/O/1/I pour éviter les confusions
const newCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");

async function ensureCode(uid) {
  const ref = db.doc(`refstats/${uid}`);
  const cur = await ref.get();
  if (cur.exists && cur.data().code) return cur.data();
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    const ok = await db.runTransaction(async tx => {
      const c = db.doc(`refcodes/${code}`);
      if ((await tx.get(c)).exists) return false;
      tx.set(c, { uid, at: FieldValue.serverTimestamp() });
      tx.set(ref, { code, count: 0, referees: [], rewarded: false }, { merge: true });
      return true;
    });
    if (ok) return { code, count: 0, referees: [], rewarded: false };
  }
  throw new HttpsError("internal", "Impossible de créer un code, réessaie.");
}

async function refState(uid) {
  const st = await ensureCode(uid);
  const [mine, user] = await Promise.all([db.doc(`referrals/${uid}`).get(), getAuth().getUser(uid)]);
  const created = Date.parse(user.metadata.creationTime) || 0;
  return {
    code: st.code, count: st.count || 0, goal: REF_GOAL, rewarded: !!st.rewarded,
    referredBy: mine.exists ? mine.data().code : null,
    canClaim: !mine.exists && Date.now() - created < REF_WINDOW,
    claimUntil: created + REF_WINDOW
  };
}

export const referral = onCall({ region: REGION }, async req => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
  const action = String(req.data?.action || "me");
  if (action === "me") return refState(uid);
  if (action !== "claim") throw new HttpsError("invalid-argument", "Action inconnue.");

  const code = String(req.data?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (code.length < 4) throw new HttpsError("invalid-argument", "Code invalide.");
  const user = await getAuth().getUser(uid);
  if (Date.now() - (Date.parse(user.metadata.creationTime) || 0) > REF_WINDOW)
    throw new HttpsError("failed-precondition", "Le code de parrainage s'utilise dans les 14 jours après l'inscription.");
  const owner = await db.doc(`refcodes/${code}`).get();
  if (!owner.exists) throw new HttpsError("not-found", "Ce code n'existe pas.");
  const by = owner.data().uid;
  if (by === uid) throw new HttpsError("invalid-argument", "Tu ne peux pas utiliser ton propre code.");

  const reward = await db.runTransaction(async tx => {
    const mine = db.doc(`referrals/${uid}`), theirs = db.doc(`referrals/${by}`), stats = db.doc(`refstats/${by}`);
    const [m, t, st] = await Promise.all([tx.get(mine), tx.get(theirs), tx.get(stats)]);
    if (m.exists) throw new HttpsError("already-exists", "Tu as déjà utilisé un code de parrainage.");
    if (t.exists && t.data().by === uid) throw new HttpsError("invalid-argument", "Vous ne pouvez pas vous parrainer mutuellement.");
    const s = st.exists ? st.data() : { count: 0, referees: [], rewarded: false };
    const count = (s.count || 0) + 1;
    tx.set(mine, { by, code, at: FieldValue.serverTimestamp() });
    const now = count >= REF_GOAL && !s.rewarded;
    tx.set(stats, { count, referees: FieldValue.arrayUnion(uid), lastAt: FieldValue.serverTimestamp(), ...(now ? { rewarded: true, rewardedAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
    return now;
  });
  if (reward) {
    const e = await db.doc(`entitlements/${by}`).get();
    if (!e.exists || !e.data().premium) await grant(by, { source: "referral" });
    logger.info("parrainage : Premium offert", by);
  }
  return { ok: true, ...(await refState(uid)) };
});
