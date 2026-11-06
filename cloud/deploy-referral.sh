#!/usr/bin/env bash
# Playwatch — mise en service du parrainage (fonction « referral »).
# À lancer dans Cloud Shell (projet bobine-4d524) :
#   rm -rf ~/bobine-ref && git clone --depth 1 https://github.com/gaelbodevin-bit/bobine ~/bobine-ref && bash ~/bobine-ref/cloud/deploy-referral.sh
set -euo pipefail
P=bobine-4d524; R=europe-west1
cd "$(dirname "$0")/.."
echo "── 1/2 Fonction referral ──"
(cd functions && npm install --no-audit --no-fund)
firebase deploy --only functions:referral --project "$P" --non-interactive --force
echo "── 2/2 Vérification ──"
code=$(curl -s -o /tmp/ref.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"data":{"action":"me"}}' "https://$R-$P.cloudfunctions.net/referral")
echo "Appel sans connexion → HTTP $code (401 attendu : la fonction exige un compte) · $(head -c 120 /tmp/ref.json)"
echo "Terminé ✔"
