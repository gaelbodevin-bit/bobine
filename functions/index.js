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
// refstats/{uid}   : { code, count (validés), pending, referees: [uid…], rewarded }   (serveur uniquement)
// refcodes/{CODE}  : { uid }                                                          (serveur uniquement)
// referrals/{uid}  : { by, code, at, status: pending|valid|duplicate, ip, day, days[] } — un seul parrain par compte
// Garde-fous : compte filleul de moins de 14 jours, pas soi-même, pas de parrainage croisé.
// Un filleul ne compte qu'une fois « actif » : compte vérifié (Google ou e-mail confirmé), au moins
// REF_MIN_TITLES titres dans sa bibliothèque et l'appli ouverte sur REF_MIN_DAYS jours différents.
// Deux filleuls d'un même parrain inscrits le même jour depuis la même connexion internet ne comptent qu'une fois.
// Premium offert au parrain à REF_GOAL filleuls validés.
const REF_GOAL = 3, REF_WINDOW = 14 * 864e5, REF_MIN_TITLES = 5, REF_MIN_DAYS = 2;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sans 0/O/1/I pour éviter les confusions
const newCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
const parisDay = (t = Date.now()) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const clientIp = req => String(req.rawRequest?.headers?.["x-forwarded-for"] || req.rawRequest?.ip || "").split(",")[0].trim();
const ipHash = ip => ip ? createHash("sha256").update("pw-ref:" + ip).digest("hex").slice(0, 16) : "";   // on ne garde pas l'adresse en clair

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
      tx.set(ref, { code, count: 0, pending: 0, referees: [], rewarded: false }, { merge: true });
      return true;
    });
    if (ok) return { code, count: 0, pending: 0, referees: [], rewarded: false };
  }
  throw new HttpsError("internal", "Impossible de créer un code, réessaie.");
}

const isVerified = u => !!u.emailVerified || (u.providerData || []).some(p => p.providerId === "google.com");
async function libraryCount(uid) {
  let n = 0;
  for (const col of ["shows", "movies", "games"]) {
    const c = db.collection(`users/${uid}/${col}`);
    const [all, del] = await Promise.all([c.count().get(), c.where("deleted", "==", true).count().get()]);
    n += all.data().count - del.data().count;
  }
  return n;
}
// Conditions remplies par le filleul (pour l'afficher dans son appli)
async function conditions(uid, user, r) {
  const titles = await libraryCount(uid);
  return { verified: isVerified(user), titles, titlesNeeded: REF_MIN_TITLES, days: (r.days || []).length, daysNeeded: REF_MIN_DAYS };
}
const conditionsMet = c => c.verified && c.titles >= REF_MIN_TITLES && c.days >= REF_MIN_DAYS;

// Valide (ou écarte) un parrainage en attente quand le filleul remplit les conditions
async function settle(uid, user) {
  const mineRef = db.doc(`referrals/${uid}`);
  const m = await mineRef.get();
  if (!m.exists) return null;
  const r = m.data();
  if (r.status && r.status !== "pending") return { status: r.status };
  const today = parisDay();
  if (!(r.days || []).includes(today)) { await mineRef.set({ days: FieldValue.arrayUnion(today) }, { merge: true }); r.days = [...(r.days || []), today]; }
  const c = await conditions(uid, user, r);
  if (!conditionsMet(c)) return { status: "pending", conditions: c };
  // Même parrain, même connexion, même jour qu'un filleul déjà validé → doublon
  let dup = false;
  if (r.ip) {
    const twins = await db.collection("referrals").where("by", "==", r.by).where("ip", "==", r.ip).get();
    dup = twins.docs.some(d => d.id !== uid && d.data().status === "valid" && d.data().day === r.day);
  }
  const by = r.by;
  const reward = await db.runTransaction(async tx => {
    const stats = db.doc(`refstats/${by}`);
    const [cur, st] = await Promise.all([tx.get(mineRef), tx.get(stats)]);
    if (cur.data()?.status && cur.data().status !== "pending") return false;
    const s = st.exists ? st.data() : {};
    const pending = Math.max(0, (s.pending || 0) - 1);
    if (dup) { tx.set(mineRef, { status: "duplicate", settledAt: FieldValue.serverTimestamp() }, { merge: true }); tx.set(stats, { pending }, { merge: true }); return false; }
    const count = (s.count || 0) + 1, now = count >= REF_GOAL && !s.rewarded;
    tx.set(mineRef, { status: "valid", settledAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(stats, { count, pending, referees: FieldValue.arrayUnion(uid), lastAt: FieldValue.serverTimestamp(), ...(now ? { rewarded: true, rewardedAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
    return now;
  });
  if (reward) {
    const e = await db.doc(`entitlements/${by}`).get();
    if (!e.exists || !e.data().premium) await grant(by, { source: "referral" });
    logger.info("parrainage : Premium offert", by);
  }
  return { status: dup ? "duplicate" : "valid" };
}

async function refState(uid, user, mine) {
  const st = await ensureCode(uid);
  user = user || await getAuth().getUser(uid);
  const created = Date.parse(user.metadata.creationTime) || 0;
  return {
    code: st.code, count: st.count || 0, pending: st.pending || 0, goal: REF_GOAL, rewarded: !!st.rewarded,
    referredBy: mine?.code || null, myStatus: mine?.status || null, myConditions: mine?.conditions || null,
    canClaim: !mine && Date.now() - created < REF_WINDOW,
    claimUntil: created + REF_WINDOW
  };
}

export const referral = onCall({ region: REGION }, async req => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
  const action = String(req.data?.action || "me");
  const user = await getAuth().getUser(uid);

  if (action === "me") {
    // À chaque ouverture : on note le jour d'utilisation du filleul et on valide son parrainage s'il remplit les conditions
    const m = await db.doc(`referrals/${uid}`).get();
    let mine = null;
    if (m.exists) { const s = await settle(uid, user); mine = { code: m.data().code, ...(s || {}) }; }
    return refState(uid, user, mine);
  }
  if (action !== "claim") throw new HttpsError("invalid-argument", "Action inconnue.");

  const code = String(req.data?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (code.length < 4) throw new HttpsError("invalid-argument", "Code invalide.");
  if (Date.now() - (Date.parse(user.metadata.creationTime) || 0) > REF_WINDOW)
    throw new HttpsError("failed-precondition", "Le code de parrainage s'utilise dans les 14 jours après l'inscription.");
  const owner = await db.doc(`refcodes/${code}`).get();
  if (!owner.exists) throw new HttpsError("not-found", "Ce code n'existe pas.");
  const by = owner.data().uid;
  if (by === uid) throw new HttpsError("invalid-argument", "Tu ne peux pas utiliser ton propre code.");
  const ip = ipHash(clientIp(req)), day = parisDay();

  await db.runTransaction(async tx => {
    const mine = db.doc(`referrals/${uid}`), theirs = db.doc(`referrals/${by}`), stats = db.doc(`refstats/${by}`);
    const [m, t] = await Promise.all([tx.get(mine), tx.get(theirs)]);
    if (m.exists) throw new HttpsError("already-exists", "Tu as déjà utilisé un code de parrainage.");
    if (t.exists && t.data().by === uid) throw new HttpsError("invalid-argument", "Vous ne pouvez pas vous parrainer mutuellement.");
    tx.set(mine, { by, code, at: FieldValue.serverTimestamp(), status: "pending", ip, day, days: [day] });
    tx.set(stats, { pending: FieldValue.increment(1), lastAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  const s = await settle(uid, user);
  return { ok: true, ...(await refState(uid, user, { code, ...(s || {}) })) };
});
