#!/usr/bin/env bash
# OneLocal rider KYC on Cashfree Secure ID — one command to configure and deploy.
#
#   bash supabase/setup-kyc.sh                               configure + deploy (safe to re-run)
#   bash supabase/setup-kyc.sh test-pan <PAN> "<name>"       verify a PAN (billed in production)
#   bash supabase/setup-kyc.sh test-digilocker               start DigiLocker and print the link
#   bash supabase/setup-kyc.sh complete <verificationId> "<name as on Aadhaar>"
#   bash supabase/setup-kyc.sh health
#
# Needs Node (npx), openssl, curl and: export SUPABASE_ACCESS_TOKEN=sbp_…
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="${SUPABASE_PROJECT_REF:-ywylhzcxuoeilygzdonx}"
ENV_FILE="$HERE/.env.kyc"
FN_URL="https://$REF.supabase.co/functions/v1/kyc"
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
fn() { curl -sS -X "$1" "$FN_URL$2" -H "x-kyc-secret: $(getv KYC_API_SECRET)" -H 'Content-Type: application/json' ${3:+--data "$3"}; echo; }
json() { node -e 'const [k, ...kv] = process.argv.slice(1); const o = {}; for (let i = 0; i < kv.length; i += 2) o[kv[i]] = kv[i + 1]; process.stdout.write(JSON.stringify(o))' _ "$@"; }
keyenv() { case "$(getv CASHFREE_SECURE_ID_CLIENT_SECRET)" in cfsk_ma_prod_*) echo production ;; cfsk_ma_test_*) echo sandbox ;; *) echo unknown ;; esac; }

case "${1:-setup}" in
  health) fn GET /health; exit 0 ;;
  test-pan)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || die 'usage: setup-kyc.sh test-pan <PAN> "<name>"'
    [ "$(keyenv)" = "production" ] && warn "Production keys: Cashfree bills this check."
    fn POST /pan "$(json riderId "$TEST_RIDER" riderName "$3" pan "$2")"; exit 0 ;;
  test-digilocker)
    fn POST /digilocker/start "$(json riderId "$TEST_RIDER")"
    echo 'Open the url above, sign in to DigiLocker, then: bash supabase/setup-kyc.sh complete <verificationId> "<your name>"'
    exit 0 ;;
  complete)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || die 'usage: setup-kyc.sh complete <verificationId> "<name as on Aadhaar>"'
    fn POST /digilocker/complete "$(json riderId "$TEST_RIDER" verificationId "$2" riderName "$3")"; exit 0 ;;
  setup) ;;
  *) die "unknown command: $1" ;;
esac

need node; need openssl; need curl
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "Set SUPABASE_ACCESS_TOKEN first (supabase.com/dashboard/account/tokens → Generate new token)"
if [ ! -f "$ENV_FILE" ]; then
  cp "$HERE/.env.kyc.example" "$ENV_FILE"
  warn "Created supabase/.env.kyc — add your Cashfree Secure ID Client ID, Client Secret and Public Key there, then run this again."
  exit 1
fi

say "Checking the Cashfree Secure ID keys"
missing=()
for k in CASHFREE_SECURE_ID_CLIENT_ID CASHFREE_SECURE_ID_CLIENT_SECRET; do [ -n "$(getv $k)" ] || missing+=("$k"); done
[ ${#missing[@]} -eq 0 ] || die "Fill these in supabase/.env.kyc: ${missing[*]}"
case "$(keyenv)" in
  production) warn "PRODUCTION keys — every check is billed by Cashfree" ;;
  sandbox) ok "Test (sandbox) keys" ;;
  *) warn "Could not tell sandbox from production from the secret; set CASHFREE_SECURE_ID_ENV in supabase/.env.kyc" ;;
esac
[ -n "$(getv CASHFREE_SECURE_ID_PUBLIC_KEY)" ] || warn "No CASHFREE_SECURE_ID_PUBLIC_KEY: Cashfree will answer 'IP not whitelisted' (Supabase has no fixed IP). Add the 2FA public key."

say "Generating secrets (only the ones that are still empty)"
ensure KYC_PAYLOAD_KEY "$(openssl rand -base64 32)"
ensure KYC_API_SECRET "$(openssl rand -hex 32)"
ok "KYC_PAYLOAD_KEY and KYC_API_SECRET ready"

say "Linking Supabase project $REF"
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then supa link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD"; else supa link --project-ref "$REF"; fi

say "Applying database migrations (KYC profiles, checks, Aadhaar photo purge)"
supa db push

say "Uploading secrets"
filtered="$(mktemp)"
trap 'rm -f "$filtered"' EXIT
grep -E '^[A-Z0-9_]+=.+' "$ENV_FILE" > "$filtered"
supa secrets set --project-ref "$REF" --env-file "$filtered"

say "Deploying the kyc function"
supa functions deploy kyc --project-ref "$REF" --no-verify-jwt

say "Health check"
fn GET /health

cat <<NEXT

Next:
  • Try it:  bash supabase/setup-kyc.sh test-pan ABCDE1234F "Your Name"
             bash supabase/setup-kyc.sh test-digilocker
  • Your One Local server calls $FN_URL/<check> with header x-kyc-secret
    (value: KYC_API_SECRET in supabase/.env.kyc) — see OL-ui/rider/docs/KYC.md
NEXT
