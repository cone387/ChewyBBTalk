#!/usr/bin/env bash
set -Eeuo pipefail

# Host-side scheduler entrypoint. The backup itself runs inside the container
# so the host does not need Python, Django, or access to the SQLite file.

KEEP="${BACKUP_KEEP:-7}"
EXPLICIT_CONTAINER="${BACKUP_CONTAINER:-}"
USER_ID="${BACKUP_USER_ID:-}"
DRY_RUN="${BACKUP_DRY_RUN:-false}"

if ! [[ "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_KEEP must be a positive integer" >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

is_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" == "true" ]]
}

CONTAINER="$EXPLICIT_CONTAINER"
if [[ -n "$CONTAINER" ]]; then
  if ! is_running "$CONTAINER"; then
    echo "backup container is not running: $CONTAINER" >&2
    exit 1
  fi
else
  for candidate in chewy-bbtalk chewybbtalk chewybbtalk-backend; do
    if is_running "$candidate"; then
      CONTAINER="$candidate"
      break
    fi
  done
fi

if [[ -z "$CONTAINER" ]]; then
  echo "no running ChewyBBTalk container found; set BACKUP_CONTAINER" >&2
  exit 1
fi

ARGS=(backup_data --keep "$KEEP")
if [[ -n "$USER_ID" ]]; then
  if ! [[ "$USER_ID" =~ ^[1-9][0-9]*$ ]]; then
    echo "BACKUP_USER_ID must be a positive integer" >&2
    exit 2
  fi
  ARGS+=(--user-id "$USER_ID")
fi
if [[ "$DRY_RUN" == "true" ]]; then
  ARGS+=(--dry-run)
fi

# Single-container image copies Django to /app/backend. Compose's backend
# image keeps the source tree at /app/chewy_space and uses uv for its venv.
if docker exec "$CONTAINER" sh -c 'test -f /app/backend/manage.py' >/dev/null 2>&1; then
  docker exec "$CONTAINER" python /app/backend/manage.py "${ARGS[@]}"
elif docker exec "$CONTAINER" sh -c 'test -f /app/chewy_space/manage.py' >/dev/null 2>&1; then
  docker exec -w /app/chewy_space "$CONTAINER" uv run python manage.py "${ARGS[@]}"
else
  echo "could not locate manage.py in container: $CONTAINER" >&2
  exit 1
fi
