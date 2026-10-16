# 🎬 Bobine — l'alternative à TV Time

PWA de suivi de séries et de films, installable sur iPhone, avec notifications push des nouveaux épisodes.

- **À voir** : prochain épisode de chaque série (visuel de l'épisode, titre, « NOUVEAU » si sorti < 7 jours), coche en un tap avec Annuler
- **À venir** : calendrier des prochains épisodes + sorties ciné/VOD des films de ta liste, et ce qui est sorti cette semaine
- **Séries** : bibliothèque avec progression (En cours / À jour / Plus tard / Terminées / Arrêtées)
- **Films** : vus (par mois, avec note ★) et liste « À voir »
- **Explorer** : recherche + tendances, séries en diffusion, sorties ciné
- **Fiches** : visuel, affiche, synopsis FR (repli VO auto), genres, où regarder (plateformes FR), saisons/épisodes cochables, « vu jusqu'ici », distribution
- **Notifications** : nouvel épisode d'une série suivie, film de ta liste qui sort au ciné ou en VOD — 2 fois par jour, gratuit (GitHub Actions)
- **Import TV Time** (export RGPD .zip ou CSV), sauvegarde/restauration JSON, stats (temps passé), mode hors-ligne, badge sur l'icône

Stack : HTML/CSS/JS sans build · Firebase Auth + Firestore (plan gratuit Spark) · GitHub Pages · GitHub Actions + Web Push (VAPID) · données TMDB.

---

## Déploiement (≈ 20 min)

### 1. Clé TMDB (gratuite)
1. Crée un compte sur https://www.themoviedb.org → **Paramètres → API** → demande une clé (usage personnel).
2. Copie le **Jeton d'accès en lecture à l'API** (commence par `eyJ…`).
3. Garde-la : tu la colleras dans l'app au premier lancement (stockée sur ton téléphone, pas dans le dépôt public) et dans les secrets GitHub (étape 5).

### 2. Firebase
1. https://console.firebase.google.com → **Ajouter un projet** (Analytics inutile).
2. **Authentication → Commencer → Adresse e-mail/Mot de passe → Activer.**
3. **Firestore Database → Créer** (mode production, région `eur3` ou `europe-west`).
4. Onglet **Règles** de Firestore → colle le contenu de `firestore.rules` → **Publier**.
5. **Paramètres du projet → Vos applications → `</>` Web** → enregistre l'app → copie l'objet `firebaseConfig` dans `js/config.js` (`FIREBASE_CONFIG`).
6. **Paramètres du projet → Comptes de service → Générer une nouvelle clé privée** → un `.json` se télécharge (pour l'étape 5, ne le commite pas).
7. **Authentication → Paramètres → Domaines autorisés** → ajoute `TONPSEUDO.github.io`.

### 3. Clés VAPID (notifications)
Sur n'importe quel ordi avec Node :
```
npx web-push generate-vapid-keys
```
- **Public Key** → `VAPID_PUBLIC_KEY` dans `js/config.js` **et** secret GitHub
- **Private Key** → secret GitHub uniquement

### 4. GitHub Pages
1. Nouveau dépôt **public** `bobine` → dépose tout le dossier (GitHub Desktop : commit + push).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
3. L'app est sur `https://TONPSEUDO.github.io/bobine/`.

### 5. Secrets du notifier
**Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Valeur |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | tout le contenu du `.json` de l'étape 2.6 |
| `TMDB_KEY` | ta clé TMDB |
| `VAPID_PUBLIC_KEY` | clé publique VAPID |
| `VAPID_PRIVATE_KEY` | clé privée VAPID |
| `VAPID_SUBJECT` | `mailto:ton@email.fr` |

Puis **Actions → Notifications Bobine → Enable workflow** si GitHub le demande.

### 6. Sur l'iPhone
1. Ouvre `https://TONPSEUDO.github.io/bobine/` dans **Safari**.
2. **Partager → Sur l'écran d'accueil** (obligatoire pour les notifications sur iOS).
3. Ouvre Bobine **depuis l'icône**, colle ta clé TMDB, crée ton compte.
4. **Profil → Notifications → Activer** → accepte.
5. Test : **Actions → Notifications Bobine → Run workflow → coche « test »** → tu dois recevoir une notif.

---

## Importer ton historique TV Time
Profil → **Importer depuis TV Time** → choisis le `.zip` de l'export RGPD (ou directement `tracking-prod-records-v2.csv` pour les épisodes et `tracking-prod-records.csv` pour les films).
Bobine détecte les colonnes (les noms ont varié au fil des années), retrouve chaque série via son ID TVDB → TMDB (repli sur le nom), puis affiche ce qu'il n'a pas pu identifier.
Si quelque chose cloche, ouvre le CSV et envoie-moi juste la **ligne d'en-tête** : j'adapte le détecteur.

## Comment marchent les notifications
`.github/workflows/notify.yml` lance `notifier/notify.mjs` vers 8 h et 19 h (Paris). Pour chaque appareil abonné, il lit tes séries dans Firestore, demande à TMDB les épisodes sortis depuis 2 jours, ignore ceux déjà vus ou déjà notifiés, et envoie la notif (visuel de l'épisode inclus). Plus de 4 nouveautés d'un coup → une seule notif récap. Les films de ta liste « À voir » déclenchent une notif le jour de leur sortie ciné (FR) et VOD. Une étape « keepalive » évite que GitHub ne coupe les tâches planifiées après 60 jours d'inactivité.

## Fichiers
```
index.html  manifest.webmanifest  sw.js        → app + service worker (hors-ligne, push)
css/app.css                                     → design
js/config.js                                    → ⚙️ tes clés (Firebase, VAPID, TMDB optionnelle)
js/app.js  tmdb.js  store.js  push.js  import-tvtime.js
icons/                                          → icônes iOS/Android
firestore.rules                                 → règles de sécurité
notifier/  .github/workflows/notify.yml         → envoi des notifications
```

## Mode local
Si `FIREBASE_CONFIG` est vide, l'app fonctionne sans compte (données dans le navigateur, pas de synchro ni de push) — pratique pour tester.

---
Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Plateformes de diffusion : JustWatch via TMDB.
