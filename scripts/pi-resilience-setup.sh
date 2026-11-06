#!/usr/bin/env bash
# Otpornost LunaPic Pija na pad struje, zamrzavanje i prekide Wi-Fija.
#
# Nastalo 2026-11-06: Pi u Lekeniku (Pi 2 B, USB Wi-Fi + USB SDR, 5G preko AP-a)
# bio je ~3 h offline i sam se vratio, a uzrok se nije mogao utvrditi jer
# Raspberry Pi OS drži journal samo u RAM-u (40-rpi-volatile-storage.conf).
#
# Što radi (idempotentno, može se pokretati više puta):
#   1. Trajni journal (max 64 MB na SD kartici) -> `journalctl -b -1` nakon pada.
#   2. Hardverski watchdog preko systemd-a: ako se sustav zamrzne, čip ga
#      restarta za ~14 s.
#   3. Mrežni watchdog (timer svake minute):
#        - ruter (default gateway) nedostupan 3 min  -> restart Wi-Fija
#        - ruter nedostupan 15 min                   -> reboot, najviše 1× na sat
#        - ruter dostupan, a internet ne (5G pao)    -> samo zapis u log;
#          reboot Pija tu ništa ne rješava
#   4. Gasi Wi-Fi power saving.
#   5. Preusmjerava readsb stdout u /dev/null (inače puni journal).
#
# Pokretanje (s Maca):
#   scp scripts/pi-resilience-setup.sh ico00@100.102.36.63:/tmp/
#   ssh -t ico00@100.102.36.63 'sudo bash /tmp/pi-resilience-setup.sh'
#
# Provjera poslije:
#   systemctl show -p RuntimeWatchdogUSec          # 14s
#   systemctl list-timers lunapic-net-watchdog.timer
#   journalctl -t lunapic-net-watchdog             # zapisi watchdoga
#   journalctl --list-boots                        # nakon idućeg restarta > 1 red
#
# Uklanjanje: obrisati datoteke iz popisa "Datoteke" niže i
#   systemctl disable --now lunapic-net-watchdog.timer; systemctl daemon-reexec
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Pokreni sa sudo: sudo bash $0" >&2
  exit 1
fi

say() { printf '\n▶ %s\n' "$*"; }

# --- 1. Trajni journal -------------------------------------------------------
say "Trajni journal"
mkdir -p /etc/systemd/journald.conf.d
# Ime mora biti abecedno iza 40-rpi-volatile-storage.conf da bi ga nadjačalo.
cat > /etc/systemd/journald.conf.d/99-lunapic-persistent.conf <<'EOF'
[Journal]
Storage=persistent
SystemMaxUse=64M
EOF
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal
systemctl restart systemd-journald
journalctl --flush || true
echo "  journal se sada piše u /var/log/journal (max 64 MB)"

# --- 2. Hardverski watchdog --------------------------------------------------
say "Hardverski watchdog"
if [ -e /dev/watchdog0 ] || [ -e /dev/watchdog ]; then
  mkdir -p /etc/systemd/system.conf.d
  # bcm2835-wdt podržava najviše ~15 s.
  cat > /etc/systemd/system.conf.d/99-lunapic-watchdog.conf <<'EOF'
[Manager]
RuntimeWatchdogSec=14s
RebootWatchdogSec=2min
EOF
  systemctl daemon-reexec
  echo "  $(systemctl show -p RuntimeWatchdogUSec)"
else
  echo "  /dev/watchdog ne postoji — preskačem (dodati dtparam=watchdog=on u config.txt)"
fi

# --- 3. Mrežni watchdog ------------------------------------------------------
say "Mrežni watchdog"
cat > /usr/local/bin/lunapic-net-watchdog <<'EOF'
#!/usr/bin/env bash
# Pokreće ga lunapic-net-watchdog.timer svake minute. Vidi pi-resilience-setup.sh.
set -u
TAG=lunapic-net-watchdog
STATE_DIR=/var/lib/lunapic-net-watchdog
mkdir -p "$STATE_DIR" /run/lunapic-net-watchdog
FAIL_FILE=/run/lunapic-net-watchdog/gateway-fail-min   # broji minute, briše se rebootom
LAST_REBOOT_FILE=$STATE_DIR/last-reboot-epoch          # preživi reboot

WIFI_RESTART_AFTER_MIN=3
REBOOT_AFTER_MIN=15
MIN_REBOOT_INTERVAL_SEC=3600

log() { logger -t "$TAG" "$*"; }

gw=$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')
internet_ok() {
  ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 || ping -c1 -W3 8.8.8.8 >/dev/null 2>&1
}

if internet_ok; then
  if [ -s "$FAIL_FILE" ]; then log "veza se vratila nakon $(cat "$FAIL_FILE") min"; fi
  rm -f "$FAIL_FILE" /run/lunapic-net-watchdog/internet-down-logged
  exit 0
fi

if [ -n "$gw" ] && ping -c1 -W3 "$gw" >/dev/null 2>&1; then
  # Ruter je tu, nema interneta iza njega (5G). Pi tu ne može ništa.
  if [ ! -e /run/lunapic-net-watchdog/internet-down-logged ]; then
    log "ruter $gw dostupan, internet nije — prekid na 5G strani"
    touch /run/lunapic-net-watchdog/internet-down-logged
  fi
  rm -f "$FAIL_FILE"
  exit 0
fi

n=$(( $(cat "$FAIL_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$FAIL_FILE"
log "ruter ${gw:-<nema default rute>} nedostupan već $n min"

if [ "$n" -ge "$REBOOT_AFTER_MIN" ]; then
  now=$(date +%s)
  last=$(cat "$LAST_REBOOT_FILE" 2>/dev/null || echo 0)
  if [ $(( now - last )) -ge "$MIN_REBOOT_INTERVAL_SEC" ]; then
    echo "$now" > "$LAST_REBOOT_FILE"
    log "REBOOT — ruter nedostupan $n min"
    sync
    systemctl reboot
    exit 0
  fi
fi

if [ $(( n % WIFI_RESTART_AFTER_MIN )) -eq 0 ]; then
  log "restart Wi-Fija"
  nmcli radio wifi off
  sleep 5
  nmcli radio wifi on
fi
EOF
chmod 755 /usr/local/bin/lunapic-net-watchdog

cat > /etc/systemd/system/lunapic-net-watchdog.service <<'EOF'
[Unit]
Description=LunaPic network watchdog (Wi-Fi restart / reboot)
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/lunapic-net-watchdog
EOF

cat > /etc/systemd/system/lunapic-net-watchdog.timer <<'EOF'
[Unit]
Description=LunaPic network watchdog every minute

[Timer]
OnBootSec=3min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now lunapic-net-watchdog.timer
echo "  $(systemctl list-timers lunapic-net-watchdog.timer --no-pager | sed -n 2p)"

# --- 4. Wi-Fi power saving off -----------------------------------------------
say "Wi-Fi power saving"
mkdir -p /etc/NetworkManager/conf.d
cat > /etc/NetworkManager/conf.d/99-lunapic-wifi-powersave.conf <<'EOF'
[connection]
# 2 = disable
wifi.powersave = 2
EOF
# Primijeni na aktivnu vezu bez prekida; puna primjena kod idućeg spajanja.
active=$(nmcli -t -f NAME,TYPE con show --active | awk -F: '$2 ~ /wireless/ {print $1; exit}')
if [ -n "$active" ]; then
  nmcli con modify "$active" 802-11-wireless.powersave 2
  echo "  isključeno za vezu \"$active\" (vrijedi od idućeg spajanja na Wi-Fi)"
fi

# --- 5. readsb ne smije puniti journal ----------------------------------------
# readsb bez --quiet ispisuje svaku dekodiranu poruku (~40 000 redaka/min na
# Piju 2026-11-06). S trajnim journalom to je (a) pisanje po SD kartici bez
# prestanka i (b) rotacija koja briše sve starije od par minuta — pa logovi
# padova nestanu prije nego ih stignemo pročitati. Greške idu na stderr i ostaju.
say "readsb: stdout ne ide u journal"
if systemctl cat readsb >/dev/null 2>&1; then
  mkdir -p /etc/systemd/system/readsb.service.d
  cat > /etc/systemd/system/readsb.service.d/99-lunapic-quiet.conf <<'EOF'
[Service]
StandardOutput=null
EOF
  systemctl daemon-reload
  systemctl restart readsb
  echo "  readsb restartan, stdout -> /dev/null"
else
  echo "  readsb.service ne postoji — preskačem"
fi

say "Gotovo. Datoteke:"
cat <<'EOF'
  /etc/systemd/system/readsb.service.d/99-lunapic-quiet.conf
  /etc/systemd/journald.conf.d/99-lunapic-persistent.conf
  /etc/systemd/system.conf.d/99-lunapic-watchdog.conf
  /usr/local/bin/lunapic-net-watchdog
  /etc/systemd/system/lunapic-net-watchdog.{service,timer}
  /etc/NetworkManager/conf.d/99-lunapic-wifi-powersave.conf
EOF
