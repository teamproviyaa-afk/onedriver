#!/usr/bin/env bash
# OneLocal rider cash deposits on Cashfree Payment Gateway — one command to configure and deploy.
#
#   bash supabase/setup-payments.sh                              configure + deploy (safe to re-run)
#   bash supabase/setup-payments.sh test-deposit <amount> <phone>  create a payment link and print it
#   bash supabase/setup-payments.sh status <deposit id>
#   bash supabase/setup-payments.sh health
#
# Needs Node (npx), openssl, curl and: export SUPABASE_ACCESS_TOKEN=sbp_…
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="${SUPABASE_PROJECT_REF:-ywylhzcxuoeilygzdonx}"
ENV_FILE="$HERE/.env.payments"
FN_URL="https://$REF.supabase.co/functions/v1/payments"
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
fn() { curl -sS -X "$1" "$FN_URL$2" -H "x-payments-secret: $(getv PAYMENTS_API_SECRET)" -H 'Content-Type: application/json' ${3:+--data "$3"}; echo; }
keyenv() { case "$(getv CASHFREE_PG_SECRET_KEY)" in cfsk_ma_prod_*) echo production ;; cfsk_ma_test_*) echo sandbox ;; *) echo unknown ;; esac; }

case "${1:-setup}" in
  health) fn GET /health; exit 0 ;;
  status)
    [ -n "${2:-}" ] || die "usage: setup-payments.sh status <deposit id>"
    fn GET "/deposits/$2"; exit 0 ;;
  test-deposit)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || die "usage: setup-payments.sh test-deposit <amount in rupees> <10-digit phone>"
    [ "$(keyenv)" = "production" ] && warn "Production keys: paying this link moves real money (₹$2) into your Cashfree account."
    fn POST /deposits "$(node -e 'process.stdout.write(JSON.stringify({ riderId: process.argv[1], amount: Number(process.argv[2]), idempotencyKey: "setup-" + Date.now(), customer: { phone: process.argv[3], name: "OneLocal setup test" } }))' "$TEST_RIDER" "$2" "$3")"
    echo "Open checkoutUrl above to pay, then: bash supabase/setup-payments.sh status <id>"
    exit 0 ;;
  setup) ;;
  *) die "unknown command: $1" ;;
esac

need node; need openssl; need curl
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "Set SUPABASE_ACCESS_TOKEN first (supabase.com/dashboard/account/tokens → Generate new token)"
if [ ! -f "$ENV_FILE" ]; then
  cp "$HERE/.env.payments.example" "$ENV_FILE"
  warn "Created supabase/.env.payments — add your Cashfree App ID and Secret Key there, then run this again."
  exit 1
fi

say "Checking the Cashfree keys"
missing=()
for k in CASHFREE_PG_APP_ID CASHFREE_PG_SECRET_KEY; do [ -n "$(getv $k)" ] || missing+=("$k"); done
[ ${#missing[@]} -eq 0 ] || die "Fill these in supabase/.env.payments: ${missing[*]}"
case "$(keyenv)" in
  production) warn "PRODUCTION keys — deposits are real payments" ;;
  sandbox) ok "Test (sandbox) keys" ;;
  *) warn "Could not tell sandbox from production from the secret key; set CASHFREE_PG_ENV in supabase/.env.payments" ;;
esac

say "Generating secrets (only the ones that are still empty)"
ensure PAYMENTS_API_SECRET "$(openssl rand -hex 32)"
ok "PAYMENTS_API_SECRET ready"

say "Linking Supabase project $REF"
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then supa link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD"; else supa link --project-ref "$REF"; fi

say "Applying database migrations (cash deposits, reconciliation job)"
supa db push

say "Uploading secrets"
filtered="$(mktemp)"
trap 'rm -f "$filtered"' EXIT
grep -E '^[A-Z0-9_]+=.+' "$ENV_FILE" > "$filtered"
supa secrets set --project-ref "$REF" --env-file "$filtered"

say "Deploying the payments function"
supa functions deploy payments --project-ref "$REF" --no-verify-jwt

say "Starting deposit reconciliation (stores the function URL and secret in Vault)"
if sql "do \$\$
declare v uuid;
begin
  select id into v from vault.secrets where name = 'payments_api_secret';
  if v is null then perform vault.create_secret('$(getv PAYMENTS_API_SECRET)', 'payments_api_secret'); else perform vault.update_secret(v, '$(getv PAYMENTS_API_SECRET)'); end if;
  select id into v from vault.secrets where name = 'payments_sweep_url';
  if v is null then perform vault.create_secret('$FN_URL/sweep', 'payments_sweep_url'); else perform vault.update_secret(v, '$FN_URL/sweep'); end if;
end \$\$;"; then ok "Reconciliation active (every minute)"; else warn "Could not write Vault secrets — see OL-ui/rider/docs/PAYMENTS.md to add them in the SQL editor"; fi

say "Health check"
fn GET /health

cat <<NEXT

Next:
  • Cashfree dashboard → Payment Gateway → Developers → Webhooks: add
      $FN_URL/webhooks/cashfree   (payment link + payment success/failed events)
    (each link also carries this notify URL, so payments are confirmed even before you add it)
  • Try it:  bash supabase/setup-payments.sh test-deposit 1 <your 10-digit phone>
  • Your One Local server calls POST $FN_URL/deposits with header x-payments-secret
    (value: PAYMENTS_API_SECRET in supabase/.env.payments) — see OL-ui/rider/docs/PAYMENTS.md
NEXT
