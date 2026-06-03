#!/usr/bin/env bash
# Deploya MoonTransit na cPanel Node.js server putem rsync.
# Postavi SSH_HOST, SSH_USER i SSH_PATH u .env (ili kao env varijable).
#
# Primjer .env:
#   SSH_HOST=mojserver.com
#   SSH_USER=cpanel_user
#   SSH_PATH=/home/cpanel_user/moontransit     # app dir (NE public_html)
#   SSH_PORT=22          # opcionalno, default 22
#   SSH_KEY=~/.ssh/id_rsa  # opcionalno
#   CPANEL_USERNAME=cpanel_user   # za restart putem touch tmp/restart.txt
#   NODE_VERSION=20      # za npm install na serveru, default 20

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Učitaj .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_DIR/.env"
  set +a
fi

# ── Provjera obaveznih varijabli ─────────────────────────────────────────────
if [ -z "${SSH_HOST:-}" ] || [ -z "${SSH_USER:-}" ] || [ -z "${SSH_PATH:-}" ]; then
  echo "❌ Nedostaju SSH varijable. Postavi u .env ili environment:"
  echo "   SSH_HOST=mojserver.com"
  echo "   SSH_USER=cpanel_user"
  echo "   SSH_PATH=/home/cpanel_user/moontransit"
  echo "   SSH_PORT=22          # opcionalno"
  echo "   SSH_KEY=~/.ssh/id_rsa  # opcionalno"
  echo "   NODE_VERSION=20      # opcionalno (default 20)"
  exit 1
fi

NODE_VERSION="${NODE_VERSION:-20}"

# ── SSH helper ────────────────────────────────────────────────────────────────
SSH_CMD=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
[ -n "${SSH_PORT:-}" ] && SSH_CMD+=(-p "${SSH_PORT}")
[ -n "${SSH_KEY:-}" ]  && SSH_CMD+=(-i "${SSH_KEY}")

RSYNC_RSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
[ -n "${SSH_PORT:-}" ] && RSYNC_RSH+=" -p ${SSH_PORT}"
[ -n "${SSH_KEY:-}" ]  && RSYNC_RSH+=" -i ${SSH_KEY}"

# ── 1. Build ──────────────────────────────────────────────────────────────────
# Eksplicitno čitamo NEXT_PUBLIC_MAPBOX_TOKEN iz .env (ne .env.local) jer
# .env.local sadrži dev token koji Mapbox blokira za produkcijski domain.
PROD_MAPBOX_TOKEN="$(grep -E '^NEXT_PUBLIC_MAPBOX_TOKEN=' "$PROJECT_DIR/.env" | cut -d'=' -f2-)"
if [ -z "$PROD_MAPBOX_TOKEN" ]; then
  echo "❌ NEXT_PUBLIC_MAPBOX_TOKEN nije pronađen u .env"
  exit 1
fi

echo "▶️  Build: npm run build (s produkcijskim Mapbox tokenom) …"
cd "$PROJECT_DIR"
NEXT_PUBLIC_MAPBOX_TOKEN="$PROD_MAPBOX_TOKEN" npm run build
echo "✅ Build završen."

# ── 2. rsync ─────────────────────────────────────────────────────────────────
# Šaljemo samo ono što server treba da pokrene Next.js app.
# node_modules se šalje jer cPanel okruženja često ne mogu pokrenuti npm install.
# Ako preferiraš npm install na serveru, dodaj node_modules/ u --exclude i
# odkomentiraj blok ispod koji pokreće npm install remote.
echo "▶️  rsync → ${SSH_USER}@${SSH_HOST}:${SSH_PATH} …"

RSYNC_OPTS=(
  -avz
  --delete
  -e "$RSYNC_RSH"
  # Izvorni kod i dev alati — server ih ne treba
  --exclude='src/'
  --exclude='e2e/'
  --exclude='test-results/'
  --exclude='documentation/'
  --exclude='design-mockup*.html'
  --exclude='.git/'
  --exclude='.github/'
  --exclude='.claude/'
  --exclude='*.log'
  --exclude='.DS_Store'
  --exclude='.env'
  --exclude='.env.local'
  --exclude='.env.local.example'
  --exclude='.cursorrules'
  --exclude='AGENTS.md'
  --exclude='BACKLOG.md'
  --exclude='CLAUDE.md'
  --exclude='README.md'
  --exclude='playwright.config.ts'
  --exclude='vitest.config.ts'
  --exclude='tsconfig.tsbuildinfo'
  # node_modules NE šaljemo — cPanel ih kreira kao symlink i sam ih održava.
  # Nakon prvog deploya ili promjene package.json pokreni na serveru: npm install --omit=dev
  --exclude='node_modules/'
  # Next.js build cache (ne treba na serveru)
  --exclude='.next/cache/'
  # ⚠️ KRITIČNO: runtime stanje koje server SAM generira — NIKAD ne dirati deployom.
  # Bez ovoga `rsync --delete` briše produkcijski flight-log.db i push-subscriptions.json
  # (jer ih lokalni izvor nema), pa svaki deploy obriše prikupljenu bazu letova.
  # VODEĆA KOSA: izuzmi SAMO top-level /data/ — NE `public/data/` (OpenSky index!).
  # `data/` (bez kose) bi hvatao i public/data/ i blokirao deploy indeksa.
  --exclude='/data/'
)

rsync "${RSYNC_OPTS[@]}" "$PROJECT_DIR/" "${SSH_USER}@${SSH_HOST}:${SSH_PATH}/"
echo "✅ rsync završen."

# ── 3. Restart Node.js aplikacije ────────────────────────────────────────────
# cPanel Passenger/Node prati tmp/restart.txt; touch ga tjera na restart.
echo "▶️  Restartujem Node.js aplikaciju …"
"${SSH_CMD[@]}" "${SSH_USER}@${SSH_HOST}" bash -s -- "$SSH_PATH" << 'REMOTE_RESTART'
set -eu
APP_DIR="$1"
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"
echo "   touch $APP_DIR/tmp/restart.txt → OK"
REMOTE_RESTART

echo "✅ Aplikacija restartujem."

# ── 4. Opcionalni npm install na serveru ─────────────────────────────────────
# Odkomentiraj ako ne šalješ node_modules putem rsync-a (sporije pri prvom deployu,
# ali čišće — server uvijek ima nativne binarne module za svoju arhitekturu).
#
# echo "▶️  npm install na serveru …"
# "${SSH_CMD[@]}" "${SSH_USER}@${SSH_HOST}" bash -s -- "$SSH_PATH" "$NODE_VERSION" << 'REMOTE_NPM'
# set -eu
# APP_DIR="$1"
# NODE_VER="$2"
# ACTIVATE="/home/$(whoami)/nodevenv/$APP_DIR/$NODE_VER/bin/activate"
# if [ -f "$ACTIVATE" ]; then
#   source "$ACTIVATE"
# fi
# cd "$APP_DIR"
# npm install --omit=dev --ignore-scripts
# echo "   npm install → OK"
# REMOTE_NPM
# echo "✅ npm install završen."

echo ""
echo "🚀 Deploy završen: https://${SSH_HOST}${BASE_PATH:-/LunaPic}"
