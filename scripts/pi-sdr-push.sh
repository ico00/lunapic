#!/usr/bin/env bash
# Šalje tar1090 snapshot s Raspberry Pija na LunaPic server (push smjer).
#
# Zamjenjuje Tailscale Funnel: Pi više ne mora biti javno dostupan, treba mu
# samo izlazni internet. Time nestaje ovisnost o javnom DNS zapisu Funnela koji
# je titrao i rušio feed svakih par dana.
#
# Instalacija na Piju:
#   sudo install -m 755 pi-sdr-push.sh /usr/local/bin/lunapic-sdr-push
#   sudo install -m 600 /dev/null /etc/lunapic-sdr-push.env
#   sudo nano /etc/lunapic-sdr-push.env      # vidi varijable niže
#   sudo systemctl enable --now lunapic-sdr-push.timer
#
# /etc/lunapic-sdr-push.env:
#   INGEST_URL=https://tvoja-domena/LunaPic/api/localsdr/ingest
#   SDR_INGEST_TOKEN=<isti token kao u cPanel env varijablama>
#
# Izvor podataka — jedno od (prvo pronađeno pobjeđuje):
#   SOURCE_FILE=/run/readsb/aircraft.json    # preferirano: bez HTTP-a i bez auth
#   SOURCE_URL=http://user:pass@127.0.0.1/tar1090/data/aircraft.json
# Ako nije zadano ništa, traže se uobičajene putanje readsb/dump1090.
set -euo pipefail

: "${INGEST_URL:?INGEST_URL nije postavljen}"
: "${SDR_INGEST_TOKEN:?SDR_INGEST_TOKEN nije postavljen}"

# Uobičajene lokacije na koje readsb/dump1090 pišu aircraft.json.
DEFAULT_FILES=(
  /run/readsb/aircraft.json
  /run/dump1090-fa/aircraft.json
  /run/dump1090/aircraft.json
  /var/run/dump1090-fa/aircraft.json
)

read_payload() {
  # 1) Eksplicitna datoteka
  if [ -n "${SOURCE_FILE:-}" ]; then
    [ -r "$SOURCE_FILE" ] || { echo "SOURCE_FILE nije čitljiv: $SOURCE_FILE" >&2; return 1; }
    cat "$SOURCE_FILE"
    return 0
  fi
  # 2) Eksplicitni URL (nginx auth ide kroz user:pass@ u URL-u)
  if [ -n "${SOURCE_URL:-}" ]; then
    curl -sS -m 10 --fail-with-body "$SOURCE_URL"
    return $?
  fi
  # 3) Autodetekcija lokalne datoteke — nema HTTP-a, nema lozinke
  for f in "${DEFAULT_FILES[@]}"; do
    if [ -r "$f" ]; then
      cat "$f"
      return 0
    fi
  done
  echo "ne mogu naći aircraft.json — postavi SOURCE_FILE ili SOURCE_URL u /etc/lunapic-sdr-push.env" >&2
  echo "  tražio sam: ${DEFAULT_FILES[*]}" >&2
  return 1
}

if ! payload=$(read_payload 2>&1); then
  echo "čitanje lokalnog ADS-B izvora nije uspjelo: $payload" >&2
  exit 1
fi

# Sanity: mora sadržavati `aircraft` polje — inače ne šalji smeće serveru.
if ! printf '%s' "$payload" | grep -q '"aircraft"'; then
  echo "odgovor s $SOURCE_URL ne izgleda kao tar1090 JSON" >&2
  exit 1
fi

http_code=$(printf '%s' "$payload" | curl -sS -m 20 -o /tmp/lunapic-ingest-resp \
  -w '%{http_code}' \
  -X POST "$INGEST_URL" \
  -H "Content-Type: application/json" \
  -H "x-sdr-token: ${SDR_INGEST_TOKEN}" \
  --data-binary @-) || {
  echo "POST na $INGEST_URL nije uspio" >&2
  exit 1
}

if [ "$http_code" != "200" ]; then
  echo "ingest odbio snapshot: HTTP $http_code — $(cat /tmp/lunapic-ingest-resp)" >&2
  exit 1
fi

exit 0
