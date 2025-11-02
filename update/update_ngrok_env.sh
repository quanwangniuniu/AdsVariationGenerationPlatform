#!/bin/sh
# shellcheck shell=sh
set -eu

log() {
  printf '[Updater] %s\n' "$1"
}

mask_tail() {
  value=$1
  if [ -z "$value" ]; then
    printf 'unset'
    return
  fi
  if [ "${#value}" -le 4 ]; then
    printf '%s' "$value"
    return
  fi
  tail=${value#${value%????}}
  if [ -z "$tail" ]; then
    tail=$value
  fi
  printf '***%s' "$tail"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing dependency: $1"
    exit 1
  fi
}

ENV_FILE=${ENV_FILE:-/app/.env}
NGROK_API_URL=${NGROK_API_URL:-http://ngrok:4040}
STRIPE_API_BASE=${STRIPE_API_BASE:-https://api.stripe.com}
POLL_INTERVAL=${POLL_INTERVAL:-2}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-60}

require_cmd curl
require_cmd jq

touch "$ENV_FILE"

update_env_var() {
  key=$1
  value=$2
  tmp=$(mktemp)
  grep -v "^${key}=" "$ENV_FILE" 2>/dev/null >"$tmp" || true
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  # Windows-safe: use cat > instead of mv for bind-mounted files
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

read_env() {
  key=$1
  if [ ! -f "$ENV_FILE" ]; then
    return 1
  fi
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- | tr -d '\r' || true
}

wait_for_ngrok() {
  attempt=0
  while [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
    response=$(curl -sf "$NGROK_API_URL/api/tunnels" 2>/dev/null || true)
    if [ -n "$response" ]; then
      url=$(printf '%s' "$response" | jq -r '.tunnels[] | select(.proto=="https") | .public_url' | head -n1)
      if [ -n "$url" ] && [ "$url" != "null" ]; then
        printf '%s' "$url"
        return
      fi
    fi
    attempt=$((attempt + 1))
    sleep "$POLL_INTERVAL"
  done
  return 1
}

stripe_request() {
  method=$1
  shift
  tmp_body=$(mktemp)
  tmp_status=$(mktemp)
  if ! curl -sS -o "$tmp_body" -w '%{http_code}' -u "${STRIPE_SECRET_KEY}:" -X "$method" "$@" >"$tmp_status" 2>&1; then
    http_code=000
    body=''
  else
    http_code=$(cat "$tmp_status")
    body=$(cat "$tmp_body")
  fi
  rm -f "$tmp_body" "$tmp_status"
  printf '%s\n%s' "$http_code" "$body"
}

ensure_webhook() {
  endpoint_id=$(read_env STRIPE_WEBHOOK_ENDPOINT_ID || true)

  set -- -d "url=${WEBHOOK_URL}"
  for event in checkout.session.completed invoice.paid invoice.payment_failed invoice.payment_succeeded; do
    set -- "$@" -d "enabled_events[]=$event"
  done

  if [ -n "$endpoint_id" ]; then
    response=$(stripe_request POST "$STRIPE_API_BASE/v1/webhook_endpoints/${endpoint_id}" "$@")
    http_code=$(printf '%s' "$response" | head -n1)
    body=$(printf '%s' "$response" | sed '1d')
    if [ "$http_code" = 200 ] || [ "$http_code" = 201 ]; then
      log "Updated Stripe webhook endpoint $(mask_tail "$endpoint_id")"
      secret=$(printf '%s' "$body" | jq -r '.secret // empty')
      if [ -n "$secret" ] && [ "$secret" != "null" ]; then
        update_env_var STRIPE_WEBHOOK_SECRET "$secret"
        log "Refreshed webhook secret ending $(mask_tail "$secret")"
      fi
      update_env_var STRIPE_WEBHOOK_ENDPOINT_ID "$endpoint_id"
      return 0
    fi
    error=$(printf '%s' "$body" | jq -r '.error.message // empty')
    log "Failed to update webhook endpoint $(mask_tail "$endpoint_id"): ${error:-HTTP $http_code}"
    endpoint_id=""
  fi

  response=$(stripe_request POST "$STRIPE_API_BASE/v1/webhook_endpoints" "$@")
  http_code=$(printf '%s' "$response" | head -n1)
  body=$(printf '%s' "$response" | sed '1d')
  if [ "$http_code" = 200 ] || [ "$http_code" = 201 ]; then
    endpoint_id=$(printf '%s' "$body" | jq -r '.id // empty')
    secret=$(printf '%s' "$body" | jq -r '.secret // empty')
    if [ -n "$endpoint_id" ]; then
      update_env_var STRIPE_WEBHOOK_ENDPOINT_ID "$endpoint_id"
      log "Created Stripe webhook endpoint $(mask_tail "$endpoint_id")"
    fi
    if [ -n "$secret" ]; then
      update_env_var STRIPE_WEBHOOK_SECRET "$secret"
      log "Stored webhook secret ending $(mask_tail "$secret")"
    fi
    return 0
  fi

  error=$(printf '%s' "$body" | jq -r '.error.message // empty')
  log "Failed to create Stripe webhook endpoint: ${error:-HTTP $http_code}"
  return 1
}

NGROK_URL=$(wait_for_ngrok || true)
if [ -z "$NGROK_URL" ]; then
  log "Unable to obtain ngrok tunnel after ${MAX_ATTEMPTS} attempts."
  exit 1
fi

NGROK_URL=${NGROK_URL%/}
WEBHOOK_URL="${NGROK_URL}/api/billing/webhook/stripe/"
SUCCESS_URL="${NGROK_URL}/billing/success"
CANCEL_URL="${NGROK_URL}/billing/cancel"

update_env_var BILLING_PUBLIC_BASE_URL "$NGROK_URL"
update_env_var WEBHOOK_PUBLIC_URL "$WEBHOOK_URL"
update_env_var STRIPE_WEBHOOK_URL "$WEBHOOK_URL"
update_env_var STRIPE_SUCCESS_URL "$SUCCESS_URL"
update_env_var STRIPE_CANCEL_URL "$CANCEL_URL"
update_env_var NEXT_PUBLIC_API_BASE "$NGROK_URL"
update_env_var NEXT_PUBLIC_WS_BASE "$NGROK_URL"
update_env_var NEXT_PUBLIC_ASSETS_API_URL "$NGROK_URL"
update_env_var NEXT_PUBLIC_ASSETS_WS_URL "$NGROK_URL"

log "Ngrok tunnel ready at ${NGROK_URL}"
log "Updated callback URLs"

STRIPE_SECRET_KEY=$(read_env STRIPE_SECRET_KEY || true)
if [ -z "$STRIPE_SECRET_KEY" ]; then
  log "STRIPE_SECRET_KEY missing in ${ENV_FILE}; skipping webhook registration."
  exit 0
fi

if ensure_webhook; then
  log "Stripe webhook configuration complete."
else
  log "Stripe webhook configuration failed."
  exit 1
fi

# Restart backend container to reload environment variables
BACKEND_CONTAINER=${BACKEND_CONTAINER:-backend-dev}
if command -v docker >/dev/null 2>&1; then
  log "Restarting backend container to apply new environment..."
  if docker restart "$BACKEND_CONTAINER" >/dev/null 2>&1; then
    log "Backend container restarted successfully."
  else
    log "Warning: Could not restart backend container (may need Docker socket access)"
  fi
else
  log "Docker CLI not available, skipping backend restart."
fi

log "Updater finished successfully."
