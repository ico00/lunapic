#!/usr/bin/env bash
# LunaPic Pi — dijagnostika i oporavak veze. Pokreće ga lunapic-net-watchdog.timer
# svakih 15 s (root). Instalira ga pi-resilience-setup.sh u
# /usr/local/bin/lunapic-net-watchdog.
#
# Svaki tick odredi JEDAN uzrok, od najniže razine prema višoj, prvi koji ne radi:
#   wifi      wlan0 nije spojen na AP ili nema default rute
#   gateway   AP/ruter ne odgovara na ping
#   internet  ruter radi, 1.1.1.1 i 8.8.8.8 ne odgovaraju (5G strana)
#   dns       internet radi, drusany.com se ne razrješava
#   server    mreža radi, a slanje snimka nije uspjelo zadnjih 30 s
#   receiver  slanje radi, ali readsb ne obnavlja aircraft.json (dongle/readsb)
#   ok
# Uz to, nakon pokretanja Pija: ako je od zadnjeg otkucaja prošlo > 60 s, Pi je
# bio ugašen (uzrok "pi-down": nestanak struje/zamrzavanje, ili uredno gašenje).
#
# Prekid = neprekinut niz tickova koji nisu "ok". Kad završi, zapisuje se u
# /var/lib/lunapic-net-watchdog/pending.jsonl i šalje serveru
# (POST <INGEST_URL bez /ingest>/diag, isti token) čim veza proradi; uz to se
# svakih 60 s šalje trenutno stanje Pija. Server to prikazuje u aplikaciji.
#
# Oporavak (samo za wifi/gateway, jedino što Pi sam može popraviti):
#   3 min  -> restart Wi-Fija (pa svake 3 min)
#   15 min -> reboot, najviše 1× na sat
set -u

TAG=lunapic-net-watchdog
STATE=${LUNAPIC_WD_STATE:-/var/lib/lunapic-net-watchdog}   # preživi reboot
RUN=${LUNAPIC_WD_RUN:-/run/lunapic-net-watchdog}           # briše se rebootom
PUSH_RUN=${LUNAPIC_WD_PUSH_RUN:-/run/lunapic-sdr-push}     # piše ga lunapic-sdr-push
ENV_FILE=${LUNAPIC_WD_ENV:-/etc/lunapic-sdr-push.env}
READSB_JSON=${READSB_JSON:-/run/readsb/aircraft.json}
SERVER_HOST=drusany.com

BOOT_GAP_SEC=60
PUSH_STALE_SEC=30
READSB_STALE_SEC=30
WIFI_RESTART_EVERY_SEC=180
REBOOT_AFTER_SEC=900
MIN_REBOOT_INTERVAL_SEC=3600
STATUS_EVERY_SEC=60
MAX_PENDING=500

mkdir -p "$STATE" "$RUN"
log() { logger -t "$TAG" "$*"; }
now=$(date +%s)
uptime_sec=$(awk '{print int($1)}' /proc/uptime)

wifi_dev=$(nmcli -t -f DEVICE,TYPE dev 2>/dev/null | awk -F: '$2=="wifi"{print $1; exit}')
wifi_dev=${wifi_dev:-wlan0}
signal_pct=$(nmcli -t -f IN-USE,SIGNAL dev wifi list --rescan no 2>/dev/null | awk -F: '$1=="*"{print $2; exit}')
signal_json=${signal_pct:-null}

file_mtime() { stat -c %Y "$1" 2>/dev/null || echo 0; }

append_pending() {
  printf '%s\n' "$1" >> "$STATE/pending.jsonl"
  tail -n "$MAX_PENDING" "$STATE/pending.jsonl" > "$STATE/pending.tmp" && mv "$STATE/pending.tmp" "$STATE/pending.jsonl"
}

# --- 1. Je li Pi bio ugašen? (jednom po bootu, tek kad je sat sinkroniziran) ---
if [ ! -e "$RUN/boot-checked" ] && [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = "yes" ]; then
  touch "$RUN/boot-checked"
  boot_at=$(( now - uptime_sec ))
  last_alive=$(cat "$STATE/heartbeat" 2>/dev/null || echo 0)

  # Prekid koji je trajao u trenutku gašenja zatvara se zadnjim otkucajem.
  if [ -s "$STATE/current.json" ] && [ "$last_alive" -gt 0 ]; then
    append_pending "$(jq -c --argjson end "$last_alive" '. + {end: $end, interruptedByBoot: true}' "$STATE/current.json")"
    rm -f "$STATE/current.json"
  fi

  if [ "$last_alive" -gt 0 ] && [ $(( boot_at - last_alive )) -gt "$BOOT_GAP_SEC" ]; then
    if [ -s "$STATE/reboot-reason" ]; then
      detail="watchdog reboot: $(cat "$STATE/reboot-reason")"
    elif [ -z "$(journalctl -b -1 -n 1 -q -o cat 2>/dev/null)" ]; then
      detail="unknown (no log of the previous boot)"
    elif journalctl -b -1 -o cat -n 50 2>/dev/null | grep -qiE "Reached target .*(Power-Off|Reboot|Halt)|System is (rebooting|powering down)"; then
      detail="clean shutdown or reboot"
    else
      detail="power loss or freeze (no clean shutdown in the log)"
    fi
    append_pending "$(jq -cn --argjson s "$last_alive" --argjson e "$boot_at" --arg d "$detail" \
      '{start: $s, end: $e, cause: "pi-down", detail: $d, ticks: {"pi-down": 1}}')"
    log "Pi je bio ugašen $(( (boot_at - last_alive) / 60 )) min: $detail"
  fi
  rm -f "$STATE/reboot-reason"
fi
# Otkucaj tek uz sinkroniziran sat: prije sinkronizacije Pi bez RTC-a vrti staro vrijeme.
[ -e "$RUN/boot-checked" ] && echo "$now" > "$STATE/heartbeat"

# --- 2. Uzrok ovog ticka ------------------------------------------------------
detail=""
classify() {
  local state gw
  state=$(nmcli -t -f DEVICE,STATE dev 2>/dev/null | awk -F: -v d="$wifi_dev" '$1==d{print $2; exit}')
  gw=$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')
  if [ "$state" != "connected" ] || [ -z "$gw" ]; then
    detail="$wifi_dev ${state:-missing}"; cause=wifi; return
  fi
  if ! ping -c1 -W2 "$gw" >/dev/null 2>&1 && ! ping -c1 -W2 "$gw" >/dev/null 2>&1; then
    detail="gateway $gw"; cause=gateway; return
  fi
  if ! ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 && ! ping -c1 -W3 8.8.8.8 >/dev/null 2>&1; then
    cause=internet; return
  fi
  if ! getent hosts "$SERVER_HOST" >/dev/null 2>&1; then
    cause=dns; return
  fi
  local last_ok
  last_ok=$(file_mtime "$PUSH_RUN/last-ok")
  if [ "$uptime_sec" -gt 90 ] && [ $(( now - last_ok )) -gt "$PUSH_STALE_SEC" ]; then
    detail=$(cut -d' ' -f2- "$PUSH_RUN/last-error" 2>/dev/null | head -c 200)
    cause=server; return
  fi
  local readsb_now
  readsb_now=$(jq -r '.now // 0 | floor' "$READSB_JSON" 2>/dev/null || echo 0)
  if [ "$uptime_sec" -gt 90 ] && [ $(( now - readsb_now )) -gt "$READSB_STALE_SEC" ]; then
    detail="aircraft.json $(( now - readsb_now )) s old"; cause=receiver; return
  fi
  cause=ok
}
cause=""
classify

# --- 3. Praćenje prekida -----------------------------------------------------
if [ "$cause" != "ok" ]; then
  if [ -s "$STATE/current.json" ]; then
    jq -c --arg c "$cause" --arg d "$detail" --argjson sig "$signal_json" '
      .ticks[$c] = ((.ticks[$c] // 0) + 1)
      | (if $d != "" then .detail = $d else . end)
      | (if $sig != null and (.minSignal == null or $sig < .minSignal) then .minSignal = $sig else . end)
    ' "$STATE/current.json" > "$STATE/current.tmp" && mv "$STATE/current.tmp" "$STATE/current.json"
  else
    jq -cn --argjson s "$now" --arg c "$cause" --arg d "$detail" --argjson sig "$signal_json" \
      '{start: $s, cause: $c, detail: (if $d == "" then null else $d end), minSignal: $sig, ticks: {($c): 1}}' \
      > "$STATE/current.json"
    log "prekid počeo: $cause${detail:+ ($detail)}${signal_pct:+, signal $signal_pct %}"
  fi
elif [ -s "$STATE/current.json" ]; then
  # Uzrok prekida = najčešći uzrok među tickovima.
  outage=$(jq -c --argjson e "$now" '
    . + {end: $e, cause: (.ticks | to_entries | max_by(.value) | .key)}
  ' "$STATE/current.json")
  append_pending "$outage"
  rm -f "$STATE/current.json"
  log "prekid završio: $(jq -r '"\(.cause), \(.end - .start) s, ticks \(.ticks | tojson)"' <<<"$outage")"
fi

# --- 4. Oporavak Wi-Fija / reboot --------------------------------------------
if [ "$cause" = "wifi" ] || [ "$cause" = "gateway" ]; then
  [ -s "$RUN/link-down-since" ] || echo "$now" > "$RUN/link-down-since"
  down_for=$(( now - $(cat "$RUN/link-down-since") ))
  last_reboot=$(cat "$STATE/last-reboot-epoch" 2>/dev/null || echo 0)
  if [ "$down_for" -ge "$REBOOT_AFTER_SEC" ] && [ $(( now - last_reboot )) -ge "$MIN_REBOOT_INTERVAL_SEC" ]; then
    echo "$now" > "$STATE/last-reboot-epoch"
    echo "$cause for $(( down_for / 60 )) min" > "$STATE/reboot-reason"
    log "REBOOT — $cause već $(( down_for / 60 )) min"
    sync
    systemctl reboot
    exit 0
  fi
  last_restart=$(cat "$RUN/last-wifi-restart" 2>/dev/null || echo 0)
  if [ "$down_for" -ge "$WIFI_RESTART_EVERY_SEC" ] && [ $(( now - last_restart )) -ge "$WIFI_RESTART_EVERY_SEC" ]; then
    echo "$now" > "$RUN/last-wifi-restart"
    log "restart Wi-Fija ($cause već $(( down_for / 60 )) min)"
    nmcli radio wifi off
    sleep 5
    nmcli radio wifi on
  fi
else
  rm -f "$RUN/link-down-since"
fi

# --- 5. Izvještaj serveru ----------------------------------------------------
case "$cause" in ok|server|receiver) ;; *) exit 0 ;; esac
last_sent=$(cat "$RUN/last-status-sent" 2>/dev/null || echo 0)
if [ ! -s "$STATE/pending.jsonl" ] && [ $(( now - last_sent )) -lt "$STATUS_EVERY_SEC" ]; then
  exit 0
fi
[ -r "$ENV_FILE" ] || exit 0
# shellcheck source=/dev/null
. "$ENV_FILE"
[ -n "${INGEST_URL:-}" ] && [ -n "${SDR_INGEST_TOKEN:-}" ] || exit 0
diag_url="${INGEST_URL%/ingest}/diag"

throttled=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)
readsb_now=$(jq -r '.now // 0 | floor' "$READSB_JSON" 2>/dev/null || echo 0)
aircraft=$(jq -r '.aircraft | length' "$READSB_JSON" 2>/dev/null || echo null)
push_ok=$(file_mtime "$PUSH_RUN/last-ok")
push_err=$(cut -d' ' -f2- "$PUSH_RUN/last-error" 2>/dev/null | head -c 200)
push_err_at=$(cut -d' ' -f1 "$PUSH_RUN/last-error" 2>/dev/null)
load1=$(cut -d' ' -f1 /proc/loadavg)
cp "$STATE/pending.jsonl" "$RUN/sending.jsonl" 2>/dev/null || : > "$RUN/sending.jsonl"
sent_lines=$(wc -l < "$RUN/sending.jsonl")

body=$(jq -cn \
  --argjson at "$now" --argjson up "$uptime_sec" --argjson sig "$signal_json" \
  --arg thr "${throttled:-}" --arg load "$load1" --arg state "$cause" --arg detail "$detail" \
  --argjson rnow "$readsb_now" --argjson ac "${aircraft:-null}" \
  --argjson pok "$push_ok" --arg perr "$push_err" --arg perrat "${push_err_at:-}" \
  --slurpfile outages "$RUN/sending.jsonl" '
  {
    status: {
      at: $at, uptimeSec: $up, signalPct: $sig, throttled: $thr,
      load1: ($load | tonumber? // null), state: $state,
      detail: (if $detail == "" then null else $detail end),
      readsbAgeSec: (if $rnow > 0 then ([0, $at - $rnow] | max) else null end), aircraft: $ac,
      pushLastOkAgeSec: (if $pok > 0 then $at - $pok else null end),
      pushLastError: (if $perr == "" then null else $perr end),
      pushLastErrorAt: ($perrat | tonumber? // null)
    },
    outages: $outages
  }')

code=$(printf '%s' "$body" | curl -sS -m 10 -o /dev/null -w '%{http_code}' -X POST "$diag_url" \
  -H "Content-Type: application/json" -H "x-sdr-token: ${SDR_INGEST_TOKEN}" --data-binary @- 2>/dev/null) || code=000
if [ "$code" = "200" ]; then
  echo "$now" > "$RUN/last-status-sent"
  # Ukloni samo poslane retke — novi su mogli stići u međuvremenu.
  if [ "$sent_lines" -gt 0 ]; then
    tail -n +"$(( sent_lines + 1 ))" "$STATE/pending.jsonl" > "$STATE/pending.tmp" && mv "$STATE/pending.tmp" "$STATE/pending.jsonl"
  fi
elif [ ! -e "$RUN/diag-fail-logged" ]; then
  log "izvještaj serveru nije prihvaćen: HTTP $code ($diag_url)"
  touch "$RUN/diag-fail-logged"
fi
