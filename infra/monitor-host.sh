#!/bin/sh
set -eu

: "${HEALTH_URL:?HEALTH_URL is required}"
: "${HEARTBEAT_URL:?HEARTBEAT_URL is required}"

DISK_PATH="${DISK_PATH:-/}"
MAX_USED_PERCENT="${MAX_USED_PERCENT:-85}"
MIN_FREE_KB="${MIN_FREE_KB:-5242880}"
HTTP_TIMEOUT_SECONDS="${HTTP_TIMEOUT_SECONDS:-10}"
HEARTBEAT_URL="${HEARTBEAT_URL%/}"

fail() {
    MESSAGE="$1"
    curl -fsS --max-time "$HTTP_TIMEOUT_SECONDS" \
        --data "$MESSAGE" "$HEARTBEAT_URL/fail" >/dev/null 2>&1 || true
    echo "$MESSAGE" >&2
    exit 1
}

if ! HEALTH_RESPONSE="$(
    curl -fsS --max-time "$HTTP_TIMEOUT_SECONDS" "$HEALTH_URL"
)"; then
    fail "NutriFlow health endpoint is unavailable: $HEALTH_URL"
fi

case "$HEALTH_RESPONSE" in
    *'"status":"ok"'*) ;;
    *) fail "NutriFlow health endpoint returned an unexpected response" ;;
esac

DISK_STATS="$(
    df -Pk "$DISK_PATH" 2>/dev/null |
        awk 'NR == 2 {gsub(/%/, "", $5); print $5 " " $4}'
)"

if [ -z "$DISK_STATS" ]; then
    fail "Cannot read disk usage for $DISK_PATH"
fi

USED_PERCENT="${DISK_STATS%% *}"
FREE_KB="${DISK_STATS##* }"

case "$USED_PERCENT:$FREE_KB" in
    *[!0-9:]*) fail "Invalid disk usage values for $DISK_PATH" ;;
esac

if [ "$USED_PERCENT" -ge "$MAX_USED_PERCENT" ] || [ "$FREE_KB" -le "$MIN_FREE_KB" ]; then
    fail "Disk alert: path=$DISK_PATH used=${USED_PERCENT}% free_kb=$FREE_KB"
fi

curl -fsS --max-time "$HTTP_TIMEOUT_SECONDS" "$HEARTBEAT_URL" >/dev/null
echo "Health and disk checks passed: used=${USED_PERCENT}% free_kb=$FREE_KB"
