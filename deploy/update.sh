#!/usr/bin/env bash
# Deploy or update the app on the VPS (ADR 0003, #66). Run from anywhere:
#   /opt/priority-matrix/deploy/update.sh            latest main
#   /opt/priority-matrix/deploy/update.sh <commit>   a given version (roll back)
# Run it as the admin user who owns the clone; Docker commands use sudo.
# The site addresses come from deploy/.env (git-ignored; see deploy/.env.example).
# Data lives in a Docker volume, so updating or rolling back never touches it.
# It also installs the nightly backup timer (deploy/systemd, #77).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-origin/main}"
COMPOSE=(sudo docker compose -f "$REPO_DIR/deploy/compose.yaml")
ENV_FILE="$REPO_DIR/deploy/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy deploy/.env.example to deploy/.env and set your addresses."
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"
: "${SITE_ADDRESS:?set SITE_ADDRESS in deploy/.env}"

cd "$REPO_DIR"
echo "== Fetching the latest code"
git fetch --quiet origin
git checkout --quiet --detach "$TARGET"
echo "Now at: $(git log --oneline -1)"

echo "== Building and starting"
"${COMPOSE[@]}" up -d --build --remove-orphans

echo "== Checking"
sleep 5
"${COMPOSE[@]}" ps --format "{{.Service}}: {{.Status}}"
site=$(curl -s -o /dev/null -w "%{http_code}" "https://${SITE_ADDRESS}/")
api=$(curl -s -o /dev/null -w "%{http_code}" "https://${SITE_ADDRESS}/api/data")
echo "Site answers $site (expect 200); API without a key answers $api (expect 401)."
if [[ "$site" != "200" || "$api" != "401" ]]; then
  echo "Something is off. Recent server log:"
  "${COMPOSE[@]}" logs --tail 20 server
  exit 1
fi

echo "== Nightly backup timer (#77)"
# The unit files live in deploy/systemd; the path inside is adjusted to this clone.
for unit in priority-matrix-backup.service priority-matrix-backup.timer; do
  sed "s#/opt/priority-matrix#$REPO_DIR#g" "$REPO_DIR/deploy/systemd/$unit" |
    sudo tee "/etc/systemd/system/$unit" > /dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now priority-matrix-backup.timer > /dev/null 2>&1
echo "Next backup: $(systemctl list-timers priority-matrix-backup.timer --no-legend | awk '{print $1, $2, $3}')"

echo "== Removing old images"
sudo docker image prune -f >/dev/null
echo "Done."
