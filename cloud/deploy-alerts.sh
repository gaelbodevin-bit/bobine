#!/usr/bin/env bash
# Playwatch — alertes e-mail avant facturation réelle (projet bobine-4d524).
# À lancer dans Cloud Shell :
#   rm -rf ~/bobine-alerts && git clone --depth 1 https://github.com/gaelbodevin-bit/bobine ~/bobine-alerts && bash ~/bobine-alerts/cloud/deploy-alerts.sh
#
# Ce que ça installe (relançable sans créer de doublons) :
#  1. Un canal e-mail Cloud Monitoring.
#  2. Trois alertes « 90 % du quota gratuit Firestore » sur 24 h glissantes :
#       lectures 45 000 / 50 000 · écritures 18 000 / 20 000 · suppressions 18 000 / 20 000.
#  3. Un budget de facturation de 1 (devise du compte) limité au projet, qui prévient à 90 %
#     de la dépense prévue du mois, puis à 90 % et 100 % de la dépense réelle.
#     Il couvre tout le reste (Functions, Cloud Run, stockage des images, etc.).
# Un seul e-mail par alerte (pas de second message à la fermeture).
set -euo pipefail
P=bobine-4d524
TAG="Playwatch ·"

DEF=$(gcloud config get-value account 2>/dev/null || true)
read -rp "Adresse qui reçoit les alertes [${DEF}] : " EMAIL
EMAIL=${EMAIL:-$DEF}
[[ "$EMAIL" == *@* ]] || { echo "Adresse invalide."; exit 1; }

echo "── 1/4 Services ──"
gcloud services enable monitoring.googleapis.com billingbudgets.googleapis.com cloudbilling.googleapis.com --project "$P"

TOK=$(gcloud auth print-access-token)
API="https://monitoring.googleapis.com/v3/projects/$P"
H=(-H "Authorization: Bearer $TOK" -H "x-goog-user-project: $P" -H "Content-Type: application/json")
j() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }

echo "── 2/4 Canal e-mail ──"
CH=$(curl -s "${H[@]}" "$API/notificationChannels?filter=type%3D%22email%22" \
  | j "print(next((c['name'] for c in d.get('notificationChannels',[]) if c.get('labels',{}).get('email_address')=='$EMAIL'),''))")
if [[ -z "$CH" ]]; then
  CH=$(curl -s "${H[@]}" -X POST "$API/notificationChannels" \
    -d "{\"type\":\"email\",\"displayName\":\"$TAG alertes ($EMAIL)\",\"labels\":{\"email_address\":\"$EMAIL\"}}" \
    | j "print(d.get('name') or sys.exit('Création du canal refusée : '+json.dumps(d)))")
fi
echo "Canal : $CH"

echo "── 3/4 Alertes quota gratuit Firestore ──"
# Supprime les anciennes versions de ces alertes pour pouvoir relancer le script
curl -s "${H[@]}" "$API/alertPolicies?pageSize=200" \
  | j "[print(p['name']) for p in d.get('alertPolicies',[]) if p.get('displayName','').startswith('$TAG Firestore')]" \
  | while read -r old; do curl -s "${H[@]}" -X DELETE "https://monitoring.googleapis.com/v3/$old" >/dev/null; done

mk() { # $1 libellé · $2 métrique · $3 seuil · $4 quota
  local body
  body=$(python3 - "$1" "$2" "$3" "$4" "$CH" "$TAG" <<'PY'
import json, sys
lab, metric, seuil, quota, ch, tag = sys.argv[1:]
print(json.dumps({
  "displayName": f"{tag} Firestore {lab} à 90 % du gratuit",
  "combiner": "OR",
  "conditions": [{
    "displayName": f"{lab} sur 24 h > {int(seuil):,} (gratuit : {int(quota):,}/jour)".replace(",", " "),
    "conditionPrometheusQueryLanguage": {
      "query": f"sum(increase(firestore_googleapis_com:document_{metric}[1d])) > {seuil}",
      "duration": "0s", "evaluationInterval": "300s"}}],
  "notificationChannels": [ch],
  "alertStrategy": {"autoClose": "86400s", "notificationPrompts": ["OPENED"]},
  "documentation": {"mimeType": "text/markdown", "content":
    f"Playwatch approche du quota gratuit Firestore ({lab} : {int(quota):,} par jour, remis à zéro vers 9 h, heure de Paris). "
    "Au-delà, chaque tranche de 100 000 opérations est facturée quelques centimes. "
    "Vérifier l'usage : https://console.firebase.google.com/project/bobine-4d524/firestore/usage".replace(",", " ")},
  "severity": "WARNING"}))
PY
)
  curl -s "${H[@]}" -X POST "$API/alertPolicies" -d "$body" \
    | j "print('  ✔', d['displayName']) if 'name' in d else sys.exit('  ✘ refusée : '+json.dumps(d.get('error',d))[:400])"
}
mk "lectures"     read_count   45000 50000
mk "écritures"    write_count  18000 20000
mk "suppressions" delete_count 18000 20000

echo "── 4/4 Budget de facturation ──"
BA=$(gcloud billing projects describe "$P" --format='value(billingAccountName)' | sed 's#billingAccounts/##')
[[ -n "$BA" ]] || { echo "Aucun compte de facturation lié au projet."; exit 1; }
NAME="$TAG alerte avant facturation"
for b in $(gcloud billing budgets list --billing-account="$BA" --format='value(name)' --filter="displayName='$NAME'" 2>/dev/null); do
  gcloud billing budgets delete "$b" --quiet >/dev/null
done
gcloud billing budgets create --billing-account="$BA" --display-name="$NAME" \
  --budget-amount=1 --calendar-period=month --filter-projects="projects/$P" \
  --threshold-rule=percent=0.9,basis=forecasted-spend \
  --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
  --notifications-rule-monitoring-notification-channels="$CH" \
  --disable-default-iam-recipients --format='value(displayName,amount.specifiedAmount.currencyCode)'

echo "Terminé ✔  Les alertes partiront vers $EMAIL."
