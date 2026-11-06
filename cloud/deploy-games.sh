#!/usr/bin/env bash
# Playwatch — relais « jeux vidéo » : cache commun + secours IGDB quand RAWG est en panne.
# À lancer dans Cloud Shell (projet bobine-4d524) :
#   rm -rf ~/bobine-games && git clone --depth 1 https://github.com/gaelbodevin-bit/bobine ~/bobine-games && bash ~/bobine-games/cloud/deploy-games.sh
# Le secret Twitch est demandé en saisie masquée : rien n'est affiché ni enregistré dans l'historique.
# Laisser le Client ID vide = relais sans secours IGDB (cache commun seulement) ; on pourra relancer plus tard.
set -euo pipefail
P=bobine-4d524; R=europe-west1
cd "$(dirname "$0")/.."

echo "── 1/3 Identifiants Twitch (IGDB) ──"
echo "À créer sur https://dev.twitch.tv/console/apps → « Register Your Application »"
echo "  Nom : Playwatch · URL de redirection : http://localhost · Catégorie : Application Integration · Client : Confidentiel"
read -rp "Client ID Twitch (Entrée pour passer) : " CID
SECRETS=""
if [[ -n "$CID" ]]; then
  read -rsp "Client Secret Twitch : " CSEC; echo
  [[ -n "$CSEC" ]] || { echo "Client Secret vide."; exit 1; }
  # Vérifie les identifiants auprès de Twitch avant de les enregistrer
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://id.twitch.tv/oauth2/token?client_id=$CID&client_secret=$CSEC&grant_type=client_credentials")
  [[ $code == 200 ]] || { echo "Twitch refuse ces identifiants (HTTP $code). Vérifie le Client ID et génère un nouveau secret."; exit 1; }
  for n in IGDB_CLIENT_ID IGDB_CLIENT_SECRET; do
    gcloud secrets describe "$n" --project "$P" >/dev/null 2>&1 || gcloud secrets create "$n" --replication-policy=automatic --project "$P" >/dev/null
  done
  printf '%s' "$CID" | gcloud secrets versions add IGDB_CLIENT_ID --data-file=- --project "$P" >/dev/null
  printf '%s' "$CSEC" | gcloud secrets versions add IGDB_CLIENT_SECRET --data-file=- --project "$P" >/dev/null
  unset CSEC
  PN=$(gcloud projects describe "$P" --format='value(projectNumber)')
  SA="$PN-compute@developer.gserviceaccount.com"
  for n in IGDB_CLIENT_ID IGDB_CLIENT_SECRET; do
    gcloud secrets add-iam-policy-binding "$n" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --project "$P" >/dev/null
  done
  SECRETS="--set-secrets=IGDB_CLIENT_ID=IGDB_CLIENT_ID:latest,IGDB_CLIENT_SECRET=IGDB_CLIENT_SECRET:latest"
  echo "Identifiants Twitch vérifiés et enregistrés."
else
  echo "Pas d'IGDB : le relais servira le cache commun uniquement."
fi

echo "── 2/3 Fonction games ──"
RK=$(grep -oP 'RAWG_KEY = "\K[^"]+' js/config.js)
(cd cloud/games && gcloud functions deploy games --gen2 --project="$P" --region="$R" \
  --runtime=nodejs22 --source=. --entry-point=games --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=30s --max-instances=5 --set-env-vars=RAWG_KEY="$RK" $SECRETS --quiet)

echo "── 3/3 Vérification ──"
U="https://$R-$P.cloudfunctions.net/games/games?search=rocket%20league&page_size=3&search_precise=true"
curl -s -H "Origin: https://playwatch.app" -D /tmp/games.h -o /tmp/games.json "$U" || true
echo "Réponse : $(head -1 /tmp/games.h | tr -d '\r') · source : $(grep -i '^x-source' /tmp/games.h | cut -d' ' -f2 | tr -d '\r')"
grep -o '"name":"[^"]*"' /tmp/games.json | head -3 || true
echo "Terminé ✔  (source rawg = RAWG répond ; igdb = secours IGDB ; cache-… = déjà en cache)"
