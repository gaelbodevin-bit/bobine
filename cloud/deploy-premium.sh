#!/usr/bin/env bash
# Playwatch — mise en service du paiement web (Stripe) + redéploiement du calendrier.
# À lancer dans Cloud Shell (projet bobine-4d524) :
#   git clone --depth 1 https://github.com/gaelbodevin-bit/bobine ~/bobine-deploy && bash ~/bobine-deploy/cloud/deploy-premium.sh
# Les clés sont demandées en saisie masquée : rien n'est affiché ni enregistré dans l'historique.
set -euo pipefail
P=bobine-4d524; R=europe-west1
cd "$(dirname "$0")/.."

echo "── 1/4 Secrets Stripe ──"
read -rsp "Clé secrète Stripe (sk_live_…) : " SK; echo
read -rsp "Secret de signature du webhook (whsec_…) : " WH; echo
[[ $SK == sk_live_* || $SK == rk_live_* ]] || { echo "La clé doit commencer par sk_live_ (ou rk_live_)."; exit 1; }
[[ $WH == whsec_* ]] || { echo "Le secret webhook doit commencer par whsec_."; exit 1; }
printf '%s' "$SK" | gcloud secrets versions add STRIPE_SECRET --data-file=- --project "$P" >/dev/null
printf '%s' "$WH" | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project "$P" >/dev/null
unset SK WH
echo "Secrets enregistrés."

echo "── 2/4 Fonction stripeWebhook ──"
(cd functions && npm install --no-audit --no-fund)
if firebase deploy --only functions:stripeWebhook --project "$P" --non-interactive --force; then
  echo "stripeWebhook redéployée (nouveau code + nouveaux secrets)."
else
  echo "Déploiement Firebase impossible (connexion ?) → on branche au moins les nouveaux secrets."
  gcloud run services update stripewebhook --region "$R" --project "$P" \
    --update-secrets=STRIPE_SECRET=STRIPE_SECRET:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest
fi

echo "── 3/4 Calendrier (textes FR/EN, pays) ──"
TK=$(grep -oP 'TMDB_KEY = "\K[^"]+' js/config.js)
(cd cloud/calendar && gcloud functions deploy calendar --gen2 --project="$P" --region="$R" \
  --runtime=nodejs22 --source=. --entry-point=calendar --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=120s --max-instances=3 --update-env-vars=TMDB_KEY="$TK" --quiet)

echo "── 4/4 Vérification ──"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$R-$P.cloudfunctions.net/stripeWebhook")
echo "stripeWebhook sans signature → HTTP $code (400 attendu = la fonction vérifie bien les signatures)"
echo "Terminé ✔"
