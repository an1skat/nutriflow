#!/bin/sh
set -eu

: "${HEALTH_URL:?HEALTH_URL is required}"
: "${READY_URL:?READY_URL is required}"
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

RESPONSE_FILE="$(
    mktemp "${TMPDIR:-/tmp}/nutriflow-monitor.XXXXXX"
)" || fail "Cannot create a temporary file for NutriFlow HTTP checks"
trap 'rm -f "$RESPONSE_FILE"' EXIT HUP INT TERM

check_endpoint() {
    CHECK_NAME="$1"
    CHECK_URL="$2"

    if ! HTTP_STATUS="$(
        curl -sS --max-time "$HTTP_TIMEOUT_SECONDS" \
            --output "$RESPONSE_FILE" \
            --write-out "%{http_code}" \
            "$CHECK_URL"
    )"; then
        fail "NutriFlow $CHECK_NAME endpoint is unavailable"
    fi

    case "$HTTP_STATUS" in
        2??) ;;
        *) fail "NutriFlow $CHECK_NAME endpoint returned HTTP $HTTP_STATUS" ;;
    esac

    if ! grep -Fq '"status":"ok"' "$RESPONSE_FILE"; then
        fail "NutriFlow $CHECK_NAME endpoint returned an unexpected response"
    fi
}

check_endpoint "liveness" "$HEALTH_URL"
check_endpoint "readiness" "$READY_URL"

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

if ! curl -fsS --max-time "$HTTP_TIMEOUT_SECONDS" "$HEARTBEAT_URL" >/dev/null; then
    fail "Cannot send the successful NutriFlow host heartbeat"
fi

echo "Liveness, readiness, and disk checks passed: used=${USED_PERCENT}% free_kb=$FREE_KB"
