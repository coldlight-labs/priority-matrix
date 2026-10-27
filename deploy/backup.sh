#!/usr/bin/env bash
# Backs up the app's data folder (step 5, #77). Run nightly by the systemd timer that
# update.sh installs, or by hand: sudo /opt/priority-matrix/deploy/backup.sh
# The running server streams /data as one compressed file; the app keeps working.
# Files go to /var/backups/priority-matrix (root only) and are kept 30 days. The
# provider's weekly whole-VPS backups cover losing the VPS itself.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/priority-matrix}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE=(docker compose -f "$REPO_DIR/deploy/compose.yaml")

if ! docker info >/dev/null 2>&1; then
  echo "Cannot reach Docker. Run with sudo."
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
name="data-$(date -u +%Y-%m-%dT%H%M%SZ).tar.gz"
partial="$BACKUP_DIR/.$name.partial"
trap 'rm -f "$partial"' EXIT

"${COMPOSE[@]}" exec -T server tar czf - -C /data . > "$partial"
# A file that does not list cleanly is not a backup: keep the old ones and fail loudly.
tar -tzf "$partial" > /dev/null
mv "$partial" "$BACKUP_DIR/$name"

find "$BACKUP_DIR" -maxdepth 1 -name 'data-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
count=$(find "$BACKUP_DIR" -maxdepth 1 -name 'data-*.tar.gz' | wc -l | tr -d ' ')
echo "Backed up to $BACKUP_DIR/$name ($(du -h "$BACKUP_DIR/$name" | cut -f1)); $count backups kept."
