#!/bin/bash
# Start the native FastAPI backend from any working directory.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-dev}"
case "$MODE" in dev|prod|test) ;; *) echo "Usage: $0 [dev|prod|test]" >&2; exit 2 ;; esac
if [ -f "$ROOT/.env" ]; then
    set -a
    source "$ROOT/.env"
    set +a
fi
export DATA_DIR="${DATA_DIR:-$ROOT/data/backend}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///$ROOT/data/db.sqlite3}"
export MEDIA_ROOT="${MEDIA_ROOT:-$ROOT/data/backend/media}"
mkdir -p "$ROOT/data" "$DATA_DIR" "$MEDIA_ROOT"
cd "$ROOT/backend"
uv sync --frozen
uv run --no-sync python -m chewy_api.cli migrate
uv run --no-sync python -m chewy_api.cli init
ARGS=(chewy_api.main:app --host "${BACKEND_HOST:-0.0.0.0}" --port "${BACKEND_PORT:-8020}" --no-proxy-headers)
if [ "$MODE" = dev ]; then
    ARGS+=(--reload)
else
    ARGS+=(--workers "${WEB_CONCURRENCY:-2}")
fi
exec uv run --no-sync uvicorn "${ARGS[@]}"
