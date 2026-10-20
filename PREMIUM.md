# Playwatch Premium — mise en service

Achat unique à vie. Débloque : notifications, statistiques avancées, thèmes & couleurs, import d'historique.
Le suivi (séries, films, jeux) et l'export des données restent gratuits.

| Où | Paiement | Vérification |
|---|---|---|
| App Android (Play Store) | Google Play Billing (obligatoire sur Play) | Cloud Function `verifyPlayPurchase` |
| iPhone / navigateur | Stripe (Payment Link) | Cloud Function `stripeWebhook` |

Le droit est stocké dans `entitlements/{uid}` : lisible par l'utilisateur, **écrit uniquement par le serveur** (règles Firestore).

---

## ⚠️ Ordre de déploiement
Le code app est prêt mais **non déployé**. Dès qu'il sera en ligne, tout compte sans `entitlements/{uid}.premium = true` perd notifications, thèmes et import — **toi compris**. Fais l'étape 3 avant de déployer le site.

## 1. Firebase en plan Blaze (requis pour les Cloud Functions)
1. Console Firebase → ⚙︎ → Utilisation et facturation → **Passer à Blaze** (carte bancaire).
2. Google Cloud → Facturation → **Budgets et alertes** → budget de **1 €** avec alertes à 50 / 90 / 100 %.
   À ton échelle le coût réel est ~0 € (2 M d'appels de fonctions gratuits / mois).

## 2. Déployer règles + fonctions (depuis le dossier du dépôt, sur ton PC)
```bash
npm install -g firebase-tools
firebase login
cd functions && npm install && cd ..
firebase functions:secrets:set STRIPE_SECRET          # sk_live_… (ou "x" tant que Stripe n'est pas prêt)
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET  # whsec_… (ou "x")
firebase deploy --only firestore:rules,functions
```
Note l'URL affichée pour `stripeWebhook` (https://europe-west1-bobine-4d524.cloudfunctions.net/stripeWebhook).

## 3. T'offrir Premium (compte fondateur)
Console Firebase → Firestore → **Démarrer une collection** `entitlements`
→ ID du document = ton UID (Authentication → Utilisateurs → colonne « UID utilisateur »)
→ champs : `premium` (boolean) = `true`, `source` (string) = `owner`.

## 4. Google Play
1. Play Console → **Paramètres → Profil de paiement** : créer le compte marchand (Blue Cell Production, SIRET, IBAN).
2. Playwatch → **Monétiser → Produits → Produits intégrés** → Créer :
   ID **`premium_lifetime`**, nom « Playwatch Premium », prix **1,99 €** (Google convertit les autres pays) → Activer.
3. Google Cloud (projet bobine-4d524) → API → activer **Google Play Android Developer API**.
4. Play Console → **Utilisateurs et autorisations → Inviter** l'adresse
   `640487665357-compute@developer.gserviceaccount.com`
   avec « Afficher les données financières » + « Gérer les commandes et les abonnements », appli Playwatch.
5. PWABuilder (génération de l'AAB) : cocher **Play Billing** (Digital Goods API) dans les options Android.
6. Tester avec un « testeur de licence » (Play Console → Paramètres → Test des licences) : achat gratuit.

## 5. Stripe (iPhone / web)
1. Créer le compte Stripe (Blue Cell Production).
2. Produit « Playwatch Premium », **paiement unique 1,99 €** → **Payment Link**.
   Après paiement : rediriger vers `https://gaelbodevin-bit.github.io/bobine/#profile`.
3. Développeurs → Webhooks → endpoint = URL `stripeWebhook`,
   événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`.
   Copier le secret `whsec_…` → `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET` puis redéployer les fonctions.
4. Coller l'URL du Payment Link dans `js/premium.js` → `STRIPE_LINK`.
5. Fiscalité : en micro-entreprise en franchise de TVA, mentionne « TVA non applicable, art. 293 B du CGI » sur les reçus Stripe (Paramètres → Reçus). Si tu dépasses les seuils ou vends hors France, vois avec ton comptable (OSS).

## 6. Play Console — mises à jour
- **Sécurité des données** : ajouter *Infos financières → Historique des achats* (collecté, non partagé, obligatoire pour l'achat, finalité « Fonctionnement de l'appli »).
- La fiche affichera automatiquement « Achats intégrés ».
- Mettre à jour la description : section « ✨ Premium ».

## 7. Déployer le site
Fichiers modifiés : `js/app.js`, `js/store.js`, `js/premium.js` (nouveau), `css/app.css`, `privacy.html`, `sw.js`, `notifier/notify.mjs`.
Le notifier n'envoie plus de notifications qu'aux comptes Premium.
