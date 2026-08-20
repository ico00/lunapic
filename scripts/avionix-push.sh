#!/usr/bin/env bash
# Šalje Avionix openAir `/flight_updates` snapshot na LunaPic server (push smjer).
#
# Isti princip kao pi-sdr-push.sh (vidi taj header), ali zaseban skript: oblik
# payloada je drugačiji ({"timestamp":..., "<icao24>":[...]} umjesto
# tar1090-ovog {"aircraft":[...]}), pa je i sanity-check drugačiji.
#
# UREĐAJ IMA overlayroot=tmpfs — `/` se resetira na SVAKI reboot na tvornički
# image. Samo `/data` je trajan mount. Zato instalacija NIJE plain
# `sudo install` nego dva koraka:
#
#   1) Trajni dio (na /data, preživi reboot):
#      ssh openair@<device-ip>
#      mkdir -p /data/avionix-push
#      scp avionix-push.sh openair@<device-ip>:/data/avionix-push/
#      # napravi env datoteku ručno na uređaju:
#      cat > /data/avionix-push/avionix-push.env <<'EOF'
#      INGEST_URL=https://tvoja-domena/LunaPic/api/avionix/ingest
#      AVIONIX_INGEST_TOKEN=<isti token kao u cPanel env varijablama>
#      EOF
#      chmod 600 /data/avionix-push/avionix-push.env
#      # ručni test prije instalacije kao servis:
#      set -a; source /data/avionix-push/avionix-push.env; set +a
#      bash /data/avionix-push/avionix-push.sh
#
#   2) Trajna instalacija systemd jedinica (traži overlayroot-chroot jer je
#      `/etc/systemd/system` na overlayu, ne na `/data`) — POTVRDI S
#      KORISNIKOM prije ovog koraka, uređaj se reboota radi provjere:
#      sudo overlayroot-chroot
#        # unutar chroota:
#        cp avionix-push.service avionix-push.timer /etc/systemd/system/
#        systemctl enable avionix-push.timer
#        exit
#      sudo reboot
#      # nakon reboota, provjeri da je timer preživio:
#      systemctl status avionix-push.timer
#      journalctl -u avionix-push.service -n 20
#
# ExecStart u avionix-push.service gleda DIREKTNO na
# /data/avionix-push/avionix-push.sh — sama skripta se ne kopira u chroot,
# samo dvije male .service/.timer datoteke.
set -euo pipefail

: "${INGEST_URL:?INGEST_URL nije postavljen}"
: "${AVIONIX_INGEST_TOKEN:?AVIONIX_INGEST_TOKEN nije postavljen}"

# Skripta radi NA uređaju — loopback poziv, nema LAN hopa ni autentikacije.
SOURCE_URL="${SOURCE_URL:-http://127.0.0.1/flight_updates}"

if ! payload=$(curl -sS -m 10 --fail-with-body "$SOURCE_URL" 2>&1); then
  echo "čitanje $SOURCE_URL nije uspjelo: $payload" >&2
  exit 1
fi

# Sanity: mora sadržavati `timestamp` polje — Avionix oblik nema `aircraft`
# ključ (to je tar1090-ova provjera, ne ova).
if ! printf '%s' "$payload" | grep -q '"timestamp"'; then
  echo "odgovor s $SOURCE_URL ne izgleda kao Avionix openAir JSON" >&2
  exit 1
fi

http_code=$(printf '%s' "$payload" | curl -sS -m 20 -o /tmp/avionix-ingest-resp \
  -w '%{http_code}' \
  -X POST "$INGEST_URL" \
  -H "Content-Type: application/json" \
  -H "x-avionix-token: ${AVIONIX_INGEST_TOKEN}" \
  --data-binary @-) || {
  echo "POST na $INGEST_URL nije uspio" >&2
  exit 1
}

if [ "$http_code" != "200" ]; then
  echo "ingest odbio snapshot: HTTP $http_code — $(cat /tmp/avionix-ingest-resp)" >&2
  exit 1
fi

exit 0
