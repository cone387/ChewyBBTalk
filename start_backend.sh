#!/bin/bash
# All Python entry points load the repository .env through core.environment.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-dev}"
case "$MODE" in dev|prod|test) ;; *) echo "Usage: $0 [dev|prod|test]" >&2; exit 2 ;; esac
cd "$ROOT/backend"
uv sync --frozen
uv run --no-sync python -m cli migrate
uv run --no-sync python -m cli init
if [ "$MODE" = dev ]; then
    exec uv run --no-sync python -m cli serve --reload
fi
exec uv run --no-sync python -m cli serve
