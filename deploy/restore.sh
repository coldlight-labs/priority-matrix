#!/usr/bin/env bash
# Puts the app's data back from a backup made by backup.sh (step 5, #77):
#   sudo /opt/priority-matrix/deploy/restore.sh /var/backups/priority-matrix/data-<date>.tar.gz
# It checks the file first, takes a safety backup of the current data, stops the
# server, replaces /data with the backup, and starts the server again. Every change
# made since that backup is lost, so it asks before going ahead (--yes skips that).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$REPO_DIR/deploy/compose.yaml")
file="${1:-}"
confirm="${2:-}"

if [[ -z "$file" || ! -f "$file" ]]; then
  echo "Usage: sudo $0 <backup file> [--yes]"
  echo "Backups: ls -lh /var/backups/priority-matrix"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Cannot reach Docker. Run with sudo."
  exit 1
fi
# Refuse anything that is not a readable backup of this app, before touching data.
if ! tar -tzf "$file" 2>/dev/null | grep -qx './accounts.json'; then
  echo "Not a backup of this app (no accounts.json inside). Nothing changed."
  exit 1
fi

if [[ "$confirm" != "--yes" ]]; then
  echo "This replaces ALL current data with $file."
  read -r -p "Type RESTORE to continue: " answer
  if [[ "$answer" != "RESTORE" ]]; then
    echo "Cancelled. Nothing changed."
    exit 1
  fi
fi

echo "== Safety backup of the current data"
"$REPO_DIR/deploy/backup.sh"

echo "== Restoring"
"${COMPOSE[@]}" stop server
# A one-off container with the same volume, as the unprivileged node user that owns /data.
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh server \
  -c 'find /data -mindepth 1 -delete && tar xzf - -C /data' < "$file"
"${COMPOSE[@]}" start server
echo "Restored from $file. If anything looks wrong, restore the safety backup listed above."
