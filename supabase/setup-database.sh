#!/usr/bin/env bash
# OneLocal Rider database schema — one command to apply it to the Supabase project.
#
#   bash supabase/setup-database.sh          show the pending migrations, then apply them (safe to re-run)
#   bash supabase/setup-database.sh seed     the same, plus the Latur development seed (dev / staging only)
#   bash supabase/setup-database.sh status   list applied and pending migrations
#
# Needs Node (npx) and: export SUPABASE_ACCESS_TOKEN=sbp_…  (optional: SUPABASE_DB_PASSWORD)
# Schema reference: OL-ui/rider/docs/DATABASE.md
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="${SUPABASE_PROJECT_REF:-ywylhzcxuoeilygzdonx}"

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
supa() { if command -v supabase >/dev/null 2>&1; then (cd "$HERE/.." && supabase "$@"); else (cd "$HERE/.." && npx --yes supabase@latest "$@"); fi; }

mode="${1:-apply}"
case "$mode" in
  apply | seed | status) ;;
  *) die "usage: setup-database.sh [seed|status]" ;;
esac
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "export SUPABASE_ACCESS_TOKEN=sbp_… first (supabase.com/dashboard/account/tokens)"

say "Linking Supabase project $REF"
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then supa link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD"; else supa link --project-ref "$REF"; fi

if [ "$mode" = status ]; then
  supa migration list
  exit 0
fi

say "Pending migrations"
if [ "$mode" = seed ]; then supa db push --dry-run --include-seed; else supa db push --dry-run; fi

say "Applying the schema (PostGIS, riders, delivery engine, money, RLS)"
if [ "$mode" = seed ]; then
  warn "Seeding Latur development data — never run this on the One Local Master database"
  supa db push --include-seed
else
  supa db push
fi
ok "Schema up to date"
echo "Tables, rules and the spec mapping: OL-ui/rider/docs/DATABASE.md"
