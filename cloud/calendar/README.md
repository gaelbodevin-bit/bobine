# Calendrier abonnable Playwatch

Fonction HTTP (Cloud Run functions, 2e génération) qui sert `calendar/<lien secret>.ics`.

Déploiement depuis Cloud Shell (projet bobine-4d524) :

```sh
git clone --depth 1 https://github.com/gaelbodevin-bit/bobine && cd bobine/cloud/calendar
gcloud functions deploy calendar --gen2 --project=bobine-4d524 --region=europe-west1 \
  --runtime=nodejs22 --source=. --entry-point=calendar --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=120s --max-instances=3 --set-env-vars=TMDB_KEY=<clé TMDB de js/config.js>
```
