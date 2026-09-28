#!/usr/bin/env bash
# OneLocal messaging — one command to put WhatsApp → SMS (and email) live.
#
#   bash supabase/setup-messaging.sh                     configure + deploy (safe to re-run)
#   bash supabase/setup-messaging.sh test <phone>        send a real sign-in code (WhatsApp → SMS)
#   bash supabase/setup-messaging.sh test <phone> sms    …by SMS only
#   bash supabase/setup-messaging.sh test <phone> whatsapp   …by WhatsApp only
#   bash supabase/setup-messaging.sh health              which providers are live
#
# Needs Node (npx), openssl, curl and a Supabase personal access token:
#   export SUPABASE_ACCESS_TOKEN=sbp_…     (supabase.com/dashboard/account/tokens)
# Optional: SUPABASE_DB_PASSWORD (skips the password prompt), SUPABASE_PROJECT_REF.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="${SUPABASE_PROJECT_REF:-ywylhzcxuoeilygzdonx}"
ENV_FILE="$HERE/.env.notify"
FN_URL="https://$REF.supabase.co/functions/v1/notify"
API="https://api.supabase.com/v1/projects/$REF"

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

supa() {
  if command -v supabase >/dev/null 2>&1; then (cd "$HERE/.." && supabase "$@"); else (cd "$HERE/.." && npx --yes supabase@latest "$@"); fi
}

# Value of KEY in .env.notify (surrounding quotes removed).
getv() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# Writes KEY=VALUE only when KEY is missing or empty, so generated secrets never change.
ensure() {
  if [ -z "$(getv "$1")" ]; then
    { grep -v -E "^$1=" "$ENV_FILE" || true; } > "$ENV_FILE.tmp"
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  fi
}

mgmt() { # METHOD PATH [JSON] — Supabase Management API
  curl -sS --fail-with-body -X "$1" "$API$2" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' ${3:+--data "$3"}
}

sql() { mgmt POST /database/query "$(node -e 'process.stdout.write(JSON.stringify({ query: process.argv[1] }))' "$1")" >/dev/null; }

health() { curl -sS "$FN_URL/health" -H "x-notify-secret: $(getv NOTIFY_API_SECRET)"; echo; }

send_test() {
  local phone="${1:-}" channel="${2:-auto}" policy='' otp
  [ -n "$phone" ] || die "usage: bash supabase/setup-messaging.sh test <10-digit phone> [sms|whatsapp]"
  case "$channel" in
    sms) policy=',"policy":"sms_only"' ;;
    whatsapp) policy=',"policy":"whatsapp_only"' ;;
    auto) ;;
    *) die "channel must be sms or whatsapp" ;;
  esac
  otp=$(printf '%06d' $(( 16#$(openssl rand -hex 3) % 1000000 )))
  say "Sending sign-in code $otp to $phone ($channel)"
  curl -sS -X POST "$FN_URL/send" -H "x-notify-secret: $(getv NOTIFY_API_SECRET)" -H 'Content-Type: application/json' \
    --data "{\"template\":\"login_otp\",\"to\":{\"phone\":\"$phone\"},\"params\":{\"otp\":\"$otp\"}$policy}"
  echo
  echo 'phone.channel tells you what was used; fallbackReason says why SMS was used instead of WhatsApp.'
}

case "${1:-setup}" in
  test) [ -f "$ENV_FILE" ] || die "Run the setup first"; send_test "${2:-}" "${3:-auto}"; exit 0 ;;
  health) [ -f "$ENV_FILE" ] || die "Run the setup first"; health; exit 0 ;;
  setup) ;;
  *) die "unknown command: $1" ;;
esac

need node; need openssl; need curl
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "Set SUPABASE_ACCESS_TOKEN first (supabase.com/dashboard/account/tokens → Generate new token)"

if [ ! -f "$ENV_FILE" ]; then
  cp "$HERE/.env.notify.example" "$ENV_FILE"
  warn "Created supabase/.env.notify — add your WhatsApp / SMS / email keys there, then run this again."
  exit 1
fi

say "Generating secrets (only the ones that are still empty)"
ensure MESSAGE_HASH_PEPPER "$(openssl rand -hex 32)"
ensure MESSAGE_PAYLOAD_KEY "$(openssl rand -base64 32)"
ensure NOTIFY_API_SECRET "$(openssl rand -hex 32)"
ensure META_WEBHOOK_VERIFY_TOKEN "$(openssl rand -hex 16)"
ensure SEND_SMS_HOOK_SECRET "v1,whsec_$(openssl rand -base64 32)"
ensure NOTIFY_PUBLIC_URL "$FN_URL"
ok "supabase/.env.notify is complete (keep it private)"

say "Checking provider keys"
missing=()
case "$(getv WHATSAPP_PROVIDER)" in
  meta) for k in META_WA_ACCESS_TOKEN META_WA_PHONE_NUMBER_ID META_APP_SECRET; do [ -n "$(getv $k)" ] || missing+=("$k"); done ;;
  twilio) for k in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_WHATSAPP_FROM; do [ -n "$(getv $k)" ] || missing+=("$k"); done ;;
esac
case "$(getv SMS_PROVIDER)" in
  msg91) for k in MSG91_AUTH_KEY MSG91_FLOW_LOGIN_OTP; do [ -n "$(getv $k)" ] || missing+=("$k"); done ;;
  twilio) for k in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN; do [ -n "$(getv $k)" ] || missing+=("$k"); done ;;
esac
case "$(getv EMAIL_PROVIDER)" in
  resend) for k in RESEND_API_KEY EMAIL_FROM; do [ -n "$(getv $k)" ] || missing+=("$k"); done ;;
esac
if [ ${#missing[@]} -gt 0 ]; then
  die "Fill these in supabase/.env.notify (or set that provider to none): ${missing[*]}"
fi
ok "WhatsApp: $(getv WHATSAPP_PROVIDER) · SMS: $(getv SMS_PROVIDER) · email: $(getv EMAIL_PROVIDER)"

say "Linking Supabase project $REF"
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then supa link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD"; else supa link --project-ref "$REF"; fi

say "Applying database migrations (message log, WhatsApp cache, fallback timer)"
supa db push

say "Uploading secrets to the function"
filtered="$(mktemp)"
trap 'rm -f "$filtered"' EXIT
grep -E '^[A-Z0-9_]+=.+' "$ENV_FILE" > "$filtered"
supa secrets set --project-ref "$REF" --env-file "$filtered"

say "Deploying the notify function"
supa functions deploy notify --project-ref "$REF" --no-verify-jwt

say "Starting the SMS fallback timer (stores the function URL and secret in Vault)"
if sql "do \$\$
declare v uuid;
begin
  select id into v from vault.secrets where name = 'notify_api_secret';
  if v is null then perform vault.create_secret('$(getv NOTIFY_API_SECRET)', 'notify_api_secret'); else perform vault.update_secret(v, '$(getv NOTIFY_API_SECRET)'); end if;
  select id into v from vault.secrets where name = 'notify_sweep_url';
  if v is null then perform vault.create_secret('$FN_URL/sweep', 'notify_sweep_url'); else perform vault.update_secret(v, '$FN_URL/sweep'); end if;
end \$\$;"; then ok "Fallback timer active (every 15 s)"; else warn "Could not write Vault secrets — see docs/MESSAGING.md step 6 to do it in the SQL editor"; fi

say "Pointing Supabase sign-in codes at the function (Send SMS hook)"
hook_body=$(node -e 'process.stdout.write(JSON.stringify({ external_phone_enabled: true, hook_send_sms_enabled: true, hook_send_sms_uri: process.argv[1], hook_send_sms_secrets: process.argv[2] }))' "$FN_URL/hooks/send-sms" "$(getv SEND_SMS_HOOK_SECRET)")
if mgmt PATCH /config/auth "$hook_body" >/dev/null; then
  ok "Sign-in codes now go WhatsApp → SMS"
else
  warn "Set it in the dashboard: Authentication → Hooks → Send SMS → HTTPS → $FN_URL/hooks/send-sms with the secret SEND_SMS_HOOK_SECRET from supabase/.env.notify"
fi

say "Health check"
health

cat <<NEXT

Next:
  • Meta webhook (delivery reports → faster SMS fallback): App → WhatsApp → Configuration
      Callback URL:  $FN_URL/webhooks/meta
      Verify token:  $(getv META_WEBHOOK_VERIFY_TOKEN)      then subscribe to "messages"
  • Real test:       bash supabase/setup-messaging.sh test <your 10-digit phone>
  • App, live codes: cd OL-ui/rider && npm run start:live
                     npx eas-cli@latest build -p android --profile preview-live
NEXT
