// ─────────────────────────────────────────────────────────────
//  Bobine — configuration
//  Remplis ces 3 blocs (voir README.md). Tout le reste est prêt.
// ─────────────────────────────────────────────────────────────

// 1) TMDB — https://www.themoviedb.org/settings/api
//    Colle soit le "Jeton d'accès en lecture à l'API" (v4, commence par eyJ…),
//    soit la "Clé d'API" (v3, 32 caractères). Les deux marchent.
export const TMDB_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI4NWRiNWZkNWUyN2QyY2Q2MmI1NTZlNzkxYWMzN2RhMCIsIm5iZiI6MTc5MjE4OTAyMS4wMTgsInN1YiI6IjZhZDJhMjVkZGI1ZGY5NWZiZTFkMjMxNyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.iMMOYrBsGbLAchW7dRpO4UrnLjeqXAp-lPoPGkx3l8I";

// 2) Firebase — Console Firebase > Paramètres du projet > Vos applications > Web
//    Laisse vide pour tester en mode local (données dans le navigateur, pas de push).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAIFyKPzFc4KZvsgfTmdsjxpJRZWcOcyPI",
  authDomain: "bobine-4d524.firebaseapp.com",
  projectId: "bobine-4d524",
  storageBucket: "bobine-4d524.firebasestorage.app",
  messagingSenderId: "640487665357",
  appId: "1:640487665357:web:c576b9c4d1b14897ea0384"
};

// 3) Clé publique VAPID pour les notifications push
//    Générée avec : npx web-push generate-vapid-keys
export const VAPID_PUBLIC_KEY = "BHg7wVb7QbAAHrC4iU9j02tgN2e_JJ6ZbJIW1X9Iq16j4MQpFi7xU_vHPmhP6Mx5oS3fKCFTUnt_BexBgo-xVjI";

// Langue / région des contenus TMDB
export const LANG = "fr-FR";
export const REGION = "FR";
