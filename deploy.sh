#!/usr/bin/env bash
# Pull-based deploy: fetch the latest image from GHCR and restart only if it changed.
# Run by a cron entry on the server every 2 minutes; safe to run by hand.
set -euo pipefail
cd "$(dirname "$0")"

before=$(docker image inspect ghcr.io/mikkaiser/mahmoud-schedule:latest --format '{{.Id}}' 2>/dev/null || true)
docker compose -f docker-compose.prod.yml pull -q
after=$(docker image inspect ghcr.io/mikkaiser/mahmoud-schedule:latest --format '{{.Id}}')

if [[ "$before" != "$after" ]] || ! docker ps --format '{{.Names}}' | grep -qx mahmoud-schedule-web; then
  docker compose -f docker-compose.prod.yml up -d
  docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/Mikkaiser/mahmoud-schedule" >/dev/null
  echo "$(date -Is) deployed $after"
fi
