#!/usr/bin/env bash
# Pokreće `build-flight-log-index.mjs` na produkcijskom cPanel serveru, nad
# živom bazom, DOK APLIKACIJA RADI.
#
# Zašto prije deploya, a ne poslije: `migrate()` gradi isti indeks pri startu
# `server.js`-a, ali tamo blokira glavnu dretvu prije `server.listen()` — na
# 243 MB bazi aplikacija u tom prozoru ne sluša na portu. Izgradiš li indeks
# ovime unaprijed, restart nakon deploya zatekne gotov indeks i `CREATE INDEX
# IF NOT EXISTS` prođe u ~1 ms.
#
# Redoslijed:
#   1. bash scripts/build-flight-log-index-remote.sh --dry-run   # provjeri
#   2. bash scripts/build-flight-log-index-remote.sh             # izgradi
#   3. bash scripts/deploy-server.sh                             # tek onda
#
# Koristi iste SSH varijable iz .env kao deploy-server.sh (SSH_HOST, SSH_USER,
# SSH_PATH, opcionalno SSH_PORT / SSH_KEY / NODE_VERSION).
#
# Ne dira nijedan redak podataka: samo CREATE INDEX (+ DROP suvišnog indeksa).
# Prekid je siguran — SQLite CREATE INDEX je transakcijski, pa nedovršena
# izgradnja ostavlja bazu bez novog indeksa, a ne u pola posla.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_MJS="$PROJECT_DIR/scripts/build-flight-log-index.mjs"
# Namjerno /tmp, a ne app dir: ovo se vrti PRIJE deploya, pa datoteka ne bi
# bila u rsync izvoru i sljedeći `rsync --delete` bi je svejedno pomeo.
REMOTE_MJS="/tmp/lunapic-build-flight-log-index.mjs"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_DIR/.env"
  set +a
fi

if [ -z "${SSH_HOST:-}" ] || [ -z "${SSH_USER:-}" ] || [ -z "${SSH_PATH:-}" ]; then
  echo "❌ Nedostaju SSH_HOST / SSH_USER / SSH_PATH (.env ili environment)."
  exit 1
fi
NODE_VERSION="${NODE_VERSION:-20}"

SSH_CMD=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
[ -n "${SSH_PORT:-}" ] && SSH_CMD+=(-p "${SSH_PORT}")
[ -n "${SSH_KEY:-}" ]  && SSH_CMD+=(-i "${SSH_KEY}")

echo "▶️  šaljem skriptu na ${SSH_USER}@${SSH_HOST}:${REMOTE_MJS} …"
"${SSH_CMD[@]}" "${SSH_USER}@${SSH_HOST}" "cat > '$REMOTE_MJS'" < "$LOCAL_MJS"

echo "▶️  pokrećem u ${SSH_PATH} $* …"
echo ""
"${SSH_CMD[@]}" "${SSH_USER}@${SSH_HOST}" \
  bash -s -- "$SSH_PATH" "$NODE_VERSION" "$REMOTE_MJS" "$@" <<'REMOTE'
set -eu
APP_DIR="$1"; NODE_VER="$2"; MJS="$3"; shift 3

# `node` nije u PATH-u na cPanel SSH shellu — živi u nodevenv-u aplikacije.
# `node_modules` u app diru je symlink na isti nodevenv, pa je i
# node-sqlite3-wasm dostupan tek nakon aktivacije.
ACTIVATE="/home/$(whoami)/nodevenv/$(basename "$APP_DIR")/${NODE_VER}/bin/activate"
if [ ! -f "$ACTIVATE" ]; then
  echo "❌ nodevenv nije nađen: $ACTIVATE"
  echo "   Kandidati:"
  ls -d /home/"$(whoami)"/nodevenv/*/*/bin/activate 2>/dev/null || echo "   (nema nijednog)"
  exit 1
fi
# `set +u` oko source-a: cPanel-ov activate čita CL_VIRTUAL_ENV prije nego ga
# postavi, pa pod `set -u` puca s "unbound variable".
set +u
# shellcheck source=/dev/null
source "$ACTIVATE"
set -u

# cwd mora biti app dir — skripta traži `data/flight-log.db` relativno na njega,
# a `require("node-sqlite3-wasm")` se razrješava preko tamošnjeg symlinka.
cd "$APP_DIR"
echo "node $(node -v) · $(pwd)"
echo ""
# `|| STATUS=$?`, ne `STATUS=$?` u zasebnoj liniji: uz `set -e` neuspjeh
# node-a bi prekinuo skriptu prije nego stignemo pospremiti za sobom.
STATUS=0
node "$MJS" "$@" || STATUS=$?
rm -f "$MJS"
exit "$STATUS"
REMOTE

echo ""
echo "✅ Gotovo. Sljedeći korak: bash scripts/deploy-server.sh"
