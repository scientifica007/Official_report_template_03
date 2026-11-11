#!/usr/bin/env bash
# UX-ARCH-04: pre-cutover off-site backup helper for a trusted local machine.
# Does NOT deploy database changes or restore data.
set -euo pipefail
umask 077

PROJECT_REF="uxtsyzyotnohxvopgcmh"
if ! command -v supabase >/dev/null 2>&1; then
  echo "STOP: Supabase CLI is not installed. Follow the official CLI installation guide." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "STOP: Docker must be installed and running for Supabase CLI db dump." >&2
  exit 1
fi

echo "Obtain the Session Pooler connection URL for production from Supabase Dashboard -> Connect."
echo "Do NOT paste the connection URL in GitHub, a chat, a screenshot, or a terminal command history."
IFS= read -r -s -p "Production database connection URL (hidden): " DATABASE_URL
printf '\n'
trap 'unset DATABASE_URL' EXIT
case "$DATABASE_URL" in
  *"$PROJECT_REF"*) ;;
  *) echo "STOP: connection URL does not reference expected production project." >&2; exit 2;;
esac

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BASE_DIR="${HOME}/supabase-private-backups/ux-arch04-precutover-${STAMP}"
mkdir -p "$BASE_DIR"
chmod 700 "$BASE_DIR"

echo "Creating production backup in private local directory..."
supabase db dump --db-url "$DATABASE_URL" -f "$BASE_DIR/roles.sql" --role-only
supabase db dump --db-url "$DATABASE_URL" -f "$BASE_DIR/schema.sql"
supabase db dump --db-url "$DATABASE_URL" -f "$BASE_DIR/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

for item in roles.sql schema.sql data.sql; do
  if [[ ! -s "$BASE_DIR/$item" ]]; then
    echo "STOP: empty backup component $item; investigate before deploying." >&2
    exit 3
  fi
done
(cd "$BASE_DIR" && sha256sum roles.sql schema.sql data.sql > SHA256SUMS)
(cd "$BASE_DIR" && sha256sum -c SHA256SUMS)
{
  printf 'UTC_BACKUP_CREATED=%s\n' "$STAMP"
  supabase --version
  printf 'PROJECT_REF=%s\n' "$PROJECT_REF"
  printf 'STATUS=application SQL dump generated; auth/storage recovery and restore rehearsal NOT verified\n'
} > "$BASE_DIR/MANIFEST.txt"
chmod 600 "$BASE_DIR"/*
printf '\nBackup files created in: %s\n' "$BASE_DIR"
echo "IMPORTANT: Keep these files private, encrypt a second copy off-site, and test recovery before production cutover."
echo "IMPORTANT: Supabase CLI may omit managed auth and storage schemas. This is not a complete Supabase service backup; verify Auth user recovery separately."\necho "This backup does not include actual Storage API objects; back them up separately if present."
