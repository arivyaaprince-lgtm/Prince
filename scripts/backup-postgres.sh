#!/bin/sh
set -eu

# Run from the repository root. Backups stay local and are never uploaded.
backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$backup_dir/monarch-${timestamp}.dump"

if ! docker compose ps --status running --services | grep -qx db; then
  echo "Database container is not running. Start it with: docker compose up -d db" >&2
  exit 1
fi

umask 077
if docker compose exec -T db pg_dump -U monarch -d monarch --format=custom > "$output"; then
  if [ -s "$output" ]; then
    echo "Backup created: $output"
    echo "Store a copy somewhere separate from this machine before relying on it."
  else
    rm -f "$output"
    echo "Backup file is empty; removed it." >&2
    exit 1
  fi
else
  rm -f "$output"
  echo "Backup failed; partial file removed." >&2
  exit 1
fi
