#!/usr/bin/env bash
# OneLocal rider payouts on Cashfree — one command to configure and deploy.
#
#   bash supabase/setup-payouts.sh                          configure + deploy (safe to re-run)
#   bash supabase/setup-payouts.sh verify-upi <vpa> "<name>"  check a UPI ID through Cashfree
#   bash supabase/setup-payouts.sh test-payout <amount>     sandbox only: pay the verified test account
#   bash supabase/setup-payouts.sh health
#
# Needs Node (npx), openssl, curl and: export SUPABASE_ACCESS_TOKEN=sbp_…
# Run supabase/setup-messaging.sh first if you want "payout sent" WhatsApp/SMS messages.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="${SUPABASE_PROJECT_REF:-ywylhzcxuoeilygzdonx}"
ENV_FILE="$HERE/.env.payouts"
NOTIFY_ENV="$HERE/.env.notify"
FN_URL="https://$REF.supabase.co/functions/v1/payouts"
API="https://api.supabase.com/v1/projects/$REF"
TEST_RIDER="setup-test-rider"

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }
supa() { if command -v supabase >/dev/null 2>&1; then (cd "$HERE/.." && supabase "$@"); else (cd "$HERE/.." && npx --yes supabase@latest "$@"); fi; }
getv() { local f="${2:-$ENV_FILE}"; [ -f "$f" ] || return 0; { grep -E "^$1=" "$f" || true; } | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
ensure() {
  if [ -z "$(getv "$1")" ]; then
    { grep -v -E "^$1=" "$ENV_FILE" || true; } > "$ENV_FILE.tmp"
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  fi
}
mgmt() { curl -sS --fail-with-body -X "$1" "$API$2" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' ${3:+--data "$3"}; }
sql() { mgmt POST /database/query "$(node -e 'process.stdout.write(JSON.stringify({ query: process.argv[1] }))' "$1")" >/dev/null; }
fn() { curl -sS -X "$1" "$FN_URL$2" -H "x-payouts-secret: $(getv PAYOUTS_API_SECRET)" -H 'Content-Type: application/json' ${3:+--data "$3"}; echo; }

case "${1:-setup}" in
  health) fn GET /health; exit 0 ;;
  verify-upi)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || die 'usage: setup-payouts.sh verify-upi <vpa> "<account holder name>"'
    fn POST /accounts/verify "$(node -e 'process.stdout.write(JSON.stringify({ riderId: process.argv[1], riderName: process.argv[3], method: "upi", vpa: process.argv[2] }))' "$TEST_RIDER" "$2" "$3")"
    exit 0 ;;
  test-payout)
    [ "$(getv CASHFREE_ENV)" = "sandbox" ] || die "test-payout only runs with CASHFREE_ENV=sandbox"
    [ -n "${2:-}" ] || die "usage: setup-payouts.sh test-payout <amount in rupees>"
    fn POST /transfers "$(node -e 'process.stdout.write(JSON.stringify({ riderId: process.argv[1], amount: Number(process.argv[2]), kind: "instant", idempotencyKey: "setup-" + Date.now() }))' "$TEST_RIDER" "$2")"
    exit 0 ;;
  setup) ;;
  *) die "unknown command: $1" ;;
esac

need node; need openssl; need curl
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "Set SUPABASE_ACCESS_TOKEN first (supabase.com/dashboard/account/tokens → Generate new token)"
if [ ! -f "$ENV_FILE" ]; then
  cp "$HERE/.env.payouts.example" "$ENV_FILE"
  warn "Created supabase/.env.payouts — add your Cashfree keys there, then run this again."
  exit 1
fi

say "Generating secrets (only the ones that are still empty)"
ensure PAYOUT_PAYLOAD_KEY "$(openssl rand -base64 32)"
ensure PAYOUTS_API_SECRET "$(openssl rand -hex 32)"
missing=()
for k in CASHFREE_PAYOUT_CLIENT_ID CASHFREE_PAYOUT_CLIENT_SECRET; do [ -n "$(getv $k)" ] || missing+=("$k"); done
[ ${#missing[@]} -eq 0 ] || die "Fill these in supabase/.env.payouts: ${missing[*]}"
[ -n "$(getv CASHFREE_PAYOUT_PUBLIC_KEY)" ] || warn "No CASHFREE_PAYOUT_PUBLIC_KEY: Cashfree will reject calls unless you whitelist an IP (Supabase has none)."
ok "Cashfree $(getv CASHFREE_ENV) keys present"

say "Linking Supabase project $REF"
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then supa link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD"; else supa link --project-ref "$REF"; fi

say "Applying database migrations (payout accounts, payouts, reconciliation job)"
supa db push

say "Uploading secrets"
filtered="$(mktemp)"
trap 'rm -f "$filtered"' EXIT
grep -E '^[A-Z0-9_]+=.+' "$ENV_FILE" > "$filtered"
if [ -n "$(getv NOTIFY_API_SECRET "$NOTIFY_ENV")" ]; then
  # "Payout sent" WhatsApp/SMS through the messaging function.
  printf 'NOTIFY_URL=https://%s.supabase.co/functions/v1/notify\nNOTIFY_API_SECRET=%s\n' "$REF" "$(getv NOTIFY_API_SECRET "$NOTIFY_ENV")" >> "$filtered"
  ok "payout_sent messages enabled (messaging is set up)"
else
  warn "Messaging not set up: payouts work, but riders get no WhatsApp/SMS when money is sent"
fi
supa secrets set --project-ref "$REF" --env-file "$filtered"

say "Deploying the payouts function"
supa functions deploy payouts --project-ref "$REF" --no-verify-jwt

say "Starting payout reconciliation (stores the function URL and secret in Vault)"
if sql "do \$\$
declare v uuid;
begin
  select id into v from vault.secrets where name = 'payouts_api_secret';
  if v is null then perform vault.create_secret('$(getv PAYOUTS_API_SECRET)', 'payouts_api_secret'); else perform vault.update_secret(v, '$(getv PAYOUTS_API_SECRET)'); end if;
  select id into v from vault.secrets where name = 'payouts_sweep_url';
  if v is null then perform vault.create_secret('$FN_URL/sweep', 'payouts_sweep_url'); else perform vault.update_secret(v, '$FN_URL/sweep'); end if;
end \$\$;"; then ok "Reconciliation active (every minute)"; else warn "Could not write Vault secrets — see docs/PAYOUTS.md to add them in the SQL editor"; fi

say "Health check"
fn GET /health

cat <<NEXT

Next:
  • Cashfree dashboard → Payouts → Developers → Webhooks: add
      $FN_URL/webhooks/cashfree   (version v2, all transfer events)
  • Try it:  bash supabase/setup-payouts.sh verify-upi yourname@bank "Your Name"
             bash supabase/setup-payouts.sh test-payout 100        (sandbox only)
  • Your One Local server calls POST $FN_URL/transfers with header x-payouts-secret
    (value: PAYOUTS_API_SECRET in supabase/.env.payouts) — see OL-ui/rider/docs/PAYOUTS.md
NEXT
