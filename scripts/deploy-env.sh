#!/usr/bin/env bash
# Read only host-side deployment controls. Never source/eval an .env file.
load_deploy_env() {
  local config_file="$1" line key value
  [[ -e "$config_file" ]] || return 0
  [[ -f "$config_file" && -r "$config_file" ]] || { printf '.env is not a readable file\n' >&2; return 1; }
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    case "$key" in
      PORT|HOST_DATA_DIR|VITE_BASE_PATH|DEPLOY_PULL_ATTEMPTS|DEPLOY_PULL_TIMEOUT|DEPLOY_HEALTH_ATTEMPTS|DEPLOY_RETRY_DELAY|DEPLOY_HEALTH_INTERVAL|BACKUP_KEEP|BACKUP_CONTAINER|BACKUP_USER_ID|BACKUP_DRY_RUN) ;;
      *) continue ;;
    esac
    [[ ! -v "$key" ]] || continue
    value="${line#*=}"
    if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$config_file"
}
